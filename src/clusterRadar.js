
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.13/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8.5/+esm';
import { startTutorial } from "./tutorial.js";

import { addOpenableSettings, addPathSelectionBox, addPopperTooltip, cacheWithVersion, checkFileExists, downloadData, getPathsBoundingBox, hookCustomMultiSelect, hookSelect, unzipJson } from "./helper.js"
import { categoricalColorLegend, plotChoropleth } from './plots.js';
import { State } from './State.js';
import { hookExpandableCards } from './panel.js';
import { DataWizard } from './DataUploadWizard.js';


const N_CLUSTER_WORKERS = 1 

const CLUSTER_COLORS = [
  {label: "High-high", color: "#ff725c", group: "High cluster"},
  {label: "High-low", color: "#ffcac2", group: "Other"},
  {label: "Low-high", color: "#97bbf5", group: "Other"},
  {label: "Low-low", color: "#4269d0", group: "Low cluster"}, 
  {label: "Hot-spot", color: "#ff725c", group: "High cluster"},
  {label: "Cold-spot", color: "#4269d0", group: "Low cluster"}, 
  {label: "Other positive spatial autocorrelation", shortLabel: "Other positive", color: "#39c486", 
    group: "Other", partialGroups: ["High cluster", "Low cluster"]},
  {label: "Other negative spatial autocorrelation", shortLabel: "Other negative", color: "#be93c7",
    group: "Other"},
  {label: "Not significant", color: "whitesmoke"},
]

const GLOBAL_CLUSTER_COLORS = [
  {label: "Positive spatial autocorrelation", shortLabel: "Positive correlation", color: "#39c486"},
  {label: "Negative spatial autocorrelation", shortLabel: "Negative correlation", color: "#be93c7"},
  {label: "Positive clustering", shortLabel: "Hot-spot clustering", color:"#ff725c"},
  {label: "Negative clustering", shortLabel: "Cold-spot clustering", color:"#4269d0"},
  {label: "None", color: "whitesmoke"},
]

const LOCAL_GLOBAL_METHOD_MAP = new Map([
  ["local_moran_i", "moran_i"],
  ["local_geary_c", "geary_c"],
  ["getis_ord_g", "getis_ord_general_g"],
  ["getis_ord_g*", "getis_ord_general_g"]
])

const METHOD_NAMES = new Map([
  ["local_moran_i", "Local Moran's I"],
  ["local_geary_c", "Local Geary's C"],
  ["getis_ord_g", "Getis-Ord Gi"],
  ["getis_ord_g*", "Getis-Ord Gi*"],
  ["getis_ord_general_g", "Getis-Ord General G"],
  ["moran_i", "Moran's I"],
  ["geary_c", "Geary's C"],
  ["aggregate", "Aggregate"]
])

const GROUP_COLORS = [
  {group: "High cluster", label: "High cluster", color: "#ff725c"},
  {group: "Low cluster", label: "Low cluster", color: "#4269d0"},
  {group: "Other", label: "Other", color: "yellow"},
  {group: "Conflict", label: "Conflict", color: "#be93c7"},
]

const LOCAL_GLOBAL_MAP = new Map([
  ["local_moran_i", "moran_i"],
  ["local_geary_c", "geary_c"],
  ["getis_ord_g", "getis_ord_general_g"],
  ["getis_ord_g*", "getis_ord_general_g"],
])

const INITIAL_STATE =  {
  coloringMode: "cluster_agg",

  clusteringMethods: ["local_moran_i", "local_geary_c", "getis_ord_g*"],
  globalClusteringMethods: ["moran_i", "geary_c", "getis_ord_general_g"], 
  displayMode: {mode: "cluster_agg", method: "local_geary_c"},

  nameProperty: "name",
}


// =====================================================================================================================
// =====================================================================================================================

let state = {} // The main state, this is the stuff that will be cached
const stuff = {} // Random, non-dynamic things that don't need to be in state. 
const elements = {}

async function start() {
  stuff.url = new URL(window.location.href)

  populateElements()
  updateLoadingProgress({progress: 5, message: "Starting"})
  initializeColorStuff() 

  stuff.dataKey = getDataKey()
  
  const defaultDataFilepath = "data/results/" + stuff.dataKey + ".json.zip"
  const fileExists = await checkFileExists(defaultDataFilepath)
  if (fileExists) {
    updateLoadingProgress({progress: 10, message: "Loading default data"})
    unzipJson(defaultDataFilepath, stuff.dataKey + ".json").then(coreState => {
      state = coreState
      render()
    }) 
  } else {
    updateLoadingProgress({progress: 10, message: "Attempting cache load"})
    cacheWithVersion("coreState", stuff.dataKey, null).then(coreState => {
      //if (!state.finalized) finalizeState(coreState) 
      if (coreState) {
        state = coreState
        render() 
      } else {
        stuff.url.searchParams.delete("data")
        history.pushState(null, null, '?' + stuff.url.searchParams.toString())
        location.reload(true);
      }

    })
  }
}

function getDataKey() {
  let key = stuff.url.searchParams.get("data") ? 
    stuff.url.searchParams.get("data")  : "us_cancer_mortality_aa_sml"

  if (stuff.url.searchParams.get("methods")) {
    key += stuff.url.searchParams.get("methods")
  }

  return key
  
}

function tempStart() {
  populateElements()
  updateLoadingProgress({progress: 0.05, message: "Starting"})
  initializeColorStuff() 

  state =  {
    coloringMode: "cluster_agg",
  
    valueField: "age_adjusted_rate", 
    geoIdField: "county_code",
    timeField: "year",
    weightMethod: "queen",
    clusteringMethods: ["local_moran_i", "local_geary_c", "getis_ord_g*"],
    globalClusteringMethods: ["moran_i", "geary_c", "getis_ord_general_g"], 
    displayMode: {mode: "cluster_agg", method: "local_geary_c"},
    nameProperty: "name",
    nameField: "county",
   
    timestep: null,
    weightTuples: null,
    data: null,
    clusterJobs: [],
    clusterResults: null,
  
    // Interaction state 
    hover: null, 
    select: null,
    multiSelect: null 
  }

  async function loadData() {
    const geoData = await d3.json("data/geography/texas_counties.json")
    let valueData = await d3.csv("data/time_series/texasMortality.csv")
    return {geoData, valueData}
  }

  loadData().then((data) => {
    //state.data = data
    data.valueData = data.valueData.filter(d => d.year == "2019" || d.year == "2020")
    state.data = data


    // TODO: Remove
    const timesteps = [...new Set(state.data.valueData.map(d => d.year))].sort((a,b) => a - b)
    stuff.timesteps = timesteps.map(d => String(d))

    run()
  })

}

function populateElements() {
  elements.mainContainer = document.getElementById("main-container")
  elements.mapCard = document.getElementById("map-card")
  elements.mapCardContent = document.getElementById("map-card-content")
  elements.auxContainer = document.getElementById("aux-container")
  elements.mapPlotContainer = document.getElementById("map-plot-container")
  elements.mapColorLegend = document.getElementById("map-color-legend")
  elements.timeInputContainer = document.getElementById("time-input-container")
  elements.timeSlider = document.getElementById("time-slider")
  elements.timeLabel = document.getElementById("time-label")
  elements.auxCollapseToggle = document.getElementById("aux-collapse-toggle")
  elements.distributionContainer = document.getElementById("distribution-container")
  elements.distributionCardTopInfo = document.getElementById("distribution-card-top-info")
  elements.cellCardContent = document.getElementById("cell-card-content")
  elements.cellCardTopInfo = document.getElementById("cell-card-top-info")
  elements.timeSeriesCardContent = document.getElementById("time-series-card-content")
  elements.timeSeriesCardTopInfo = document.getElementById("time-series-card-top-info")
  elements.mapHistoryCardContent = document.getElementById("map-history-card-content")
  elements.downloadButton = document.getElementById("download-button")
  elements.selectionTooltip = document.getElementById("selection-tooltip")

  const cards = hookExpandableCards()
  stuff.mainCard = cards.find(d => d.id == "map-card") 
  stuff.auxCards = cards.filter(d => d.id != "map-card")

  elements.auxCollapseToggle.addEventListener("click", () => {
    elements.auxContainer.classList.toggle("collapsed")
  })

  elements.downloadButton.addEventListener("click", () => {
    downloadData(JSON.stringify(cachableState(state), null, 2), "spatial_clusters.json")
  })

  const otherElements = document.getElementById("other-elements")
  const dataWizardContainer = document.createElement("div")
  dataWizardContainer.setAttribute("id", "data-wizard")
  otherElements.appendChild(dataWizardContainer)

  stuff.openableSettings = []
  document.querySelectorAll(".settings-button").forEach(element => {
    let content = document.getElementById(element.getAttribute("for"))
    if (!content) {
      content = document.createElement("div")
      content.innerText = "Loading..."
    }
    stuff.openableSettings.push(addOpenableSettings(elements.mainContainer, element, element.getAttribute("label"), content))
  })


  document.getElementById("tutorial-button").addEventListener("click", () => startTutorial())

  // TODO: Move/remove
  //stuff.auxCards.forEach(card => card.setLoading(false))

  const dataUploadCallback = (result) => {
    stuff.url.searchParams.set("data", result.file)
    history.pushState(null, null, '?' + stuff.url.searchParams.toString())
    stuff.dataKey = getDataKey()

    stuff.openableSettings.forEach(d => d.setOpened(false))
    state = INITIAL_STATE
    for (const [k,v] of Object.entries(result)) {
      state[k] = v 
    }
    cacheWithVersion("coreState", stuff.dataKey, run)
  }

  //Daat
  const dataWizard = new DataWizard(dataWizardContainer, dataUploadCallback, {
    spatialDataDefaults: [{name: "us_counties.json", path: "data/geography/us_counties.json"}],
    vectorDataDefaults: [{name: "us-county_mortality_malignant-neoplasms_1999-2020.csv", 
      path: "data/time_series/us-county_mortality_malignant-neoplasms_1999-2020.csv"}]
    // spatialDataDefaults: [{name: "tx_counties.json", path: "data/geography/texas_counties.json"}],
    // vectorDataDefaults: [{name: "tx-mortality.csv", path: "data/time_series/texasMortality.csv"}]
  })

}

async function run(pastState) {
  if (pastState) {
    state = cachableState(pastState)
  }

  for (const row of state.data.valueData) {
    row[state.valueField] = parseFloat(row[state.valueField])
  }

  state.weightTuples = await calculateWeightTuples() 
  state.clusterResults = await calculateClusterResults()

  render()
  return cachableState(state)
}

function calculateClusterResults() {

  return new Promise((resolve, reject) => {
    const clusterWorkers = Array.from({length: N_CLUSTER_WORKERS}, () => 
      new Worker("src/workers/clusterWorker.js", {type: "module"}))

    const globalMethods = [...new Set(state.clusteringMethods.map(d => LOCAL_GLOBAL_METHOD_MAP.get(d)))]

    const clusterJobs = [] 
    const dataGroups = d3.flatGroup(state.data.valueData, row => row[state.timeField])
    for (const [timeValue, rows] of dataGroups) {
      const spatialData = rows.map(row => ({id: row[state.geoIdField], value: row[state.valueField]}))
      for (const method of state.clusteringMethods) {
        clusterJobs.push({method, timestep: timeValue, data: spatialData, completed: false})
      }
      for (const method of globalMethods) {
        clusterJobs.push({method, timestep: timeValue, data: spatialData, completed: false})
      }
    }

    let remainingJobs = clusterJobs.length

    function jobsFinished() {
      const localClusterResults = []
      for (const job of clusterJobs.filter(d => d.results && Array.isArray(d.results))) {
        job.results.forEach(result => {
          result.method = job.method
          result.timestep = job.timestep
          localClusterResults.push(result)
        })
      }

      const finalLocalClusterResults = []
      for (const [id, timestep, results] of d3.flatGroup(localClusterResults, d => d.id, d => d.timestep)) {
        const statistics = []
        for (const result of results) {
          const {method, statistic, p, label, lowerCutoff, upperCutoff, permutationDistribution, statisticMean, statisticStd} = result 
          statistics.push({method, statistic, p, label, lowerCutoff, upperCutoff, permutationDistribution, statisticMean, statisticStd})
        }
        const finalResult = { id , timestep, value: results[0].value, z: results[0].z, lag: results[0].lag, statistics } 
        finalLocalClusterResults.push(finalResult)
      }

      const globalClusterResults = [] 
      for (const job of clusterJobs.filter(d => d.results && !Array.isArray(d.results))) {
        const result = job.results 
        result.method = job.method
        result.timestep = job.timestep
        globalClusterResults.push(result)
      }

      clusterWorkers.forEach(worker => worker.terminate())
      resolve({local: finalLocalClusterResults, global: globalClusterResults})
    }

    function finishJob() {
      updateLoadingProgress({
        progress: 10 + 80 * ((clusterJobs.length-remainingJobs) / clusterJobs.length),
        message: "Clustering"
      })
      remainingJobs-- 
      if (remainingJobs == 0) {
        jobsFinished()
      }
    }

    for (const clusterWorker of clusterWorkers) {
      clusterWorker.onmessage = event => {
        const clusterJob = clusterJobs[event.data.jobIndex]
        clusterJob.completed = true
        clusterJob.results = event.data.clusterResults
        finishJob(clusterJob)
      }

      clusterWorker.onerror = error => {
        console.error(error)
        finishJob()
      }
    }

    clusterJobs.forEach((clusterJob, i) => {
      const clusterWorker = clusterWorkers[i % N_CLUSTER_WORKERS]

      clusterWorker.postMessage({
        jobIndex: i,
        method: clusterJob.method, 
        spatialData: clusterJob.data, 
        valueField: "value",
        options: {
          weightTuples: state.weightTuples
        }
      })
    })
  })
}

function calculateWeightTuples() {
  return new Promise((resolve, reject) => {
    const weightWorker = new Worker("src/workers/weightWorker.js", {type: "module"})
    weightWorker.onmessage = event => {
      const weightTuples = event.data 
      resolve(weightTuples)
      weightWorker.terminate()
    }
    weightWorker.onerror = (error) => {
      reject(error)
    }
    weightWorker.postMessage({featureCollection: state.data.geoData, method: state.weightMethod})
  })
}

function updateLoadingProgress(progress) {
  stuff.mainCard.setLoading(progress)
  //if (progress)  stuff.mainCard.setLoading(progress)

  if (progress) {
    stuff.auxCards.forEach(card => card.setLoading(true))
  } else {
    stuff.auxCards.forEach(card => card.setLoading(false))
  }
}

function render() {
  updateLoadingProgress(false)

  // --- Render set-up ---
  stuff.timesteps = [...new Set(state.clusterResults.local.map(d => d.timestep))]
    .map(d => [new Date(d), d])
    .sort((a,b) => a[0] - b[0])
    .map(d => d[1])

  finalizeState(state)
  
  const mean = d3.mean(state.clusterResults.local, d => d.value)
  const std = d3.deviation(state.clusterResults.local, d => d.value)
  stuff.standardRange = [mean-std*3, mean+std*3]
  stuff.standardExtendedRange = [mean-std*3.5, mean+std*3.5]
  stuff.valueMean = mean

  elements.timeSlider.setAttribute("max", stuff.timesteps.length-1)
  elements.timeSlider.setAttribute("value", stuff.timesteps.length-1)

  stuff.resultsByLocation = d3.group(state.clusterResults.local, d => d.id)
  stuff.valueDistribution = d3.bin().thresholds(20)(state.clusterResults.local.map(d => d.value)).map(bin => ({
    low: bin.x0, high: bin.x1, n: bin.length
  }))

  // ------

  //stuff.mainCard.setLoading(false)

  if (stuff.mapResizeObserver) {
    stuff.mapResizeObserver.disconnect()
  }
  const resizeObserver = new ResizeObserver(() => drawPlots())
  resizeObserver.observe(elements.mapPlotContainer)
  // resizeObserver.observe(elements.distributionContainer)
  // resizeObserver.observe(elements.cellCardContent)
  // resizeObserver.observe(elements.timeSeriesCardContent)
  stuff.mapResizeObserver = resizeObserver

  if (!localStorage.tutorialCompleted) {
    startTutorial()
    localStorage.tutorialCompleted = true
  }

}

function updateFocus() {
  drawDensityPlot()
  drawCellPlot()
  drawTimeSeriesPlot()
}

function drawPlots() {
  if (state.clusterResults == null) return

  elements.mapPlotContainer.innerHTML = ''

  const DRAW_DEBOUNCE = 200 
  clearTimeout(stuff.drawPlotsTimeout)

  stuff.drawPlotsTimeout = setTimeout(() => {
    plotClusterChoropleth(elements.mapPlotContainer, state.data.geoData)

    const mapSvg = elements.mapPlotContainer.querySelector("svg")
    stuff.areaPaths = d3.select(mapSvg)
      .select("g[aria-label='geo']")
      .selectAll("path")

      stuff.zoomRect = d3.select(mapSvg)
      .append("rect")
        .attr("visibility", "hidden") 
        .attr("stroke", "slategrey")
        .attr("fill", "none")
        .style("stroke-dasharray", "3,3")

    addPathSelectionBox(d3.select(mapSvg), stuff.areaPaths, selected => {
      state.multiSelect = new Set(selected.map(d => state.data.geoData.features[d].id))
    })

    updateMultiSelect()

    updateFocus()
  }, DRAW_DEBOUNCE)

  drawMainColorLegend()
}

function plotClusterChoropleth(plotContainer, geoData, timestep) {
  const plotOptions = {
    projection: {type: "albers-usa", domain: geoData},
    marks: [
      Plot.geo(geoData, {
        stroke: "lightgrey",
        strokeWidth: 0.3,
      })
    ]
  }
  const plotElement = plotChoropleth(plotContainer, plotOptions)
  addChoroplethTooltip( plotElement, plotContainer, geoData, timestep)
}

function addChoroplethTooltip(plotElement, containerElement, featureCollection, timestep=null) {
  const plotSelect = d3.select(plotElement)
  const gNode = plotSelect.selectAll("g[aria-label='geo']").nodes()[0]
  const gSelect = d3.select(gNode)
  const geoPolySelect = gSelect.selectAll("path")
  geoPolySelect.attr("class", "hoverable-geo")
  const tooltip = addPopperTooltip(containerElement)

  const tooltipContent = document.createElement("div")
  tooltipContent.classList.add("choropleth-tooltip")
  tooltipContent.classList.add("tooltip-content")
  const nameElement = document.createElement("div")
  nameElement.classList.add("tooltip-name")
  const detailElement = document.createElement("div")
  tooltipContent.appendChild(nameElement)
  tooltipContent.appendChild(detailElement)

  const selectionTooltip = addPopperTooltip(containerElement)
  const selectionTooltipContent = elements.selectionTooltip
  
  geoPolySelect.on("mouseover", (e,d) => {
    const feature = featureCollection.features[d]
    const name = feature.properties[state.nameProperty]
    //const name = stuff.nameMap?.get(feature.id)
    if (name) {
      nameElement.innerText = name 
    } else {
      nameElement.innerText = feature.id
    }
    d3.select(e.target).raise()
    if (stuff.selectedLocation != null) {
      d3.select(stuff.selectedLocation).raise()
    }

    //if (state.displayMode.mode == "cluster") {
      const locationResults = stuff.resultsByLocation.get(feature.id)
      if (locationResults) {
        const tooltipPlots = document.createElement("div")
        tooltipPlots.classList.add("tooltip-plots")

        const tsTooltip = createTimeSeriesTooltip(feature.id)
        const cellTooltip = createCellTooltip(locationResults, timestep ? timestep : state.timestep)
        //const densityTooltip = createDensityTooltip(feature.id)

        tooltipPlots.appendChild(tsTooltip)
        tooltipPlots.appendChild(cellTooltip)
        
        detailElement.innerHTML = '' 
        detailElement.appendChild(tooltipPlots)
      } else {
        detailElement.innerHTML = "No data"
      }
    //}

    tooltip.show(e.target, tooltipContent)
    state.hover = feature.id 
  })

  //stuff.selectedLocation = null
  geoPolySelect.on("click", (e,d) => {
    e.stopPropagation()
    const feature = featureCollection.features[d]
    state.select = feature.id

    if (stuff.selectedLocation != null) {
      stuff.selectedLocation.classList.remove("location-selected")
    }

    stuff.selectedLocation = e.target 
    e.target.classList.add("location-selected")

    // // TODO: Use common element - temporary fix due to element getting stuck on invisible reel plot panel
    // const selectionTooltipContent = document.createElement("div")
    // selectionTooltipContent.setAttribute("id", "selection-tooltip")
    // // const span = document.createElement("span")
    // // span.innerText = "Selected"
    // selectionTooltipContent.innerHTML = `<span>Selected</span> <i class="fa-solid fa-circle-xmark"></i>`

    selectionTooltip.show(e.target, selectionTooltipContent)

    //d3.select(e.target).attr("stroke", "green")
  })

  plotSelect.on("click", () => {
    state.select = null 

    if (stuff.selectedLocation != null) {
      stuff.selectedLocation.classList.remove("location-selected")
      selectionTooltip.hide()
    }
  })

  gSelect.on("mouseleave", () => {
    tooltip.hide()
    state.hover = null
  })

  const selectionCloseButton = elements.selectionTooltip.querySelector("i")
  selectionCloseButton.addEventListener("click", () => {
    state.select = null
    stuff.selectedLocation.classList.remove("location-selected")
    selectionTooltip.hide()
  })
}


function finalizeState(coreState) {
  state = new State()
  for (const [k,v] of Object.entries(coreState)) {
    state[k] = v
  }
  state.defineProperty("timestep", stuff.timesteps.at(-1))
  state.subscribe("timestep", timestepUpdated)

  state.defineProperty("coloringModeValue")
  state.defineProperty("coloringModeOptions")


  const methodsOptions = [
    "local_moran_i",
    "local_geary_c",
    "getis_ord_g", 
    "getis_ord_g*",
  ].map(method => ({value: method, label: METHOD_NAMES.get(method)}))

  state.defineProperty("methodsOptions")
  state.defineProperty("methodsValue", ["local_moran_i", "local_geary_c", "getis_ord_g*"])

  state.defineProperty("hover")
  state.defineProperty("select")
  state.defineProperty("multiSelect")

  state.subscribe("hover", updateFocus)
  state.subscribe("select", updateFocus)
  state.subscribe("multiSelect", updateMultiSelect)

  state.methodsOptions = methodsOptions
  hookCustomMultiSelect("#methods-select", state, "methodsValue", "methodsOptions")
  state.subscribe("methodsValue", () => {
    state.clusteringMethods = state.methodsValue
    state.globalClusteringMethods = [...new Set(state.clusteringMethods.map(d => LOCAL_GLOBAL_MAP.get(d)))]

    state.coloringModeOptions = [
      {label: "Cluster Aggregate", value:"cluster_agg"},
      ...state.methodsValue.map(d => ({value:"single:"+d, label: METHOD_NAMES.get(d)}))
    ]

    const activeMethods = new Set(state.clusterResults.local[0].statistics.map(d => d.method))
    if (state.clusteringMethods.some(d => !activeMethods.has(d))) {
      stuff.url.searchParams.set("methods", state.clusteringMethods.join(","))
      stuff.dataKey = getDataKey()
      history.pushState(null, null, '?' + stuff.url.searchParams.toString())
      cacheWithVersion("coreState", stuff.dataKey, d => run(state))
    }

    drawPlots()
  })

  hookSelect("#coloring-mode-select", state, "coloringModeValue", "coloringModeOptions")
  state.subscribe("coloringModeValue", updateColoringMode)

  state.trigger("methodsValue")

  elements.timeSlider.addEventListener("input", () => state.timestep = stuff.timesteps[elements.timeSlider.value])
}

function updateColoringMode() {
  if (state.coloringModeValue == "cluster_agg") {
    state.displayMode = {mode: "cluster_agg"}
  } else {
    const split = state.coloringModeValue.split(":")
    state.displayMode = {mode: "cluster", method: split[1]}
  }
  drawPlots()
}

function timestepUpdated() {
  elements.timeLabel.innerText = state.timestep
  const relevantResults = state.clusterResults.local.filter(result => result.timestep == state.timestep)
  colorChoropleth(relevantResults, state.data.geoData, stuff.areaPaths)
  updateFocus()
}

function updateMultiSelect() {
  if (state.clusterResults == null) return

  elements.mapHistoryCardContent.innerHTML = ''
  const relevantResults = state.clusterResults.local.filter(result => result.timestep == state.timestep)
  timestepUpdated()

  if (state.multiSelect?.size > 0) {
    const mapHistoryContainer = document.createElement("div")
    mapHistoryContainer.setAttribute("id", "map-history-plots")
    const subFeatureCollection = { 
      type: "FeatureCollection", 
      features: state.data.geoData.features.filter(d => state.multiSelect.has(d.id))
    }

    const selectedPaths = stuff.areaPaths.filter((d) => state.multiSelect.has(state.data.geoData.features[d].id))
    const zoomBbox = getPathsBoundingBox(selectedPaths)
    stuff.zoomRect.attr("visibility", "visisble") 
      .attr("x", zoomBbox.x)
      .attr("y", zoomBbox.y)
      .attr("width", zoomBbox.width)
      .attr("height", zoomBbox.height)
    //selectedPaths.attr("fill", "black")

    const historyPlots = []
    for (const timestep of stuff.timesteps) {
      const reelContainer = document.createElement("div")
      reelContainer.classList.add("reel-container")

      const label = document.createElement("div")
      label.innerText = timestep

      const plotContainerOuter = document.createElement("div")
      plotContainerOuter.classList.add("map-history-plot-outer")
    
      const plotContainer = document.createElement("div")
      plotContainer.classList.add("map-history-plot")
      plotContainer.style.width = "280px"
      plotContainer.style.height = "280px"

      reelContainer.appendChild(label)
      reelContainer.appendChild(plotContainer)
      mapHistoryContainer.appendChild(reelContainer)

      historyPlots.push({timestep, container: plotContainer})
    }

    // TODO: Put in resize container - set timeout is temporary workaround
    setTimeout(() => {
      for (const plot of historyPlots) {
        plotClusterChoropleth(plot.container, subFeatureCollection, plot.timestep)

        const mapSvg = plot.container.querySelector("svg")
        const areaPaths = d3.select(mapSvg)
          .select("g[aria-label='geo']")
          .selectAll("path")

        const relevantResults = state.clusterResults.local.filter(result => result.timestep == plot.timestep)
        colorChoropleth(relevantResults, subFeatureCollection, areaPaths, false)
        mapHistoryContainer.scrollTop = mapHistoryContainer.scrollHeight
      }
    }, 100)

    elements.mapHistoryCardContent.appendChild(mapHistoryContainer)
  } else {
    if (stuff.zoomRect) {
      stuff.zoomRect.attr("visibility", "hidden")

    }
    const span = document.createElement("span")
    span.innerText = "Select a sub-area by dragging on the map"
    elements.mapHistoryCardContent.appendChild(span)
  }
}

function drawCellPlot() {
  elements.cellCardContent.innerHTML = ''
  elements.cellCardTopInfo.innerHTML = ''

  let colorMap = null 
  const bbox = elements.cellCardContent.getBoundingClientRect()
  let height = null
  let legend = null 
  let cells = null
  let methods = null 
  let focus = state.select ? state.select : state.hover
  
  if (focus == null) {
    colorMap = new Map(GLOBAL_CLUSTER_COLORS.map(d => [d.label, d.color]))
    methods = state.globalClusteringMethods
    height = Math.min(bbox.height, methods.length * 50 + 40)

    const labels = new Set(state.clusterResults.global.map(d => d.label))
    legend = categoricalColorLegend(GLOBAL_CLUSTER_COLORS.filter(d => labels.has(d.label)))
    cells = state.clusterResults.global
    // const rects = d3.select(plot)
    //   .selectAll("rect")


  } else {
    colorMap = new Map(CLUSTER_COLORS.map(d => [d.label, d.color]))
    methods = [...state.clusteringMethods]
    height = Math.min(bbox.height, methods.length * 50 + 40)

    const results = state.clusterResults.local.filter(d => d.id == focus)

    const enabledMethods = new Set(state.clusteringMethods)
    cells = []
    results.forEach(result => result.statistics.forEach(stat => {
      stat.timestep = result.timestep
      if (enabledMethods.has(stat.method)) cells.push(stat)
    }))

    if (state.displayMode.mode == "cluster_agg") {
      const grouped = d3.flatGroup(cells, d => d.timestep)
      for (const [timestep, splitCells] of grouped) {
        const labels = splitCells.map(d => d.label)
        cells.push({
          method: "aggregate",
          timestep,
          labels,
        })
      }
      methods.push("aggregate")
    }

    const labels = new Set(cells.map(d => d.label))
    legend = categoricalColorLegend(CLUSTER_COLORS.filter(d => labels.has(d.label)))
  }

  let timestepTicks = stuff.timesteps
  const timestepCharMax = d3.max(stuff.timesteps, d => String(d).length)
  const estimatedTickWidth = timestepCharMax * 9
  if (estimatedTickWidth * stuff.timesteps.length > bbox.width - 140) {
    timestepTicks = [stuff.timesteps[0], stuff.timesteps.at(-1)]
  }

  if (cells?.length > 0) {
    const plot = Plot.plot({
      style: {fontSize: "13px"},
      marginLeft: 140,
      marginBottom: 25,
      x: { label: null, tickFormat: d => String(d), domain: stuff.timesteps, ticks: timestepTicks}, // TODO: Better tick formatting
      y: { tickFormat: d => METHOD_NAMES.get(d), label: null, domain: methods, textStroke: "black"} ,
      width: bbox.width,
      height ,
      marks: [
        Plot.cell(cells, {
          x: d => String(d["timestep"]),
          y: "method",
          fill: d => d.labels ? labelAggColor(d.labels, stuff.localScaleIndex) : colorMap.get(d.label)
        })
      ]
    })
  
    legend.style.fontSize = "12px"
    elements.cellCardTopInfo.appendChild(legend)
    elements.cellCardContent.appendChild(plot)  
  } else {
    const span = document.createElement("span")
    span.innerText = "No data"
    elements.cellCardContent.appendChild(span)
  }
}

function drawTimeSeriesPlot() {
  elements.timeSeriesCardContent.innerHTML = ''
  elements.timeSeriesCardTopInfo.innerHTML = ''
  const bbox = elements.cellCardContent.getBoundingClientRect()

  let results = null 
  let methods = null 
  let focus = state.select ? state.select : state.hover
  if (state.displayMode.mode == "cluster") {
    let method = null
    if (focus == null) {
      method = LOCAL_GLOBAL_METHOD_MAP.get(state.displayMode.method)
      results = state.clusterResults.global.filter(d => d.method == method)
    } else {
      const baseResults = state.clusterResults.local.filter(d => d.id == focus)
      method = state.displayMode.method
      results = [] 
      baseResults.forEach(result => result.statistics.filter(stat => stat.method == method)
        .forEach(stat => {
          stat.timestep = result.timestep 
          results.push(stat)
        }))
    }
    methods = [method]
  } else if (state.displayMode.mode == "cluster_agg") {
    if (focus == null) {
      results = state.clusterResults.global
      methods = state.globalClusteringMethods
    } else {
      const baseResults = state.clusterResults.local.filter(d => d.id == focus)
      results = [] 
      baseResults.forEach(result => result.statistics.forEach(stat => {
        stat.timestep = result.timestep 
        results.push(stat)
      }))
      methods = state.clusteringMethods
    }
  }

  if (results?.length > 0) {
    const plot = Plot.plot({
      style: {fontSize: "13px"},
      width: bbox.width,
      height: bbox.height,
      x: {ticks: [], label: state.timeField, type: "point", domain: stuff.timesteps },
      fx: {label: null, tickFormat: d => METHOD_NAMES.get(d), domain: methods},
      marginBottom: 20,
      marginTop: 40,
      y: {grid: true},
      marks: [
        Plot.ruleY([0], {stroke: "lightgrey"}),
        Plot.ruleY(results.filter(d => d.timestep == stuff.timesteps[0]), 
          {y: d => (d.statistic - d.statisticMean)/d.statisticStd, 
          stroke: "rgb(255,0,0,.3)", fx: "method", strokeDasharray: "3,3"}),
        Plot.lineY(results, {x: "timestep", y: d => (d.statistic - d.statisticMean)/d.statisticStd, 
          stroke: "red", fx: "method"}),
        Plot.lineY(results, {x: "timestep", y: d => (d.lowerCutoff - d.statisticMean)/d.statisticStd, 
          strokeDasharray: "2,3", stroke: "slategrey", fx: "method"}),
        Plot.lineY(results, {x: "timestep", y: d => (d.upperCutoff - d.statisticMean)/d.statisticStd, 
          strokeDasharray: "2,3", stroke: "slategrey", fx: "method"}),
        Plot.dot(results.filter(d => d.timestep == state.timestep), 
          {x: "timestep", y: d => (d.statistic - d.statisticMean)/d.statisticStd, fill: "black", fx: "method"}),
      ]
    })
  
    elements.timeSeriesCardContent.appendChild(plot)
  } else {
    const span = document.createElement("span")
    span.innerText = "No data"
    elements.timeSeriesCardContent.appendChild(span)
  }
}

function drawDensityPlot() {
  elements.distributionContainer.innerHTML = ''
  elements.distributionCardTopInfo.innerText = ''

  const bbox = elements.distributionContainer.getBoundingClientRect()

  let results = []
  let methods = null
  let focus = state.select ? state.select : state.hover
  if (state.displayMode.mode == "cluster") {
    let method = null
    if (focus == null) {
      method = LOCAL_GLOBAL_METHOD_MAP.get(state.displayMode.method)
      results = state.clusterResults.global.filter(d => d.method == method && d.timestep == state.timestep)
    } else {
      method = state.displayMode.method
      const localResult = state.clusterResults.local.find(d => d.id == focus
        && d.timestep == state.timestep)
      results = localResult?.statistics.filter(d => d.method == method)
    }
    methods = [method]
  } else if (state.displayMode.mode == "cluster_agg") {
    if (focus == null) {
      methods = state.globalClusteringMethods
      results = state.clusterResults.global.filter(d => d.timestep == state.timestep)
    } else {
      methods = state.clusteringMethods
      const localResult = state.clusterResults.local.find(d => d.id == focus && d.timestep == state.timestep)
      if (localResult) {
        localResult.statistics.forEach(stat => { 
          results.push(stat)
        })
      }
    }
  }

  if (results && results.length > 0) {
    let distributionPoints = []
    
    for (const result of results) {
      result.permutationDistribution.forEach(d => distributionPoints.push({
        x: (d[0] - result.statisticMean)/result.statisticStd,
        y: d[1],
        method: result.method
      }))
    }

    const plot = Plot.plot({
      style: {fontSize: "15px"},
      width: bbox.width,
      height: bbox.height,
      fx: { label: null, tickFormat: d => METHOD_NAMES.get(d), domain: methods },
      y: { axis: null},
      x: { label: null, tickFormat: d => String(parseInt(d))  }, 
      marks: [
        Plot.areaY(distributionPoints, {x: "x", y: "y", fx: "method", curve: "basis", fill: "lightgrey"}),
        // Plot.ruleX([result.lowerCutoff, result.upperCutoff], {stroke: "black", strokeDasharray: "3,3"}),
        Plot.ruleX(results, {x: d => (d.lowerCutoff-d.statisticMean)/d.statisticStd, stroke: "black",strokeDasharray: "3,3", fx: "method"}),
        Plot.ruleX(results, {x: d => (d.upperCutoff-d.statisticMean)/d.statisticStd, stroke: "black",strokeDasharray: "3,3", fx: "method"}),
        Plot.ruleX(results, {x: d => (d.statistic-d.statisticMean)/d.statisticStd, stroke: "red", fx: "method"}),
        Plot.ruleY([0]),

      ]
    })
    elements.distributionContainer.appendChild(plot)
    // elements.distributionCardTopInfo.innerText = `${METHOD_NAMES.get(method)} = ${result.statistic.toPrecision(3)}`
  } else {
    const span = document.createElement("span")
    span.innerText = "No data"
    elements.distributionContainer.appendChild(span)
  }
}

function drawMainColorLegend() {
  elements.mapColorLegend.innerHTML = '' 
  let legend = null 
  if (state.displayMode.mode == "cluster") {
    const labels = new Set() 
    state.clusterResults.local.forEach(d => d.statistics.filter(d => d.method == state.displayMode.method).forEach(
      stat => labels.add(stat.label)))
    legend = categoricalColorLegend(CLUSTER_COLORS.filter(d => labels.has(d.label)))
  } else {
    legend = categoricalColorLegend(GROUP_COLORS)
  }
  elements.mapColorLegend.appendChild(legend)
}

function labelColor(label, colorIndex) {
  const color = colorIndex.get(label)
  return color ? color.color : "white"
}

function labelAggColor(labels, colorScaleIndex) {
  if (!labels) {
    return "white"
  }

  const labelDetails = labels.map(d => stuff.localColorIndex.get(d)).filter(d => d)
  const groups = [...new Set(labelDetails.map(d => d?.group))].filter(d => d)

  let coreGroup = null
  let score = 0 
  if (groups.length > 1) {    
    for (const baseGroup of labelDetails.map(d => d.group)) {
      if (!baseGroup) continue
      
      let groupScore = 0
      for (const labelDetail of labelDetails) {
        if (!labelDetail.group) continue 
        
        if (labelDetail.group == baseGroup) {
          groupScore += 1
        } else if (labelDetail.partialGroups?.includes(baseGroup)) {
          groupScore += 0.5
        } else {
          groupScore = null 
          break
        }
      }
      if (groupScore != null) {
        coreGroup = baseGroup 
        score = groupScore / labels.length
        break 
      }
    }

    if (coreGroup == null) {
      // TODO: Do this better, less ad-hoc.
      const groupsSet = new Set(groups) 
      const conflictScale = colorScaleIndex.get("Conflict")
      if (groupsSet.has("High cluster") && groupsSet.has("Low cluster")) {
        return conflictScale(1)
      } else {
        return conflictScale(0.5)
      }
      return stuff.groupColorMap.get("Conflict")
    }
  } else if (groups.length == 1) {
    coreGroup = groups[0]
    score = labelDetails.filter(d => d.group == coreGroup).length  / labels.length
  } else {
    return stuff.localColorIndex.get("Not significant").color
  }

  const scale = colorScaleIndex.get(coreGroup)
  return scale(score)
}

function initializeColorStuff() {
  stuff.localColorIndex = d3.index(CLUSTER_COLORS, d => d.label)
  stuff.globalColorIndex = d3.index(GLOBAL_CLUSTER_COLORS, d => d.label)

  stuff.groupColorMap = new Map(GROUP_COLORS.map(d => [d.group, d.color]))

  const notSignificantColor = CLUSTER_COLORS.find(d => d.label == "Not significant").color 
  const groups = [...new Set(GROUP_COLORS.map(d => d.group))]
  const scaleMap = new Map()
  groups.forEach(group => {
    //if (group != "Conflict" && group) {
    if (group) {
      scaleMap.set(group, d3.scaleLinear().range([notSignificantColor, stuff.groupColorMap.get(group)]))
    }
  })
  stuff.localScaleIndex = scaleMap
}

function colorChoropleth(relevantResults, geoData, areaPaths, highlightMulti=true) {
  if (!areaPaths) return 

  // TODO: Implement value 

  let fill = null
  if (state.displayMode.mode == "cluster" || state.displayMode.mode == "value_cluster") {
    
    const relevantStatMap = new Map() 
    for (const result of relevantResults) {
      const statObj = result.statistics.find(d => d && d.method == state.displayMode.method)
      if (statObj) {
        relevantStatMap.set(result.id, statObj)
      }
    }

    // const colorMap = new Map(CLUSTER_COLORS.map(d => [d.label, d.color]))
    // const fill = feature => {
    //   const label = relevantStatMap.get(feature.id)?.label
    //   const color = colorMap.get(label)
    //   return color ? color : "white"
    // }

    fill = feature => {
      const label = relevantStatMap.get(feature.id)?.label
      return labelColor(label, stuff.localColorIndex)
    }

    // const fill = feature => {
    //   const label = relevantStatMap.get(feature.id)?.label
    //   return label ? label : "Missing"
    // }
  } else if (state.displayMode.mode == "cluster_agg") {
    const enabledMethods  = new Set(state.clusteringMethods)

    const relevantStatLabels = new Map() 
    for (const result of relevantResults) {
      const labels = [] 
      for (const statObj of result.statistics) {
        if (enabledMethods.has(statObj.method)) {
          labels.push(statObj.label)

        }
      }
      relevantStatLabels.set(result.id, labels)
    }

    fill = feature => {
      const labels = relevantStatLabels.get(feature.id)
      return labelAggColor(labels, stuff.localScaleIndex)
    }
  }


  areaPaths
    .attr("fill", i => { 
      const feature = geoData.features[i]
      return fill(feature)
    })
    // .attr("stroke", i => {
    //   const feature = geoData.features[i]
    //   return state.multiSelect?.has(feature.id) && highlightMulti ? "yellow" : "lightgrey"
    // })
}

function cachableState(state) {
  const properties = ["clusterResults", "clusteringMethods", "coloringMode", "data", "displayMode", "geoIdField",
    "globalClusteringMethods", "nameField", "timeField", "valueField", "weightTuples"]

  const downloadableState = {}
  properties.forEach(property => downloadableState[property] = state[property])
  return downloadableState
}

function createTimeSeriesTooltip(id) {
  // TODO: The plot alignment here probably breaks with different number of timesteps,
  // due to some weird resizing stuff on the cell plot.

  const results = stuff.resultsByLocation.get(id)

  const div = document.createElement("div")
  div.style.display = "flex"
  
  const value = results.find(d => d.timestep == state.timestep)?.value

  const marks =  [
    //Plot.ruleY([value], {x1: state.timestep, x2: stuff.timestepExtent[1], stroke: "red"}),
    Plot.lineY(results, {x: "timestep", y: "value", stroke: "black"}),

  ]

  if (value != null) {
    marks.push(Plot.dot([value], {x: state.timestep, y: d => d, fill: "red"}))
    marks.push(Plot.lineY(results, {x: "timestep", y: "value", stroke: "black"}))
  }


  const tsPlot = Plot.plot({
    width: 142,
    height: 60,
    marginRight: 1,
    marginLeft: 35,
    marginBottom: 10,
    marginTop: 25,
    x: {axis: null, type: "point", domain: stuff.timesteps},
    //y: {ticks: stuff.standardRange, domain: stuff.standardRange, label: state.valueField,},
    y: {ticks: [stuff.standardRange[0], stuff.valueMean, stuff.standardRange[1]], 
      domain: stuff.standardRange, label: state.valueField,  grid: true},
    marks: marks
  })

  //console.log(stuff.valueDistribution, stuff.standardRange)
  const nExtent = d3.extent(stuff.valueDistribution, d => d.n)
  const nRange = nExtent[1] - nExtent[0]
  const nLargerRange = [nExtent[0], nExtent[1] + nRange*0.3] // For text spacing
  const densityPlot =Plot.plot({
    width: 35,
    height: 45,
    marginLeft: 0, 
    marginRight: 15,
    marginTop: 15, 
    marginBottom: 0,
    x: {axis: null, domain: nLargerRange},
    y: {domain: stuff.standardExtendedRange, axis: null},
    marks: [
      //Plot.ruleY(stuff.standardRange, {stroke: "red"}),
      Plot.areaX(stuff.valueDistribution, {
        //y: d => d.low + (d.high - d.low)/2, 
        y: d => d.low, // TODO: Fix this
        x: "n", 
        //curve: "basis", 
        fill: "lightgrey"
      }),
      Plot.ruleY([value], {stroke: "red", strokeWidth: 1, x2: nRange/2}),
      Plot.text([value], {y: d => d, 
        x: nLargerRange[1], //frameAnchor: "right",
        textAnchor: "right",
        text: value, fill: "black", })

    ]
  })

  div.appendChild(tsPlot)
  div.appendChild(densityPlot)
  return div
}

function createCellTooltip(locationResults, timestep) {
  const enabledMethods  = new Set(state.clusteringMethods)
  const labels = locationResults.map(d => {
    const labels = []
    d.statistics.forEach(statObj => {
      if (enabledMethods.has(statObj.method)) labels.push(statObj.label)
    })
    return {timestep: d.timestep, labels: labels}
  })
  const plot = Plot.plot({
    marginBottom: 20,
    marginTop: 5,
    // TODO: Label fitting margins.
    marginLeft: 10,
    marginRight: 10,
    width: 130,
    height: 40,
    x: {type: "band", ticks: [stuff.timesteps[0], stuff.timesteps.at(-1)], domain: stuff.timesteps.map(String)},
    marks: [
      Plot.cell(labels, {
        x: d => d["timestep"]+"",
        fill: d => labelAggColor(d.labels, stuff.localScaleIndex),
        stroke: d => d.timestep == timestep ? "green" : "none"
      })
    ]
  })
  plot.style.marginLeft = "25px"
  return plot
}

start() 