import { findNeighbors } from "./neighbors.js"
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8.5/+esm'
import gaussian from 'https://cdn.jsdelivr.net/npm/gaussian@1.3.0/+esm'


export function spatialAutocorrelation(spatialData, valueProperty, options={}) {
  const LOCAL_METHOD_SET = new Set(["local_geary_c", "local_moran_i", "getis_ord_g", "getis_ord_g*"])
  const GLOBAL_METHOD_SET = new Set(["moran_i", "geary_c", "getis_ord_general_g"])

  let {
    method = "local_moran_i",
    permutations = 999,
    pCutoff = 0.05,
    weightTuples = null,
    distributionBins = 10,
  } = options
  
  if (!LOCAL_METHOD_SET.has(method) && !GLOBAL_METHOD_SET.has(method)) {
    throw new Error(`Method '${method}' not supported. See documentation for list of supported methods`)
  }

  // 'valueProperty' can be a retrieval function or a feature property string
  if (typeof valueProperty == "string") {
    const propertyName = valueProperty
    valueProperty = d => d[propertyName]
  }

  let spatialRows = null
  let validFeatures = null 
  if (spatialData?.type == "FeatureCollection") {
    validFeatures = spatialData.features.filter(feature => Number.isFinite(valueProperty(feature.properties)))
    spatialRows = validFeatures.map(feature => ({id: feature.id, value: valueProperty(feature.properties)}))
  } else if (options.weightTuples) {
    spatialRows = spatialData.map(d => ({id: d.id, value: valueProperty(d)}))
  } else  {
    throw new Error(`If spatialData argument is not a FeatureCollection, the 'weightTuples' options must be defined`)
  }
  valueProperty = d => d.value
  spatialRows = spatialRows.filter(d => Number.isFinite(valueProperty(d)))

  if (spatialRows.length == 0) {
    throw new Error("Given the 'valueProperty' definition and 'spatialData', no valid spatial data was found.")
  }

  // Sort out the weight matrix
  if (weightTuples == null) {
    console.log("[Autocorrelation] No weight tuples supplied so defaulting to normalized queen contiguity weights")
    weightTuples = calculateEqualContiguousWeightTuples(validFeatures, "queen")
  }
  const weightMatrix = new WeightMatrix(weightTuples)

  const valueIndex = calculateZscoreIndex(spatialRows, valueProperty)
  const cutoffCount = Math.floor(pCutoff*(permutations+1)-1)

  if (LOCAL_METHOD_SET.has(method)) {
    const maxNeighbors = d3.max(weightMatrix.weightMap.values(), d => d.size)

    // Store permutation samples for faster computation - worse memory efficiency. We sample one more than then # of
    // maximum neighbors so that we have a bonus value to use when needed (see below!)
    const idValuePairs = [...valueIndex.entries()]
    const samples = [] 
    for (let i = 0; i < permutations; i++) {
      d3.shuffle(idValuePairs)
      samples.push(idValuePairs.slice(0, maxNeighbors+1))
    }

    const results = [] 
    for (const spatialRow of spatialRows) {
      const value = valueIndex.get(spatialRow.id)
      const neighborIdWeightPairs = weightMatrix.getWeightPairs(spatialRow.id)
      const neighborValueWeightPairs = neighborIdWeightPairs.map(([id, w]) => [valueIndex.get(id), w])
      const lag = calcLag(neighborValueWeightPairs)

      // Choose the requested local autocorrelation method
      let localCorrelation = null 
      if (method == "local_geary_c") {
        localCorrelation = (valueWeightPairs) => 
          d3.sum(valueWeightPairs, ([neighborValue,w]) => w*(((value-neighborValue))**2))
      } else if (method == "local_moran_i") {
        localCorrelation = 
          (valueWeightPairs) => ((value)*d3.sum(valueWeightPairs, ([neighborValue,w]) => w*(neighborValue)))
      } else if (method == "getis_ord_g") {
        // const offset = 1 // An offset is necessary to prevent a denominator close or equal to 0. 
        // const getisDenom =
        //    d3.sum([...valueIndex.entries()].filter(([id,_]) => id != spatialRow.id), ([_,value]) => value+offset)
        // localCorrelation = (valueWeightPairs) => 
        //   d3.sum(valueWeightPairs, ([neighborValue,w]) => w*(neighborValue+offset)) / getisDenom 

        // TODO: This could be simpifiable because z-values, but I got it wrong the first time so let's be careful!
        const otherValues = [...valueIndex.entries()].filter(([id,]) => id != spatialRow.id).map(d => d[1])
        const mean = d3.mean(otherValues)

        const S = d3.variance(otherValues)
        localCorrelation = (valueWeightPairs) => {
          const lag = calcLag(valueWeightPairs)
          const denom = S*Math.sqrt((otherValues.length*d3.sum(valueWeightPairs, ([_,w]) => w**2) - 1)/(otherValues.length-1))
          return (lag-mean) / denom 
        }
      } else if (method == "getis_ord_g*") {
        const offset = 1 // An offset is necessary to prevent a denominator close or equal to 0. 
        let getisDenom = d3.sum([...valueIndex.entries()], ([_,value]) => value + offset)
        localCorrelation =
           (valueWeightPairs) => (d3.sum(valueWeightPairs, ([neighborValue,w]) => w*(neighborValue+offset))-offset) / getisDenom 
      }

      // Populate the basic elements of the result, including the statistic value itself
      const statistic = localCorrelation(neighborValueWeightPairs)
      const result = { id: spatialRow.id, value: valueProperty(spatialRow), z: value, lag, statistic }

      // Perform random permutations to calculate pseudo p-values
      if (permutations) {
        const permutedStatistics = [] 
        for (const sample of samples) {
          // Permutation neighbor samples shouldn't include the focal value itself. If it does, then take the bonus value.
          let permuteSample = sample.slice(0, value.length)
          permuteSample = permuteSample.filter(([id,_]) => id != spatialRow.id)
          if (permuteSample.length < neighborIdWeightPairs.length) {
            permuteSample.push(sample.at(-1))
          }
  
          const sampleValueWeightPairs = neighborIdWeightPairs.map(([_, w], i) => [permuteSample[i][1], w])
          const permutedStatistic = localCorrelation(sampleValueWeightPairs)
          permutedStatistics.push(permutedStatistic)
        }
        result.expectedStatistic = d3.mean(permutedStatistics) // TODO: Check if this is right!

        Object.assign(result, calculatePseudoPvalue(statistic, permutedStatistics, cutoffCount, distributionBins))
      }
      
      results.push(result)
    }

    for (const result of results) {
      localAutocorrelationAssignLabel(result, pCutoff, method)
    }

    return results
  } else {
    const values = [...valueIndex.values()]
    const ids = [...valueIndex.keys()]

    let globalCorrelation = null
    if (method == "moran_i") {
      const mean = d3.mean(values)
      const denom = d3.sum(values, d => (d-mean)**2)
      globalCorrelation = (valueIndex) => {
        const moran = d3.sum(ids, id => {
          const weightPairs = weightMatrix.getWeightPairs(id)
          const lag = d3.sum(weightPairs, ([id,w]) => (valueIndex.get(id)-mean) * w)
          return (valueIndex.get(id)-mean) * lag
        })
        return moran / denom
      }
    } else if (method == "geary_c") {
      // TODO: Check this (no reference in GeoDa)
      const mean = d3.mean(values)
      const denom = 2 * values.length * d3.sum(values, d => (d-mean)**2) / (values.length-1)
      globalCorrelation = (valueIndex) => {
        const geary = d3.sum(ids, id1 => {
          const weightPairs = weightMatrix.getWeightPairs(id1)
          return d3.sum(weightPairs, ([id2,w]) => w * (valueIndex.get(id1) - valueIndex.get(id2))**2)
        })
        return geary / denom     
      }
    } else if (method == "getis_ord_general_g") {
      const offset = 1 // An offset is necessary to prevent a denominator close or equal to 0. 

      let denom = 0
      for (let i = 0; i < values.length; i++) {
        for (let j = 0; j < values.length; j++) {
          denom += (values[i]+offset) * (values[j]+offset)
        }
      }
      globalCorrelation = (valueIndex) => {
        const getis = d3.sum(ids, id1 => {
          const weightPairs = weightMatrix.getWeightPairs(id1)
          return d3.sum(weightPairs, ([id2,w]) => w * (valueIndex.get(id1)+offset) * (valueIndex.get(id2)+offset))
        })
        return getis / denom     
      }
    }

    // Populate the basic elements of the result, including the statistic value itself
    const statistic = globalCorrelation(valueIndex)
    const result = {  statistic }

    if (permutations) {
      const permutedStatistics = []
      for (let i = 0; i < permutations; i++) {
        d3.shuffle(values)
        const permValueIndex = new Map(ids.map((id,i) => [id, values[i]]))
        permutedStatistics.push(globalCorrelation(permValueIndex))
      }

      Object.assign(result, calculatePseudoPvalue(statistic, permutedStatistics, cutoffCount, distributionBins))
    }

    globalCorrelationAssignLabel(result, pCutoff, method)
    return result 
  }
}

export function calculateEqualContiguousWeightTuples(featureCollection, method) {
  const neighborPairs = findNeighbors(featureCollection, method)
  return equalWeightTuples(neighborPairs)
}

function calcLag(neighborValueWeightPairs) {
  const wSum = d3.sum(neighborValueWeightPairs.filter(d => Number.isFinite(d[0])), d => d[1])
  neighborValueWeightPairs.forEach(d => d[1] = d[1] / wSum)
  const sum = d3.sum(neighborValueWeightPairs, ([value, w]) => value * w)
  return sum
}

function equalWeightTuples(neighborPairs) {
  const grouped = d3.flatGroup(neighborPairs, d => d[0])
  const tuples = []
  for (const [_, pairs] of grouped) {
    const w = 1/pairs.length 
    for (const [id1, id2] of pairs) {
      tuples.push([id1, id2, w])
    }
  }
  return tuples
}

function localAutocorrelationAssignLabel(result, pCutoff, method) {
  if (result.p < pCutoff) {
    if (method == "local_geary_c") {
      if (result.statistic > result.expectedStatistic) {
        result.label = "Negative spatial autocorrelation"
      } else if (result.statistic < result.expectedStatistic) {
        if (result.lag > 0 && result.z > 0) {
          result.label = "High-high"
        } else if (result.lag < 0 && result.z < 0) {
          result.label = "Low-low"
        } else {
          result.label = "Other positive spatial autocorrelation"
        }
      }
    } else if (method == "local_moran_i") {
      if (result.z > 0 && result.lag > 0) {
        result.label = "High-high"
      } else if (result.z > 0 && result.lag < 0) {
        result.label = "High-low"
      } else if (result.z < 0 && result.lag > 0) {
        result.label = "Low-high"
      } else if (result.z < 0 && result.lag < 0) {
        result.label = "Low-low"
      }
    } else if (method == "getis_ord_g" || method == "getis_ord_g*") {
      if (result.statistic > 0) {
        result.label = "High-high"
      } else if (result.statistic < 0) {
        result.label = "Low-low"
      }
    }
  } else {
    result.label = "Not significant"
  }
}

function globalCorrelationAssignLabel(result, pCutoff, method) {
  if (result.p < pCutoff) {
    if (method == "geary_c") {
      if (result.statistic > 1) {
        result.label = "Negative spatial autocorrelation"
      } else if (result.statistic < 1) {
        result.label = "Positive spatial autocorrelation"
      }
    } else if (method == "moran_i") {
      if (result.statistic < 0) {
        result.label = "Negative spatial autocorrelation"
      } else {
        result.label = "Positive spatial autocorrelation"
      }
    } else if (method == "getis_ord_general_g") {
      if (result.statistic > 0) {
        result.label = "Positive clustering"
      } else if (result.statistic < 0) {
        result.label = "Negative clustering"
      }
    }
  } else {
    result.label = "Not significant"
  }
}

function calculatePseudoPvalue(statistic, permutedStatistics, cutoffCount, distributionSnaps) {
  // And some useful bonus stuff, like boundaries and distributions
  permutedStatistics.sort((a,b) => a - b)

  let nMoreExtreme = permutedStatistics.filter(d => statistic > d).length
  nMoreExtreme = Math.min(permutedStatistics.length - nMoreExtreme, nMoreExtreme) 
  const p = (nMoreExtreme+1) / (permutedStatistics.length+1)

  const lowerCutoff = permutedStatistics.at(cutoffCount)
  const upperCutoff = permutedStatistics.at(-cutoffCount)

  const statisticMean = d3.mean(permutedStatistics)
  const statisticStd = d3.deviation(permutedStatistics)
  // const statisticZ = (statistic-mean)/std

  // const lowerCutoffZ = (lowerCutoff-mean)/std
  // const upperCutoffZ = (lowerCutoff-mean)/std

  const result = { p, lowerCutoff, upperCutoff, statisticMean, statisticStd }

  if (distributionSnaps) {
    result.permutationDistribution = estimateDistribution(permutedStatistics, distributionSnaps)
  }

  return result
}


function estimateDistribution(X, n=50, extent=null) {
  const normal = gaussian(0,1)
  const h = 0.9 * d3.deviation(X) * X.length ** (-1/5)
  const kernel = kde(X, d => normal.pdf(d), h)

  if (!extent) {
    extent = d3.extent(X)
  }

  // Normalize the value scale, takes away the "area under the curve = 1" element, but a good work-around for the 
  // side by side density plots which will have different scales.
  const points = d3.range(...extent, (extent[1]-extent[0])/n).map((d,i) => [d, kernel(d)])
  const max = d3.max(points, d => d[1])
  return points.map(([x,y]) => [x, y/max])
}

function kde(X, K, h) {
  return function (x) {
    let sum = 0 
    for (let xi of X) {
      sum += K((x - xi) / h)
    }
    return (1/(X.length*h)) * sum
  }
}

function calculateZscoreIndex(rows, valueFunction) {
  const mean = d3.mean(rows, valueFunction)
  const std = d3.deviation(rows, valueFunction)
  const zScores = rows.map(row => (valueFunction(row)-mean)/std)
  return new Map([...Object.entries(zScores)].map(([i, z]) => [rows[i].id, z]))
}



class WeightMatrix {
  constructor(weightTuples) {
    const weightMap = new Map() 
    weightTuples.forEach(([id1]) => weightMap.set(id1, new Map()))
    
    if (weightTuples) {
      for (const [id1, id2, w] of weightTuples) {
        weightMap.get(id1).set(id2, w)
      }
    }

    this.weightMap = weightMap
  }

  getWeights(id) {
    return this.weightMap.get(id)
  }

  getWeightPairs(id) {
    const weights = this.getWeights(id)
    return weights ? [...weights.entries()] : []
  }

  getWeight(id1, id2) {
    return this.weightMap.get(id1)?.get(id2)
  }

  set(id1, id2, value) {
    let map = this.weightMap.get(id1)
    if (!map) {
      map = new Map()
      this.weightMap.set(id1, map)
    }
    map.set(id2, value)
  }
}