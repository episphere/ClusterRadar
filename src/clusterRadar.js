import { hookExpandableCards } from "./panel.js";

import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.13/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8.5/+esm';
import { categoricalColorLegend, plotChoropleth } from "./plots.js";
import { State } from "./State.js";
import { addOpenableSettings, addPathSelectionBox, addPopperTooltip, 
  cacheWithVersion, downloadData, getPathsBoundingBox, hookSelect, unzipJson } from "./helper.js";
import { startTutorial } from "./tutorial.js";

// Here, we're going for some event based programming. To kick things off, the start() method runs which sets up 
// various things which can run immediately (e.g. finding elements). start() runs the initializeState() method, which
// sets up all the state properties. Finally, start kicks off the initial event. 

// Still getting weird out-of-memory errors with more than one thread. Figure this out later.
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
  {label: "Other negative spatial autocorrelation", shortLabel: "Other positive", color: "#be93c7",
    group: "Other"},
  {label: "Not significant", color: "whitesmoke"},
]

// TODO: Add option to swap red and blue
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
  ["getis_ord_g", "Getis-Ord G"],
  ["getis_ord_g*", "Getis-Ord G*"],
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

// Global variable stuff 
const elements = {}
const stuff = {}
let state = null 

const INITIAL_STATE = {
  coloringMode: "cluster_agg",


  valueField: "crude_rate",
  geoIdField: "county_code",
  timeField: "year",
  weightMethod: "queen",
  clusteringMethods: ["local_moran_i", "local_geary_c", "getis_ord_g*"],//, "getis_ord_g"],
  globalClusteringMethods: ["moran_i", "geary_c", "getis_ord_general_g"], // TODO: Make dynamic?
  displayMode: {mode: "cluster_agg", method: "local_geary_c"},
  nameProperty: "name",
 
  timestep: null,
  weightTuples: null,
  data: null,
  loadingProgress: null,
  clusterJobs: [],
  clusterResults: null,

  //interactionState: { hover: null, select: null, multiSelect: null},
  // Interaction state 
  hover: null, 
  select: null,
  multiSelect: null 
}

function start() {
  const cards = hookExpandableCards()
  stuff.mainCard = cards.find(d => d.id == "map-card") 
  stuff.auxCards = cards.filter(d => d.id != "map-card")

  elements.mainContainer = document.getElementById("main-container")
  elements.mapCard = document.getElementById("map-card")
  elements.mapCardContent = document.getElementById("map-card-content")
  elements.auxContainer = document.getElementById("aux-container")
  elements.mapPlotContainer = document.getElementById("map-plot-container")
  elements.mapColorLegend = document.getElementById("map-color-legend")
  elements.timeInputContainer = document.getElementById("time-input-container")
  elements.auxCollapseToggle = document.getElementById("aux-collapse-toggle")
  elements.distributionContainer = document.getElementById("distribution-container")
  elements.distributionCardTopInfo = document.getElementById("distribution-card-top-info")
  elements.cellCardContent = document.getElementById("cell-card-content")
  elements.cellCardTopInfo = document.getElementById("cell-card-top-info")
  elements.timeSeriesCardContent = document.getElementById("time-series-card-content")
  elements.timeSeriesCardTopInfo = document.getElementById("time-series-card-top-info")
  elements.mapHistoryCardContent = document.getElementById("map-history-card-content")

  elements.auxCollapseToggle.addEventListener("click", () => {
    elements.auxContainer.classList.toggle("collapsed")
  })

  document.getElementById("tutorial-button").addEventListener("click", () => startTutorial())

  // TODO: Move/remove
  stuff.auxCards.forEach(card => card.setLoading(false))

  const selectionCloseButton = document.getElementById("selection-tooltip").querySelector("i")
  selectionCloseButton.addEventListener("click", () => {
    state.select = null
    stuff.selectedLocation.classList.remove("location-selected")
    stuff.selectionTooltip.hide()
  })

  document.querySelectorAll(".settings-button").forEach(element => {
    let content = document.getElementById(element.getAttribute("for"))
    if (!content) {
      content = document.createElement("div")
      content.innerText = "..."
    }
    addOpenableSettings(elements.mainContainer, element, element.getAttribute("label"), content)
  })

  initializeColorStuff() 

  document.addEventListener('DOMContentLoaded', async function() {
    initializeState()
    await initialDataLoad()
  })
}

function initializeColorStuff() {
  stuff.localColorIndex = d3.index(CLUSTER_COLORS, d => d.label)
  stuff.globalColorIndex = d3.index(GLOBAL_CLUSTER_COLORS, d => d.label)

  stuff.groupColorMap = new Map(GROUP_COLORS.map(d => [d.group, d.color]))

  const notSignificantColor = CLUSTER_COLORS.find(d => d.label == "Not significant").color 
  const groups = [...new Set(CLUSTER_COLORS.map(d => d.group))]
  const scaleMap = new Map()
  groups.forEach(group => {
    if (group != "Conflict" && group) {
      scaleMap.set(group, d3.scaleLinear().range([notSignificantColor, stuff.groupColorMap.get(group)]))
    }
  })
  stuff.localScaleIndex = scaleMap
}

function initializeState() {
  state = new State()

  const initialState = {...INITIAL_STATE}

  stuff.url = new URL(window.location.href)
  for (const [paramName, paramValue] of stuff.url.searchParams) {
    initialState[paramName] = paramValue
  }

  for (const [property, value] of Object.entries(INITIAL_STATE)) {
    state.defineProperty(property, value)
  }

  state.defineJointProperty("plotSettings", ["displayMode", "timestep", "clusterResults"])

  state.subscribe("data", updatedData)
  state.subscribe("loadingProgress", updatedLoadingProgress)
  state.subscribe("weightTuples", updatedWeightMatrix)
  state.subscribe("clusterJobs", updatedClusterJobs)
  state.subscribe("clusterResults", updateClusterResults)
  state.subscribe("plotSettings", updatePlotSettings)
  state.subscribe("hover", updateFocus, ["plotSettings"])
  state.subscribe("select", updateFocus)
  state.subscribe("multiSelect", updateMultiSelect)

  // TODO: Make this dynamic with the enabled methods
  const coloringModeOptions = [{value: "cluster_agg", label: "Aggregate summary"}]
  state.clusteringMethods.forEach(method => coloringModeOptions.push(
    {value: "single:" + method, label: METHOD_NAMES.get(method)}))
  state.defineProperty("coloringModeOptions", coloringModeOptions)

  hookSelect("#coloring-mode-select", state, "coloringMode", "coloringModeOptions")
  state.subscribe("coloringMode", updateColoringMode)

  state.loadingProgress = { progress: 0, message: "Loading"}
}

async function initialDataLoad() {
  const geoData = await d3.json("data/geography/counties.json")
  let valueData = await d3.csv("data/time_series/us-county_mortality_malignant-neoplasms_1999-2020.csv")

  // TODO: Delete this when we have a proper time format parsing logic
  valueData.forEach(row => row.year = parseInt(row.year))

  // TODO: Delete 
  //valueData = valueData.filter(d => d.year == 2020)

  state.data = { geoData, valueData }
}

// ==========================================
// ===== Main event-based control logic =====
// ==========================================

function updateColoringMode() {
  if (state.coloringMode == "cluster_agg") {
    state.displayMode = {mode: "cluster_agg"}
  } else {
    const split = state.coloringMode.split(":")
    state.displayMode = {mode: "cluster", method: split[1]}
  }
}

function updatedLoadingProgress() {
  stuff.mainCard.setLoading(state.loadingProgress)
}

function updatedData() {
  state.loadingProgress = {progress: 5, message: "Calculating weights"}

  for (const row of state.data.valueData) {
    row[state.valueField] = parseFloat(row[state.valueField])
  }

  if (checkDefaultParams()) {
    d3.json("data/results/weights.json").then(weights => state.weightTuples = weights)
  } else {
    cacheWithVersion("weightTuples", stuff.url.search, calculateWeightTuples).then(weightTuples => {
      state.weightTuples = weightTuples
    })
  }
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

function updatedWeightMatrix() {
  state.loadingProgress = {progress: 10, message: "Clustering"}

  if (checkDefaultParams()) {
    console.log("Reading default results from file")
    
    unzipJson("data/results/spatial_clusters.json.zip", "spatial_clusters.json").then((results) => {
    //d3.json("data/results/spatial_clusters.json").then((results) => {
      state.clusterResults = results
    })
  } else {
    cacheWithVersion("clusterResults", stuff.url.search, calculateClusterResults).then(clusterResults => {
      state.clusterResults = clusterResults
    })
  
  }
}

function checkDefaultParams() {
  // TODO: Replace with proper URL argument stuff
  return stuff.url.searchParams.get("file") == null && 
    stuff.url.searchParams.get("clusterMethods") == null && 
    stuff.url.searchParams.get("weightTuples") == null
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
      state.loadingProgress = {
        progress: 10 + 80 * ((clusterJobs.length-remainingJobs) / clusterJobs.length),
        message: "Clustering"
      }
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

      // const featureCollection = geoLinkData(state.data.geoData, clusterJob.data, d => d[state.geoIdField], 
      //   (row) => ({[state.valueField]: row[state.valueField]}), false)

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

function updatedClusterJobs() {

  const completedJobs = state.clusterJobs.filter(d => d.completed)
  state.loadingProgress = {
    progress: 10 + 80 * (completedJobs.length / state.clusterJobs.length),
    message: "Clustering"
  }
}

function updateClusterResults() {
  state.loadingProgress = { progress: 95, message: "Plotting" }

  if (!localStorage.tutorialCompleted) {
    startTutorial()
    localStorage.tutorialCompleted = true
  }

  const label = document.createElement("label")
  //label.innerText = state.timeField
  const input = document.createElement("input")
  input.setAttribute("type", "range")
  input.classList.add("form-range")
  elements.timestepLabel = label
  
  const timesteps = [...new Set(state.data.valueData.map(d => d[state.timeField]))].sort((a,b) => a - b)
  input.setAttribute("min", 0)
  input.setAttribute("max", timesteps.length-1)
  input.setAttribute("value", timesteps.length-1)
  stuff.timesteps = timesteps

  input.addEventListener("input", () => {
    state.timestep = timesteps[input.value]
    elements.timestepLabel.innerText = state.timestep
  })

  elements.timeInputContainer.innerHTML = '' 
  elements.timeInputContainer.appendChild(label)
  elements.timeInputContainer.appendChild(input)

  if (stuff.mapResizeObserver) {
    stuff.mapResizeObserver.disconnect()
  }
  const resizeObserver = new ResizeObserver(() => drawBaseMap())
  resizeObserver.observe(elements.mapPlotContainer)
  stuff.mapResizeObserver = resizeObserver

  stuff.resultsByLocation = d3.group(state.clusterResults.local, d => d.id)

  document.getElementById("download-button").addEventListener("click", () => {
    //downloadData(JSON.stringify(state.clusterResults, null, 2), "spatial_clusters.json")
    downloadData(JSON.stringify(state.weightTuples, null, 2), "weights.json")
  })

  stuff.mainCard.setLoading(false)
  drawBaseMap()
}


function updatePlotSettings() {

  if (stuff.areaPaths) {
    if (state.timestep == null) {
      const timesteps = [...new Set(state.clusterResults.local.map(d => d.timestep))].sort((a,b) => a - b)
      stuff.timestepExtent = d3.extent(timesteps)
      state.timestep = timesteps.at(-1)
      // TODO: Better handling of timestep label, perhaps move to scrubber or elsewhere, or at least handle different sizes
      elements.timestepLabel.innerText = state.timestep//"Timestep:"
    }
  }

  stuff.valueDistribution = d3.bin().thresholds(20)(state.clusterResults.local.map(d => d.value)).map(bin => ({
    low: bin.x0, high: bin.x1, n: bin.length
  }))

  updateFocus()
  updateMultiSelect()
  drawMainColorLegend()
}

function updateFocus() {
  drawDensityPlot()
  drawCellPlot()
  drawTimeSeriesPlot()
}

function updateMultiSelect() {
  elements.mapHistoryCardContent.innerHTML = ''
  const relevantResults = state.clusterResults.local.filter(result => result.timestep == state.timestep)
  colorChoropleth(relevantResults, state.data.geoData, stuff.areaPaths)

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
      x: {ticks: [] },
      fx: {label: null, tickFormat: d => METHOD_NAMES.get(d), domain: methods},
      marginBottom: 40,
      marginTop: 40,
      marks: [
        Plot.ruleY([0], {stroke: "lightgrey"}),
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

    cells = []
    results.forEach(result => result.statistics.forEach(stat => {
      stat.timestep = result.timestep
      cells.push(stat)
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
    timestepTicks = stuff.timestepExtent
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
          x: "timestep",
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
        n: d.n,
        low: (d.low - result.statisticMean)/result.statisticStd,
        high: (d.high - result.statisticMean)/result.statisticStd,
        method: result.method
      }))
    }

    const plot = Plot.plot({
      style: {fontSize: "15px"},
      width: bbox.width,
      height: bbox.height,
      fx: { label: null, tickFormat: d => METHOD_NAMES.get(d), domain: methods },
      y: { axis: null},
      marks: [
        Plot.ruleY([0]),
        Plot.areaY(distributionPoints, {x: d => (d.low + d.high)/2, y: "n", fx: "method", curve: "basis", fill: "lightgrey"}),
        // Plot.ruleX([result.lowerCutoff, result.upperCutoff], {stroke: "black", strokeDasharray: "3,3"}),
        Plot.ruleX(results, {x: d => (d.lowerCutoff-d.statisticMean)/d.statisticStd, stroke: "black",strokeDasharray: "3,3", fx: "method"}),
        Plot.ruleX(results, {x: d => (d.upperCutoff-d.statisticMean)/d.statisticStd, stroke: "black",strokeDasharray: "3,3", fx: "method"}),
        Plot.ruleX(results, {x: d => (d.statistic-d.statisticMean)/d.statisticStd, stroke: "red", fx: "method"})
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
    const relevantStatLabels = new Map() 
    for (const result of relevantResults) {
      const labels = [] 
      for (const statObj of result.statistics) {
        labels.push(statObj.label)
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

function drawBaseMap() {
  const DRAW_DEBOUNCE = 200 
  clearTimeout(stuff.drawMapTimeout)

  elements.mapPlotContainer.innerHTML = ''

  drawMainColorLegend()

  stuff.drawMapTimeout = setTimeout(() => {
    plotClusterChoropleth(elements.mapPlotContainer, state.data.geoData)

    const mapSvg = elements.mapPlotContainer.querySelector("svg")
    stuff.areaPaths = d3.select(mapSvg)
      .select("g[aria-label='geo']")
      .selectAll("path")

    addPathSelectionBox(d3.select(mapSvg), stuff.areaPaths, selected => {
      state.multiSelect = new Set(selected.map(d => state.data.geoData.features[d].id))
    })

    stuff.zoomRect = d3.select(mapSvg)
      .append("rect")
        .attr("visibility", "hidden") 
        .attr("stroke", "slategrey")
        .attr("fill", "none")
        .style("stroke-dasharray", "3,3")

    state.trigger("plotSettings")
  }, DRAW_DEBOUNCE)
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

  stuff.selectionTooltip = addPopperTooltip(containerElement)
  const selectionTooltipContent = document.getElementById("selection-tooltip")
  
  geoPolySelect.on("mouseover", (e,d) => {
    const feature = featureCollection.features[d]
    const name = feature.properties[state.nameProperty]
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

        const cellTooltip = createCellTooltip(locationResults, timestep ? timestep : state.timestep)
        const densityTooltip = createDensityTooltip(feature.id)

        tooltipPlots.appendChild(densityTooltip)
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

    stuff.selectionTooltip.show(e.target, selectionTooltipContent)

    //d3.select(e.target).attr("stroke", "green")
  })

  plotSelect.on("click", () => {
    state.select = null 

    if (stuff.selectedLocation != null) {
      stuff.selectedLocation.classList.remove("location-selected")
      stuff.selectionTooltip.hide()
    }
  })

  gSelect.on("mouseleave", () => {
    tooltip.hide()
    state.hover = null
  })
}

function createDensityTooltip(id) {
  const value = stuff.resultsByLocation.get(id)?.find(d => d.timestep == state.timestep)?.value

  const nExtent = d3.extent(stuff.valueDistribution, d => d.n)
  const nRange = nExtent[1] - nExtent[0]

  return Plot.plot({
    width: 150,
    height: 40,
    x: { label: state.valueField, ticks: []  },
    y: { axis: null, },
    marginTop: 0,
    marginBottom: 15,
    marks: [
      Plot.ruleY([0]),
      Plot.areaY(stuff.valueDistribution, {x: d => (d.low + d.high)/2, y: "n", curve: "basis", fill: "lightgrey"}),
      Plot.ruleX([value], {stroke: "red", y2: nRange/2}),
      Plot.text([value], {x: d => d, frameAnchor: "top", text: value, color: "black", })
    ]
  })
}

function createCellTooltip(locationResults, timestep) {
  const labels = locationResults.map(d => ({timestep: d.timestep, labels: d.statistics.map(d => d.label)}))
  return Plot.plot({
    marginBottom: 20,
    marginTop: 5,
    // TODO: Label fitting margins.
    marginLeft: 5,
    marginRight: 5,
    width: 120,
    height: 40,
    x: {type: "band", ticks: stuff.timestepExtent.map(String), domain: stuff.timesteps.map(String)},
    marks: [
      Plot.cell(labels, {
        x: d => d["timestep"]+"",
        fill: d => labelAggColor(d.labels, stuff.localScaleIndex),
        stroke: d => d.timestep == timestep ? "green" : "none"
      })
    ]
  })
}




start() 