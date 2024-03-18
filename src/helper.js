import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.8.5/+esm'
import * as Popper from 'https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/+esm'
import * as pathPolyfill from 'https://cdn.skypack.dev/path-data-polyfill@1.0.4?min'
import jszip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";

export function getPathsBoundingBox(selection) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  selection.each(function(d) {
    const bbox = this.getBBox();
    minX = Math.min(minX, bbox.x);
    maxX = Math.max(maxX, bbox.x + bbox.width);
    minY = Math.min(minY, bbox.y);
    maxY = Math.max(maxY, bbox.y + bbox.height);
  });

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function addPathSelectionBox(svgSelect, pathSelect, selectCallback) {
  // Element is the SVG container element. 
  if (!pathSelect) {
    pathSelect = svgSelect
  }

  const points = [] 
  pathSelect.each((d,i,elem) => {
    points.push({value: d, points: elem[i].getPathData().map(d => d.values)})
  })

  //console.log(points)
  addSelectionBox(svgSelect, rect => {
    const selectedPaths = points.filter(points => {
      return anyPointInRectangle(points.points, [rect.x, rect.y, rect.width, rect.height])
    })
    selectCallback(selectedPaths.map(d => d.value))
  })

}

function addSelectionBox(svgSelect, selectCallback = d => d, thresholdSize=10) {

  const selectionBox = svgSelect.append("rect")
    .attr("visibility", "hidden") 
    .attr("fill", "rgba(0,0,255,.1)") 
    .attr("stroke", "black")
    .style("stroke-dasharray", "3,3")

  let isDragging = false
  let startX = 0
  let startY = 0
  let width = 0
  let height = 0

  // The offset is a work-around for when the SVG's real dimensions are larger than its viewbox. 
  // Probably a better way to do this! 
  let viewOffset = [0, 0] 

  svgSelect.on('mousedown', (e) => {
    const bbox = svgSelect.node().getBoundingClientRect()
    const viewBoxSplit = svgSelect.attr("viewBox").split(" ")
    viewOffset = [ 
      (bbox.width - svgSelect.attr("width"))/2 - viewBoxSplit[0], 
      (bbox.height - svgSelect.attr("height"))/2 - viewBoxSplit[1]
    ]

    width = 0
    height = 0
    
    if (e.button == 0) {
      isDragging = true
      //selectionBox.attr("visibility", "visible")
      startX = e.offsetX - viewOffset[0]
      startY = e.offsetY - viewOffset[1]
      selectionBox.attr("x", startX)
      selectionBox.attr("y", startY)
    }

  });

  svgSelect.on('mousemove', (e) => {
    if (!isDragging) return

    width = Math.abs(e.offsetX - startX - viewOffset[0])
    height = Math.abs(e.offsetY - startY - viewOffset[1])

    if (width > thresholdSize || height > thresholdSize) {
      selectionBox.attr("visibility", "visible")
      selectionBox.attr("x", Math.min(e.offsetX - viewOffset[0], startX))
      selectionBox.attr("y", Math.min(e.offsetY - viewOffset[1], startY))
      selectionBox.attr("width", width)
      selectionBox.attr("height", height)
    }
  
  });

  document.addEventListener('mouseup', (e) => {
    if (isDragging) {
      // Handle the selection if needed
      selectionBox.attr("width", 0)
      selectionBox.attr("height", 0)
      selectionBox.attr("visibility", "none")
      isDragging = false

      if (width > thresholdSize || height > thresholdSize) {
        selectCallback({
          x: Math.min(e.offsetX - viewOffset[0], startX ), 
          y: Math.min(e.offsetY - viewOffset[1], startY),
          width: Math.abs(e.offsetX - startX  - viewOffset[0]),
          height: Math.abs(e.offsetY - startY  - viewOffset[1])
        })
      }

    }
  });
}

function anyPointInRectangle(points, rectangle) {
  function isPointInRectangle(point, rectangle) {
    const [pointX, pointY] = point;
    const [rectX, rectY, rectWidth, rectHeight] = rectangle;
  
    if (
      pointX >= rectX &&
      pointX <= rectX + rectWidth &&
      pointY >= rectY &&
      pointY <= rectY + rectHeight
    ) {
      return true;
    }
  
    return false;
  }
  
  for (const point of points) {
    if (isPointInRectangle(point, rectangle)) {
      return true;
    }
  }
  return false;
}

export function geoLinkData(featureCollection, data, index, values=d=>d, copy=false) {
  const indexed = d3.index(data, index) 
  const copiedCollection = copy ? deepCopy(featureCollection) : featureCollection

  for (const feature of copiedCollection.features) {
    const row = indexed.get(feature.id) 
    if (row) {
      for (const [k,v] of Object.entries(values(row))) {
        feature.properties[k] = v 
      }
    }
  }

  return copiedCollection
}

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj))
}

export function debounce(func, delay) {
  let timeoutId;

  return function(...args) {
    clearTimeout(timeoutId); // Clear any existing timeout

    timeoutId = setTimeout(() => {
      func.apply(this, args);  // Call the original function 
    }, delay); 
  };
}

// export function debounce(func, wait) {
//   let timeout;
//   return function executedFunction(...args) {
//     const later = () => {
//       clearTimeout(timeout);
//       func(...args);
//     };
//     clearTimeout(timeout);
//     timeout = setTimeout(later, wait);
//   };
// }

const CACHE_DISABLED = false 
export async function cacheWithVersion(id, versionString, dataFetcher) {
  if (CACHE_DISABLED) {
    return await dataFetcher()
  }

  // Open the IndexedDB database
  const db = await openDB("ClusterRadar", 3, (upgradeDB) => {
    // Create the object store if needed
    if (!upgradeDB.objectStoreNames.contains("cache")) {
      upgradeDB.createObjectStore("cache", { keyPath: "id" });
    }
  });

  const tx = db.transaction("cache", "readwrite");
  const store = tx.objectStore("cache");

  try {
    // Handle the result
    const getRequest = store.get(id); 
    let cachedData = await new Promise((resolve, reject) => {
        getRequest.onsuccess = () => resolve(getRequest.result);
        getRequest.onerror = () => reject(getRequest.error); 
    });

    if (cachedData && cachedData.version === versionString) {
      console.log(`[Cache] Retrieved ${id} from cache (${versionString})`)
      return cachedData.data; // Return cached data
    } else {
      // Delete old version (if present)
      if (cachedData) { 
        await store.delete(id);
      }

      const freshData = await dataFetcher();
      // Open a new transaction for fetching and caching 
      const newTx = db.transaction("cache", "readwrite"); 
      const newStore = newTx.objectStore("cache"); 
      await newStore.put({ id, version: versionString, data: freshData }); 

      await newTx.complete; // Wait for the new transaction to complete
      return freshData; 
    }
  } catch (error) {
    console.error("Error handling cache:", error);
    throw error; // Re-throw to allow for error handling outside the function
  } finally {
    await tx.complete; // Ensure original transaction also completes
  }
}

// Helper function to open the IndexedDB database
async function openDB(dbName, version, upgradeCallback) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);

    request.onupgradeneeded = (event) => upgradeCallback(event.target.result);
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

export function addPopperTooltip(element) {

  const tooltipElement = document.createElement("div")
  tooltipElement.classList.add("custom-tooltip")
  element.appendChild(tooltipElement)

  let popper = null
  function show(targetElement, html) {
    if (popper) popper.destroy()
    popper = Popper.createPopper(targetElement, tooltipElement, {
      placement: "top-start",
      modifiers: [
        {
          name: 'offset',
          options: {
            offset: [10, 10],
          },
        },
        {
          name: 'preventOverflow',
          options: {
            boundary: element,
          },
        },
      ],
    })

    if (html instanceof Element) {
      tooltipElement.innerHTML = ``
      tooltipElement.appendChild(html)
    } else {
      tooltipElement.innerHTML = html
    }

    tooltipElement.style.display = "block"
  }

  function hide() {
    tooltipElement.style.display = "none"
  }

  return { show, hide }
}

export function addOpenableSettings(container, buttonElement, label, content) {
  const buttonLabel = document.createElement("div")
  buttonLabel.classList.add("button-label")
  buttonLabel.innerText = label 

  Popper.createPopper(buttonElement, buttonLabel, {
    placement: "right",
    modifiers: [
      {
        name: 'offset',
        options: {
          offset: [-15, 20],
        },
      },
      {
        name: 'preventOverflow',
        options: {
          boundary: container,
        },
      },
    ],
  })

  
  const settingsContentWrapper = document.createElement("div")
  settingsContentWrapper.classList.add("openable-settings")
  settingsContentWrapper.classList.add("custom-tooltip")
  Popper.createPopper(buttonElement, settingsContentWrapper, {
    placement: "right",
    modifiers: [
      {
        name: 'offset',
        options: {
          offset: [-15, 20],
        },
      },
      {
        name: 'preventOverflow',
        options: {
          boundary: container,
        },
      },
    ],
  })


  function setOpened(opened) {
    if (opened) {
      const settingsTemplate = document.getElementById("settings-template")
      const settingsContent = document.getElementById("settings-content")
      const settingsTitle = document.getElementById("settings-title")
      settingsTitle.innerText = label

      settingsContent.innerHTML = '' 
      settingsContent.appendChild(content)
  
      settingsContentWrapper.style.display = "block"
      settingsContentWrapper.innerHTML = ''
      settingsContentWrapper.appendChild(settingsTemplate)

      settingsContentWrapper.setAttribute("opened", "true")
      const otherSettings = [...document.querySelectorAll(".openable-settings")].filter(d => d != settingsContentWrapper)
      otherSettings.forEach(elem => elem.setOpened(false))
    } else { 
      settingsContentWrapper.removeAttribute("opened")
      settingsContentWrapper.style.display = "none"
    }
  }
  settingsContentWrapper.setOpened = setOpened

  settingsContentWrapper.addEventListener("click", e => e.stopPropagation())

  buttonElement.addEventListener("mouseover", () => {
    buttonLabel.style.display = "block"
  })

  buttonElement.addEventListener("mouseleave", () => {
    buttonLabel.style.display = "none"
  })

  if (!buttonElement.hasAttribute("noopen")) {
    buttonElement.addEventListener("click" , (e) => {
      e.stopPropagation()
      setOpened(!settingsContentWrapper.getAttribute("opened"))
  
      if (settingsContentWrapper.getAttribute("opened")) {
        const settingsContent = document.getElementById("settings-template")
        const settingsTitle = document.getElementById("settings-title")
        settingsTitle.innerText = label
    
        settingsContentWrapper.style.display = "block"
        settingsContentWrapper.innerHTML = ''
        settingsContentWrapper.appendChild(settingsContent)
        buttonLabel.style.display = "none"
      } else {
        settingsContentWrapper.style.display = "none"
      }
    })
  }
  

  document.getElementById("settings-close").addEventListener("click", () => {
    setOpened(false)
  })

  container.addEventListener("click", () => {
    setOpened(false)
  })

  container.appendChild(buttonLabel)
  container.appendChild(settingsContentWrapper)
}

export function downloadData(data, filename) {
  const blob = new Blob([data], { type: 'text/json' })
  const downloadLink = document.createElement('a')
  downloadLink.download = filename
  downloadLink.href = URL.createObjectURL(blob)
  document.body.appendChild(downloadLink)
  downloadLink.click()
  URL.revokeObjectURL(downloadLink.href)
  document.body.removeChild(downloadLink)
}

export async function unzipJson(path, filename) {
  const data = await (await fetch(path)).blob()
  const zip = new jszip()
  await zip.loadAsync(data)
  return JSON.parse(await zip.file(filename).async("string"))
}

export function hookSelect(
  selector,
  state,
  valueProperty,
  optionsProperty,
  format = (d) => d
) {
  const select = document.querySelector(selector);
  if (select == null) {
    throw new Error(`No element found for ${selector}`);
  }

  function setOptions(options) {
    const selectOptions = [];
    select.innerHTML = ``;

    if (options) {
      for (let option of options) {
        if (typeof option == "string") {
          option = { value: option, label: format(option) };
        }
        selectOptions.push(option);
        const optionElement = document.createElement("option");
        optionElement.value = option.value;
        optionElement.innerText = option.label;

        if (option.value == state[valueProperty]) {
          optionElement.selected = true;
          select.value = option.value;
        }
        select.appendChild(optionElement);
      }
    }
  }

  state.subscribe(optionsProperty, () => {
    setOptions(state[optionsProperty]);
    state[valueProperty] = select.value;
  });

  state.subscribe(valueProperty, () => {
    for (const option of select.options) {
      if (option.value == state[valueProperty]) {
        option.selected = true;
      } else {
        option.selected = false;
      }
    }
  });

  select.addEventListener("change", () => {
    state[valueProperty] = select.value;
  });
  setOptions(state[optionsProperty]);

  // if (select.value != "") {
  //   state[valueProperty] = select.value
  // }
}