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
}

export function hookInput(selector, state, stateValueProperty) {
  const input = document.querySelector(selector)
  if (input == null) {
    throw new Error(`No element found for ${selector}`)
  }

  state.addListener(() => {   
    input.value = state[stateValueProperty]
  }, stateValueProperty)

  input.addEventListener("change", () => {
    state[stateValueProperty] = input.value 
  })

  input.value = state[stateValueProperty]
}