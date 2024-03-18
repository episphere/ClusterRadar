
function setCorrectButton(element) {
  const collapseButton = element.querySelector(".card-collapse-button")
  if (collapseButton) {
    if (element.classList.contains("collapsed")) {
      collapseButton.innerHTML = `<i class="fa-solid fa-left-right"></i>`
    } else {
      collapseButton.innerHTML = `<i class="fa-solid fa-down-left-and-up-right-to-center fa-rotate-by" style="--fa-rotate-angle: 45deg;""></i>`
    }
  }

}

function syncCards(cards) {
  cards.forEach(card => {
    card.classList.remove("expanded")
    card.classList.remove("collapsed")
  })

  cards.forEach(card =>  {
    if (card.getAttribute("card-expanded") == "true" ) {
      card.classList.remove("collapsed")
    } else if (card.getAttribute("card-expanded") == "false") {
      card.classList.remove("expanded")
      card.classList.add("collapsed")
    } 

    setTimeout(() => {
      if (card.getAttribute("card-expanded") == "true") {
        card.classList.add("expanded")
      } 
      setCorrectButton(card)
    }, 210)
  })
}

function cardToggleExpand(cardContainer, cards, targetCard) {
  targetCard.setAttribute("card-expanded", targetCard.getAttribute("card-expanded") == "true" ? "false" : "true")
  smartCollapse(cardContainer, cards, targetCard)

}

function smartCollapse(cardContainer, cards, keepExpanded=null) {
  const containerWidth = cardContainer.getBoundingClientRect().width 

  let resultingExpandedWidth = 0 
  const expandedCards = [...cards].filter(d => d.getAttribute("card-expanded") == "true")
  expandedCards.forEach(card => resultingExpandedWidth += parseInt(card.getAttribute("min-card-width")))

  let widthDeficit = resultingExpandedWidth - containerWidth
  const toCollapse = []
  let widthGained = 0
  if (widthDeficit > 0) {
    for (const card of expandedCards.filter(d => d != keepExpanded)) {
      widthGained += parseInt(card.getAttribute("card-width"))
      toCollapse.push(card)
      if (widthGained > widthDeficit) {
        break
      }
    }
  }
  
  toCollapse.forEach(card => card.setAttribute("card-expanded", false))
  syncCards(cards)
}

function hookExpandableCardContainer(expandableCardContainer) {
  const cardElements = expandableCardContainer.querySelectorAll(".exp-card")

  const cards = []

  // TODO: Add to resize observer 
  for (const cardElement of cardElements) {
    cardElement.setAttribute("card-width", cardElement.getBoundingClientRect().width)
    cardElement.setAttribute("card-expanded", String(cardElement.classList.contains("expanded")))
    const cardButton = cardElement.querySelector(".card-collapse-button")
    if (cardButton) {
      cardButton.addEventListener("click", () => cardToggleExpand(expandableCardContainer, cardElements, cardElement))
    }

    cards.push(new ExpandableCard(cardElement, expandableCardContainer))
  }


  return cards
  // TODO: There's an issue with this where the card contents won't be rendered sometimes (mostly when the console is closed)
  //smartCollapse(expandableCardContainer, cardElements )
}

export function hookExpandableCards() {
  const allCards = []
  for (const expandableCardContainer of document.querySelectorAll(".exp-card-container")) {
    const cards = hookExpandableCardContainer(expandableCardContainer)
    cards.forEach(card => allCards.push(card))
  }
  return allCards
}


class ExpandableCard {
  constructor(element, container) {
    this.id = element.getAttribute("id")
    this.element = element 
    this.container = container
    this.cardContent = this.element.querySelector(".exp-card-content")

    const loader = document.createElement("div")
    loader.classList.add("card-loader")

    this.element.appendChild(loader)
    this.loader = loader

    this.setLoading(true)
  }

  setLoading(loading) {
    if (loading) {
      this.element.classList.add("loading")
      if (loading instanceof HTMLElement) {
        this.element.classList.add("loading-detailed")
        this.loader.innerHTML = ''
        this.loader.appendChild(loading)
      } else if (loading instanceof Object) {
        this.element.classList.add("loading-detailed")
        if (this.progress) {
          this.progressBar.style.width = `${loading.progress}%`
          this.progressLabel.innerText = loading.message
        } else {
          const progressContainer = document.createElement("div")
          progressContainer.classList.add("progress-container")

          const progressLabel = document.createElement("span")
          progressLabel.classList.add("progress-label")
          progressLabel.innerText = loading.message

          const progress = document.createElement("div")
          progress.classList.add("progress")

          const progressBar = document.createElement("div")
          progressBar.classList.add("progress-bar")
          progressBar.classList.add("progress-bar-striped")
          progressBar.classList.add("progress-bar-animated")
          progressBar.setAttribute("role", "progressbar")
          progressBar.style.width = `${loading.progress}%`

          progress.appendChild(progressBar)

          progressContainer.appendChild(progressLabel)
          progressContainer.appendChild(progress)

          this.progress = progress
          this.progressLabel = progressLabel
          this.progressBar = progressBar
          this.loader.appendChild(progressContainer)
        }
      }
    } else {
      this.element.classList.remove("loading")
    }
  }
}