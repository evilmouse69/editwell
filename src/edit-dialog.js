export function editDialog(editor, root, { title, fields, submit, remove }) {
  if (root.querySelector('dialog[open]')) return
  const dialog = document.createElement('dialog')
  dialog.className = 'ew-dialog'
  dialog.setAttribute('aria-label', title)
  const form = document.createElement('form')
  const heading = document.createElement('h2')
  heading.textContent = title
  form.append(heading)
  const inputs = {}
  for (const [name, { label, value = '' }] of Object.entries(fields)) {
    const wrapper = document.createElement('label')
    const input = document.createElement('input')
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
  if (remove) button('Remove link', () => { remove(); dialog.close() })
  button('Cancel', () => dialog.close())
  button('Apply')
  form.append(error, actions)
  form.onsubmit = event => {
    event.preventDefault()
    const values = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value.trim()]))
    error.textContent = submit(values) ?? ''
    if (!error.textContent) dialog.close()
  }
  dialog.append(form)
  root.append(dialog)
  dialog.addEventListener('close', () => {
    dialog.remove()
    if (!editor.isDestroyed) editor.commands.focus()
  })
  dialog.showModal()
}
