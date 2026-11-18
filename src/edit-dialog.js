export function editDialog(editor, root, { title, fields, submit, remove, t = key => ({ cancel:'Cancel', apply:'Apply', removeLink:'Remove link' })[key] }) {
  if (root.querySelector('dialog[open]') || editor.isDestroyed || !editor.isEditable) return
  const previous = document.activeElement
  const dialog = document.createElement('dialog')
  dialog.className = 'ew-dialog'
  dialog.setAttribute('aria-label', title)
  const form = document.createElement('form')
  const heading = document.createElement('h2')
  heading.textContent = title
  form.append(heading)
  const inputs = {}
  for (const [name, { label, value = '', choices, multiline }] of Object.entries(fields)) {
    const wrapper = document.createElement('label')
    const input = document.createElement(choices ? 'select' : multiline ? 'textarea' : 'input')
    if (choices) for (const choice of choices) input.add(new Option(choice.label, choice.value))
    input.value = value
    inputs[name] = input
    wrapper.append(label, input)
    form.append(wrapper)
  }
  const error = document.createElement('p')
  error.setAttribute('role', 'alert')
  const actions = document.createElement('div')
  const button = (label, action) => {
    const element = document.createElement('button')
    element.textContent = label
    element.type = action ? 'button' : 'submit'
    if (action) element.onclick = action
    actions.append(element)
  }
  if (remove) button(t('removeLink'), () => { if (editor.isEditable) remove(); dialog.close() })
  button(t('cancel'), () => dialog.close())
  button(t('apply'))
  form.append(error, actions)
  form.onsubmit = event => {
    event.preventDefault()
    if (!editor.isEditable || editor.isDestroyed) return
    const values = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value.trim()]))
    error.textContent = submit(values) ?? ''
    if (!error.textContent) dialog.close()
  }
  dialog.append(form)
  root.append(dialog)
  dialog.addEventListener('close', () => {
    dialog.remove()
    if (!editor.isDestroyed) {
      if (previous?.isConnected) previous.focus()
      else editor.commands.focus()
    }
  })
  dialog.showModal()
  return dialog
}
