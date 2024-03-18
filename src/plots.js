
import * as Plot from 'https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.13/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8.5/+esm';


export function plotChoropleth(element, plotOptions) {
  const elementBbox = element.getBoundingClientRect() 

  // Get the appropriate projection from the Plot options object
  let projection = null 
  if (plotOptions.projection) {
    let projectionName = typeof plotOptions.projection == "string" ? 
      plotOptions.projection : plotOptions.projection.type
    projectionName = kebabToPascal(projectionName)
    
    if (d3["geo" + projectionName]) {
      projection = d3["geo" + projectionName]()
    } else {
      throw new Error(`Projection ${projectionName} not supported`)
    }
  }
  const pathGenerator = d3.geoPath().projection(projection)

  // Get the bounding box of all map features in the Plot options object
  const allFeatures = []
  plotOptions.marks.filter(mark => mark.ariaLabel == "geo")
    .forEach(mark => mark.data
      .forEach(feature => allFeatures.push(feature)))
  const mapBbox = pathGenerator.bounds({type: "FeatureCollection", features: allFeatures})

  // Size the plot so that it fits into the container as snugly as possible.
  const mapWidth = mapBbox[1][0] - mapBbox[0][0]
  const mapHeight = mapBbox[1][1] - mapBbox[0][1]
  const mapAspectRatio = Math.abs(mapWidth/mapHeight)
  const elementAspectRatio = elementBbox.width / elementBbox.height 

  let scalingFactor = 0
  if (elementAspectRatio > mapAspectRatio) {
    scalingFactor = elementBbox.height / mapHeight 
  } else {
    scalingFactor = elementBbox.width / mapWidth 
  }

  // plotOptions.width = mapWidth * scalingFactor
  // plotOptions.height = mapHeight * scalingFactor
  plotOptions.width = elementBbox.width 
  plotOptions.height = elementBbox.height
  
  const plot = Plot.plot(plotOptions)
  element.innerHTML = '' 
  element.appendChild(plot)
  return plot
}

//export function sizeToElement(element, )


export function categoricalColorLegend(entries) {
  const div = document.createElement("div")
  div.classList.add("color-legend-cat")
  
  for (const entry of entries) {
    const entryElement = document.createElement("div")
    entryElement.classList.add("color-legend-cat-entry")

    const colorPatch = document.createElement("div")  
    colorPatch.classList.add("color-legend-cat-patch")
    colorPatch.style.backgroundColor = entry.color

    const label = document.createElement("span")
    label.innerText = entry.shortLabel ? entry.shortLabel : entry.label

    entryElement.appendChild(colorPatch)
    entryElement.appendChild(label)
    div.appendChild(entryElement)
  }

  return div 
}


/** ===== Helper===== */

function kebabToPascal(str) {
  return str.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')
}
