export function mountConfigurator(editor, presets) {
  const preset = document.querySelector('#config-preset')
  const theme = document.querySelector('#config-theme')
  const list = document.querySelector('#config-tools')
  const output = document.querySelector('#config-output')
  const status = document.querySelector('#config-status')
  const controls = editor.getToolbarControls()
  const labels = new Map(controls.map(({ id, label }) => [id, label]))
  const separatorPrefix = 'separator-'
  let order = []
  let visible = new Set()

  for (const name of [...Object.keys(presets), 'Custom']) preset.add(new Option(name))
  preset.options[preset.options.length - 1].disabled = true

  function apply() {
    const toolbar = order.filter(id => visible.has(id)).map(id => labels.has(id) ? id : '|')
    editor.setToolbar(toolbar)
    const options = { toolbar, theme: theme.value }
    output.value = JSON.stringify(options, null, 2)
    status.textContent = ''
  }

  function render() {
    list.replaceChildren()
    for (const [index, id] of order.entries()) {
      const name = labels.get(id) ?? 'Separator ' + id.slice(separatorPrefix.length)
      const item = document.createElement('li')
      const label = document.createElement('label')
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.checked = visible.has(id)
      checkbox.onchange = () => {
        if (checkbox.checked) visible.add(id)
        else visible.delete(id)
        preset.value = 'Custom'
        apply()
      }
      label.append(checkbox, ' ' + name)
      const actions = document.createElement('span')
      for (const [direction, offset, arrow] of [['up', -1, '↑'], ['down', 1, '↓']]) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = arrow
        button.setAttribute('aria-label', 'Move ' + name + ' ' + direction)
        const target = index + offset
        button.disabled = target < 0 || target >= order.length
        button.onclick = () => {
          order[index] = order[target]
          order[target] = id
          preset.value = 'Custom'
          render()
          const buttons = list.children[target].querySelectorAll('button')
          const matching = buttons[offset === -1 ? 0 : 1]
          const opposite = buttons[offset === -1 ? 1 : 0]
          ;(matching.disabled ? opposite : matching).focus()
          apply()
        }
        actions.append(button)
      }
      item.append(label, actions)
      list.append(item)
    }
  }

  function selectPreset(name) {
    let separators = 0
    const selected = presets[name].map(id => id === '|' ? separatorPrefix + ++separators : id)
    visible = new Set(selected)
    order = [...selected, ...controls.map(({ id }) => id).filter(id => !visible.has(id))]
    render()
    apply()
  }

  preset.onchange = () => selectPreset(preset.value)
  theme.onchange = () => {
    editor.setTheme(theme.value)
    document.querySelector('#theme').setAttribute('aria-pressed', String(theme.value === 'dark'))
    apply()
  }

  document.querySelector('#config-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(output.value)
      status.textContent = 'Configuration copied.'
    } catch {
      output.focus()
      output.select()
      status.textContent = 'Press Ctrl+C or Command+C to copy the selected configuration.'
    }
  }

  selectPreset(preset.value)
}
