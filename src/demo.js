import { mountConfigurator } from './configurator.js'
import { createEditwell, presets } from './editor.js'
import { callout } from './plugins/callout.js'
import { imageUploads, tables } from './plugins/tools.js'

const images = imageUploads({
  upload(file) {
    if (file.size > 2 * 1024 * 1024) throw new Error('The demo supports images up to 2 MB.')
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Could not read the image.'))
      reader.readAsDataURL(file)
    })
  },
})

const fullToolbar = [...presets.article.slice(0, -3), 'callout', 'link', 'image', 'imageDetails', 'table', '|', 'addRow', 'addColumn', 'deleteRow', 'deleteColumn', 'mergeCells', 'splitCell', 'deleteTable', '|', 'undo', 'redo', '|', 'source']

const article = createEditwell(document.querySelector('#article'), {
  label: 'Article',
  plugins: [callout, tables, images],
  toolbar: fullToolbar,
  tokens: { 'min-height': '255px' },
  content: '<h2>Writing a useful handover</h2><p>Start with the context. Explain what changed, what is still open and who can help.</p><aside data-editwell-callout><p>Keep the next action visible so the reader knows where to start.</p></aside><ul><li><p>Link to supporting material.</p></li><li><p>Record decisions with a date.</p></li></ul>',
})

createEditwell(document.querySelector('#note'), {
  label: 'Quick note',
  toolbar: presets.basic,
  tokens: { 'radius': '5px', 'min-height': '75px', accent: '#304a76', tint: '#e8eefc' },
  content: '<p>Try the compact toolbar here.</p>',
})

mountConfigurator(article, {
  Full: fullToolbar,
  Article: presets.article,
  Basic: presets.basic,
})

const theme = document.querySelector('#theme')
theme.onclick = () => {
  const dark = theme.getAttribute('aria-pressed') === 'false'
  const select = document.querySelector('#config-theme')
  select.value = dark ? 'dark' : 'light'
  select.dispatchEvent(new Event('change'))
}

const status = document.querySelector('#status')
const restore = document.querySelector('#restore')
const key = 'editwell-demo-draft'
try {
  restore.disabled = localStorage.getItem(key) === null
} catch {
  status.textContent = 'Draft storage is unavailable in this browser.'
}
document.querySelector('#save').onclick = () => {
  try {
    article.setSourceMode(false, false)
    localStorage.setItem(key, article.getHTML())
    restore.disabled = false
    status.textContent = 'Draft saved in this browser.'
  } catch {
    status.textContent = 'Could not save the draft.'
  }
}
restore.onclick = () => {
  try {
    const draft = localStorage.getItem(key)
    if (draft === null) {
      status.textContent = 'No saved draft found.'
      return
    }
    article.setContent(draft)
    status.textContent = 'Draft restored.'
  } catch {
    status.textContent = 'Could not restore the draft.'
  }
}
