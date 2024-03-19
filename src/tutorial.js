import * as Popper from 'https://cdn.jsdelivr.net/npm/@popperjs/core@2.11.8/+esm'

const tutorial = [
  { 
    title: "Welcome to ClusterRadar!", 
    content: `
    ClusterRadar allows you to explore spatial clusters over time using several different methods at once.</br></br>
    This tutorial is designed to help you get acquainted with the basics. You can revisit this tutorial at any
      time by pressing the information icon <i class="fas fa-info-circle"></i> in the toolbar on the left.
    `
  },
  // { 
  //   title: "The methods", 
  //   content: `
  //   ClusterRadar uses three basic methods for spatial cluster detection. Two of the methods, Local Moran's I and Local
  //   Geary's C are measures of local spatial autocorrelation: basically, does a location's neighbors have values similar to
  //   itself? If positive spatial autocorrelation is detected, then the location can usually be categorized into either a high or a low
  //   cluster. For Geary's C, this sometimes isn't possible which is why you may encounter "Other Positive" or "Other Negative" 
  //   spatial autocorrelation when using this tool. </br></br>
  //   The third method is Getis-Ord G*, which is a little different because it directly measures hot and cold-spots.  </br></br>
  //   It can be quite tricky to understand the difference between these methods. If you want to learn more, we recommend you 
  //   read the manuscript (see the link in the top right of this page)"
  //   `
  // },
  { 
    title: "The methods", 
    content: `
    Spatial clusters are regions of space that exhibit similar values. 
    ClusterRadar uses three basic methods for spatial cluster detection: Local Moran's I, Geary's C, and Getis-Ord G/G*.
    Each of these methods operates differently and provides different results. It can be tricky to understand the difference 
    between these methods. If you want to learn more, we recommend you read the ClusterRadar manuscript or documentation 
    (see the links at the top right of this page)
    `
  },
  {    
    anchor: "#map-card",
    title: "Main map", 
    content: `The main map panel shows a map with each location colored by its cluster assignment. By default, the map
    uses a special coloring method that conveys whether a location is part of a high cluster or a low cluster. The extent to
    which the different clustering methods agree determines the deepness of the color - deeper colors indicate greater agreement.
   `
  },
  {    
    anchor: "#map-card",
    title: "Main map", 
    content: `
    Sometimes an assignment will be made that can't be easily categorized as "high" or "low", in this case the location
    is colored yellow. If the clustering methods appear to disagree, then the location is colored purple. If no significant 
    clustering was detected by any of the methods, then the location is colored light grey.`
  },
  {    
    anchor: "#map-card",
    title: "Main map", 
    content: `
    You can hover over a location in the map to focus on it and see more detail. Try it!`
  },
  {    
    anchor: "#map-card",
    title: "Main map", 
    content: `
    You can also click on a location to keep it in focus. Click on the "x" that appears to take the location out of focus.
    Or you can click on an empty part of the map.`
  },
  {    
    anchor: "#map-card",
    title: "Zoomed map reel", 
    content: `
    If you click and drag on the main map, you can select a bunch of locations to view over time in the side panel on the right.`
  },
  {    
    anchor: "#time-input-container",
    title: "Time slider", 
    content: `
    In the map, you can look through the different timesteps in the data using the time slider.`
  },

  { 
    title: "Density plots", 
    content: `The density plot shows the estimated distributions of the statistics (from permutation testing). The red
    line shows the statistic's value. The dashed lines show the upper and lower boundaries for signficance. If no location
    is in focus, this plot shows the global statistics (for the whole dataset). If a  location is in focus, then this plot
    shows the local statistics for that location.`, 
    anchor: "#distribution-card", 
    placement: "top"
  },
  { 
    title: "Cell plot", 
    content: `The cell plot shows the cluster assignments over time for each method. Like the density plot, this plot shows
    the hglobal statistics unless a specific location is currently in focus.`, 
    anchor: "#cell-card", 
    placement: "top"
  },
  { 
    title: "Time-series",
     content: `The time-series plot shows the values of the statistics over time. Like the density plots, the red line 
     shows the statistics' value an the dashed grey lines show the upper and lower boundaries for significance. Also like
     the other plots, this plot shows the global statistics unless a specific location is currently in focus.`, 
     anchor:  "#time-series-card", 
    placement: "top"
  },
  { 
    title: "Tool bar",
     content: `The toolbar has various configuration options. Hover over each icon to see what it does, and click on it
     to pull up the settings for that option.`, 
     anchor:  "#sidebar", 
    placement: "right"
  },
  { 
    title: "Coloring mode",
     content: `The palette icon allows you to change the coloring mode. By default, the "Aggregate" mode is enabled, but you
     can choose to look at any method on its own if you wish.`, 
     anchor:  "#coloring-mode-button", 
    placement: "right"
  },
  { 
    title: "That's it!",
     content: `That's the end of the tutorial on the basics of ClusterRadar. For more information, or to report a bug
     or provide feedback, see the link icons in the top right of the page. </br></br>
     
     Remeber: You can revisit this tutorial at any
     time by pressing the information icon <i class="fas fa-info-circle"></i> in the toolbar on the left.`, 
  }

]

export function startTutorial(startIndex=0) {
  const elems = {
    mainContainer: document.querySelector("#main-container"),
    tooltip: document.querySelector("#helper-tooltip"),
    title: document.querySelector("#helper-title"),
    content: document.querySelector("#helper-content"),
    closeButton: document.querySelector("#helper-close"),
    skipButton: document.querySelector("#helper-skip-button"),
    prevButton: document.querySelector("#helper-prev-button"),
    nextButton: document.querySelector("#helper-next-button"),
  }

  elems.tooltip.classList.remove("hidden")

  let tutorialIndex = startIndex
  let popper = null 
  let previousAnchor = null
  
  function unshowPrevious() {
    if (previousAnchor)
      previousAnchor.style.border = "none"
  }

  function showCard() {
    unshowPrevious()

    const tutorialCard = tutorial[tutorialIndex]
    elems.title.innerText = tutorialCard.title
    elems.content.innerHTML = tutorialCard.content

    if (popper) popper.destroy() 

    if (tutorialCard.anchor) {
      const anchorElement = document.querySelector(tutorialCard.anchor)
      if (anchorElement) {
        anchorElement.style.border = "2px solid rgb(255,255,0,0.5)"
        previousAnchor = anchorElement

        popper = Popper.createPopper(anchorElement, elems.tooltip, {
          placement: tutorialCard.placement ? tutorialCard.placement : "auto",
          modifiers: [
            {
              name: 'preventOverflow',
              options: {
                boundary: elems.mainContainer,
              },
            },
          ],
        })
      }
    }

    if (tutorialIndex == tutorial.length - 1) {
      elems.nextButton.setAttribute("disabled", "")
    } else {
      elems.nextButton.removeAttribute("disabled")
    }

    if (tutorialIndex == 0) {
      elems.prevButton.setAttribute("disabled", "")
    } else {
      elems.prevButton.removeAttribute("disabled")
    }
  }

  elems.prevButton.addEventListener("click", () => {
    tutorialIndex-- 
    showCard() 
  })

  elems.nextButton.addEventListener("click", () => {
    tutorialIndex++ 
    showCard() 
  })

  elems.closeButton.addEventListener("click", () => {
    unshowPrevious()
    if (popper) popper.destroy() 
    elems.tooltip.classList.add("hidden")
  })
  elems.skipButton.addEventListener("click", () => {
    unshowPrevious()
    if (popper) popper.destroy() 
    elems.tooltip.classList.add("hidden")
  })

  showCard()
  //for (const )
}