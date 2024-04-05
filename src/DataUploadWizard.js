import { State } from "./State.js"
import { hookSelect } from "./input.js"
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8.5/+esm';
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.13/+esm';

export class DataWizard {
  constructor(element, runCallback, options={}) {
    let {
      spatialDataDefaults,
      vectorDataDefaults,

    } = options

    this.element = element
    this.runCallback = runCallback
    this.spatialDataDefaults = spatialDataDefaults
    this.vectorDataDefaults = vectorDataDefaults

    this.setup()
  }


  async setup() {
    const htmlString = await (await fetch("file_component.html")).text()
    this.element.innerHTML = htmlString

    this.elements = {
      mapPreviewContainer: document.getElementById("map-preview-container"),
      spatialFileUpload: document.getElementById("spatial-file-upload"),
      spatialDataSelect: document.getElementById("spatial-data-select"),
      projectionSelect: document.getElementById("projection-select"),
  
      vectorPreviewContainer: document.getElementById("vector-preview-container"),
      vectorFileUpload: document.getElementById("vector-file-upload"),
      vectorDataSelect: document.getElementById("vector-data-select"),
      spatialFieldSelect: document.getElementById("spatial-field-select"),
      nameFieldSelect: document.getElementById("spatial-name-select"),
      valueFieldSelect: document.getElementById("value-field-select"),

      timeSlider: document.getElementById("time-preview-range"),

      runButton: document.getElementById("run-button")
    }

    hookTabs()

    this.spatialDataMap = new Map() 
    this.vectorDataMap = new Map()

    const state = new State()
    state.defineProperty("spatialDataOptions")
    state.defineProperty("spatialDataValue", "us_counties.geojson")
    state.defineProperty("vectorDataOptions")
    state.defineProperty("vectorDataValue", "age_adjusted_cancer_mortality.csv")
    state.defineProperty("spatialFieldOptions")
    state.defineProperty("spatialFieldValue")
    state.defineProperty("projectionOptions")
    state.defineProperty("projectionValue", "albers-usa")
    state.defineProperty("nameFieldOptions")
    state.defineProperty("nameFieldValue")
    state.defineProperty("valueFieldOptions")
    state.defineProperty("valueFieldValue")
    state.defineProperty("timeFieldOptions")
    state.defineProperty("timeFieldValue")
    state.defineProperty("timestep", null)

    state.defineProperty("spatialData", null)
    state.defineProperty("vectorData", null)
    state.defineProperty("processedVectorData", null)

    state.defineJointProperty("vectorDataConfig", ["spatialFieldValue", "valueFieldValue", "timeFieldValue"])
    
    hookSelect("#spatial-data-select", state, "spatialDataValue", "spatialDataOptions")
    hookSelect("#projection-select", state, "projectionValue", "projectionOptions")
    hookSelect("#vector-data-select", state, "vectorDataValue", "vectorDataOptions")
    hookSelect("#spatial-field-select", state, "spatialFieldValue", "spatialFieldOptions")
    hookSelect("#value-field-select", state, "valueFieldValue", "valueFieldOptions")
    hookSelect("#time-field-select", state, "timeFieldValue", "timeFieldOptions")

    state.subscribe("spatialDataValue", () => this.updatedSpatialDataValue())
    state.subscribe("vectorDataValue", () => this.updatedVectorDataValue())

    state.subscribe("projectionValue", () => this.previewSpatialData())

    state.subscribe("spatialData", () =>  this.updatedSpatialData())
    state.subscribe("vectorData", () => this.updatedVectorData())
    state.subscribe("processedVectorData", () => this.updatedProcessedVectorData())

    state.subscribe("vectorDataConfig", () => this.updatedVectorDataConfig())

    this.state = state
    
    if (this.spatialDataDefaults) {
      this.spatialDataDefaults.forEach(d => this.spatialDataMap.set(d.path, d.path))
      this.state.spatialDataOptions = this.spatialDataDefaults.map(d => ({
        value: d.path, 
        label: d.name
      }))
    }
  
    if (this.vectorDataDefaults) {
      this.vectorDataDefaults.forEach(d => this.vectorDataMap.set(d.path, d.path))
      state.vectorDataOptions = this.vectorDataDefaults.map(d => ({
        value: d.path, 
        label: d.name
      }))
    }

    this.state.projectionOptions = ["albers", "albers-usa", "identity"]

    this.elements.spatialFileUpload.addEventListener("change", (e) => {
      const file = e.target.files[0]
      loadFile(file).then(data => {
        const optionName = "[Upload] " + file.name
        state.spatialDataValue = optionName   
        state.spatialDataOptions.push({value: optionName, label: optionName})
        state.trigger("spatialDataOptions")
        this.spatialDataMap.set(optionName, data)
      })
    })

    this.elements.vectorFileUpload.addEventListener("change", (e) => {
      const file = e.target.files[0]
      loadFile(file).then(data => {
        const optionName = "[Upload] " + file.name
        state.vectorDataValue = optionName   
        state.vectorDataOptions.push({value: optionName, label: optionName})
        state.trigger("vectorDataOptions")
        this.vectorDataMap.set(optionName, data)
      })
    })

    this.elements.timeSlider.addEventListener("input", () => {
      this.timestep = this.timesteps[this.elements.timeSlider.value]
      this.previewSpatialValueData()
    })

    this.elements.runButton.addEventListener("click", () => {
      this.runCallback({
        file: this.state.spatialDataValue.split("/").at(-1),
        data: {
          geoData: this.state.spatialData,
          valueData: this.state.processedVectorData,
        },
        valueField: state.valueFieldValue, 
        geoIdField: state.spatialFieldValue,
        timeField: state.timeFieldValue,
      })
    })
  }

  updatedSpatialDataValue() {
    let spatialData = this.spatialDataMap.get(this.state.spatialDataValue)
    if (typeof spatialData == "string") {
      d3.json(spatialData).then(spatialData => this.state.spatialData = spatialData)
    } else {
      this.state.spatialData = spatialData
    }
  }

  updatedVectorDataValue() {
    let vectorData = this.vectorDataMap.get(this.state.vectorDataValue)
    if (typeof vectorData == "string") {
      d3.csv(vectorData).then(vectorData => this.state.vectorData = vectorData)
    } else {
      this.state.vectorData = vectorData
    }
  }

  updatedSpatialData() {
    this.previewSpatialData()
  }

  updatedVectorData() {
    if (!this.state.spatialData) return 

    const fields = new Set() 
    for (const row of this.state.vectorData) {
      for (const field of Object.keys(row)) {
        fields.add(field)
      }
    }
    this.vectorFields = fields

    this.estimateVectorFields()
  
    this.state.spatialFieldOptions = [...fields]
    this.state.valueFieldOptions = [...fields]
    this.state.timeFieldOptions = [...fields]
    toggleVectorDataSelects(true)
  }

  updatedVectorDataConfig() {
    this.processVectorData()
  }

  updatedProcessedVectorData() {
    this.previewSpatialValueData()
  }



  previewSpatialData() {
    this.elements.mapPreviewContainer.innerHTML = '' 
    if (this.state.spatialData == null) return 
    
    const mapPreview = Plot.plot({
      projection: { type: this.state.projectionValue, domain: this.state.spatialData},
      width: 400,
      marks: [
        Plot.geo(this.state.spatialData, {
          stroke: "grey",
          strokeWidth: .5,
          fill: "white"
        })
      ]
    })

    this.elements.mapPreviewContainer.appendChild(mapPreview)
  }

  previewSpatialValueData() {
    this.elements.vectorPreviewContainer.innerHTML = '' 

    const valueMap = new Map(this.state.processedVectorData.filter(d => d[this.state.timeFieldValue] == this.timestep)
      .map(d => [d[this.state.spatialFieldValue], d[this.state.valueFieldValue]]))
    
    const mapPreview = Plot.plot({
      projection: { type: this.state.projectionValue, domain: this.state.spatialData},
      width: 400,
      marks: [
        Plot.geo(this.state.spatialData, {
          stroke: "grey",
          strokeWidth: .5,
          fill: d => valueMap.get(d.id)
        })
      ]
    })

    this.elements.vectorPreviewContainer.appendChild(mapPreview)
  }

  processVectorData() {
    const data = this.state.vectorData.map(row => ({...row}))
    const timesteps = new Set()
    data.forEach(row => {
      row[this.state.valueFieldValue] = parseFloat(row[this.state.valueFieldValue])
      timesteps.add(row[this.state.timeFieldValue])
    })
  
    const timestepsSorted = [...timesteps].map(d => [new Date(d), d]).sort((a,b) => (a[0]-b[0])).map((d,i) => d[1])
    this.timesteps = timestepsSorted
    this.elements.timeSlider.setAttribute("min", 0)
    this.elements.timeSlider.setAttribute("max", this.timesteps.length-1)
    this.elements.timeSlider.setAttribute("value",  this.timesteps.length-1)
    this.timestep = this.timesteps.at(-1)
    this.state.processedVectorData = data
  }

  estimateVectorFields() {
    let vectorFieldsArr = [...this.vectorFields]
    const spatialIds = new Set(this.state.spatialData.features.map(d => d.id))
  
    let maxLinks = -1
    let possibleIdField = null 
    for (const vectorField of vectorFieldsArr) {
      const links = d3.intersection(spatialIds, new Set(this.state.vectorData.map(d => d[vectorField])))
      if (links.size > maxLinks) {
        possibleIdField = vectorField
        maxLinks = links.size 
      }
    }
    vectorFieldsArr = vectorFieldsArr.filter(d => d != possibleIdField)
  
    const grouped = d3.flatGroup(this.state.vectorData, d => d[possibleIdField])
    let minTimeScore = Infinity
    let possibleTimeField = null
    let possibleValueField = null
    let maxAllValues = -1
    for (const field of vectorFieldsArr) {
      let allValues = new Set()
  
      let timeScore = 0
      for (const [_, rows] of grouped) {
        const unique = new Set(rows.map(d => d[field]))
        rows.forEach(d => allValues.add(d[field]))
        timeScore += Math.abs(unique.size - rows.length)
      }
      timeScore += allValues.size
      if (timeScore < minTimeScore) {
        possibleTimeField = field 
        minTimeScore = timeScore
      }
      if (allValues.size > maxAllValues) {
        maxAllValues = allValues.size 
        possibleValueField = field
      }
    }
  
    this.state.spatialFieldValue = possibleIdField
    this.state.timeFieldValue = possibleTimeField
    this.state.valueFieldValue = possibleValueField
  }
}

function loadFile(file) {

  let resolver = null
  const promise = new Promise((resolve) => resolver = resolve)
  
  const reader = new FileReader()
  function parseFile() {
    let data = null
    if (file.type == "application/json" || file.type == "application/geo+json") {
      data = JSON.parse(reader.result)
    } else {
      data = d3.csvParse(reader.result)
    }
    resolver(data)
  }

  reader.addEventListener("load", parseFile, false);
  if (file) {
    reader.readAsText(file)
  }

  return promise
}

function toggleVectorDataSelects(enabled) {
  const selects = ["spatial-field-select", "value-field-select", "time-field-select"].map(d => document.getElementById(d))
  for (const select of selects) {
    if (enabled) {
      select.removeAttribute("disabled")
    } else {
      select.setAttribute("disabled", "")
    }
  }
}

function hookTabs() {
  const tabs = ["map-file", "vector-data"].map(tabName => {
    const navLink = document.getElementById(`nav-${tabName}`)
    return {
      tabName,
      navLink,
      tabPane: document.getElementById(`tab-${tabName}`),
      active: navLink.classList.contains("active")
    }
  })

  for (const tab of tabs) {
    tab.navLink.addEventListener("click", e => {
      if (!tab.active) {
        tab.navLink.classList.add("active")
        tab.tabPane.classList.add("show")
        tab.tabPane.classList.add("active")
        for (const otherTab of tabs.filter(d => d.tabName != tab.tabName)) {
          if (otherTab.active) {
            otherTab.active = false 
            otherTab.navLink.classList.remove("active")
            otherTab.tabPane.classList.remove("show")
            otherTab.tabPane.classList.remove("active")
          }
        }
        tab.active = true
      } 
    })
  }
}