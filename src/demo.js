import { articleFormatting, headingAnchors } from './content.js'
import { mountConfigurator } from './configurator.js'
import { createEditwell, presets } from './editor.js'
import { callout } from './plugins/callout.js'
import { imageUploads, tables } from './plugins/tools.js'

const images = imageUploads({
  maxFileSize: 2 * 1024 * 1024,
  upload(file, { signal, onProgress }) {
    if (file.size > 2 * 1024 * 1024) throw new Error('The demo supports images up to 2 MB.')
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async () => {
        for (let progress = 0; progress <= 100; progress += 20) {
          if (signal.aborted) return reject(new DOMException('Cancelled', 'AbortError'))
          onProgress(progress)
          await new Promise(resolve => setTimeout(resolve, 150))
        }
        if (document.querySelector('#fail-upload').checked) return reject(new Error('Demo upload failure'))
        resolve(reader.result)
      }
      signal.addEventListener('abort', () => { reader.abort(); reject(new DOMException('Cancelled', 'AbortError')) }, { once:true })
      reader.onerror = () => reject(new Error('Could not read the image.'))
      reader.readAsDataURL(file)
    })
  },
})

const fullToolbar = [...presets.article.slice(0, -3), 'callout', 'link', 'image', 'imageDetails', 'table', '|', 'addRow', 'addColumn', 'deleteRow', 'deleteColumn', 'mergeCells', 'splitCell', 'deleteTable', '|', 'undo', 'redo', '|', 'source', '|', 'alignment', 'clear', 'find', 'plainPaste', 'internalLink']

const article = createEditwell(document.querySelector('#article'), {
  label: 'Article',
  wordCount: true,
  tableOfContents: true,
  async searchArticles(query, { signal }) {
    await new Promise(resolve => setTimeout(resolve, 200))
    if (signal.aborted) return []
    return [
      { title:'Getting started', url:'#getting-started' },
      { title:'Managing images', url:'#managing-images' },
    ].filter(article => article.title.toLowerCase().includes(query.toLowerCase()))
  },
  plugins: [callout, tables, images, articleFormatting, headingAnchors],
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
    const snapshot = article.exportContent()
    localStorage.setItem(key, snapshot.html)
    article.markSaved(snapshot)
    restore.disabled = false
    status.textContent = 'Draft saved in this browser.'
  } catch (error) {
    status.textContent = error.message
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
