import { editDialog } from './edit-dialog.js'
import { Editor } from '@tiptap/core'
import { DOMSerializer } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import { importHTML, prepareHTML } from './content.js'
import { translator } from './i18n.js'
import { icon } from './icons.js'
import { writingControls } from './writing-tools.js'
import './themes/light.css'
import './themes/dark.css'
import './style.css'

const toggle = (label, name, command, attrs) => ({
  label,
  run: editor => editor.chain().focus()[command](attrs).run(),
  active: editor => editor.isActive(name, attrs),
  enabled: editor => typeof editor.commands[command] === 'function' && editor.can().chain()[command](attrs).run(),
})

const controls = {
  paragraph: toggle('Text', 'paragraph', 'setParagraph'),
  heading: toggle('Heading', 'heading', 'toggleHeading', { level: 2 }),
  bold: toggle('Bold', 'bold', 'toggleBold'),
  italic: toggle('Italic', 'italic', 'toggleItalic'),
  underline: toggle('Underline', 'underline', 'toggleUnderline'),
  strike: toggle('Strike', 'strike', 'toggleStrike'),
  bulletList: toggle('Bullets', 'bulletList', 'toggleBulletList'),
  orderedList: toggle('Numbered', 'orderedList', 'toggleOrderedList'),
  quote: toggle('Quote', 'blockquote', 'toggleBlockquote'),
  code: toggle('Code block', 'codeBlock', 'toggleCodeBlock'),
  link: {
    label: 'Insert or edit link',
    active: editor => editor.isActive('link'),
    enabled: editor => typeof editor.commands.setLink === 'function' &&
      (editor.isActive('link') || editor.can().setLink({ href: 'https://example.com' }) || editor.state.selection.empty && editor.isActive('paragraph')),
    run(editor, root, { t }) {
      const { from, to, empty } = editor.state.selection
      const current = editor.getAttributes('link').href ?? ''
      const insert = empty && !current
      editDialog(editor, root, {
        title: t(current ? 'editLink' : 'insertLink'),
        t,
        fields: {
          href: { label: t('href'), value: current },
          ...(insert ? { text: { label: t('linkText') } } : {}),
        },
        submit({ href, text }) {
          if (!href || !editor.can().setLink({ href })) return t('invalidLink')
          const chain = editor.chain().setTextSelection({ from, to })
          const applied = insert
            ? chain.insertContent({ type: 'text', text: text || href, marks: [{ type: 'link', attrs: { href } }] }).run()
            : chain.extendMarkRange('link').setLink({ href }).run()
          if (!applied) return t('invalidSelection')
        },
        remove: current ? () => editor.chain().setTextSelection({ from, to }).extendMarkRange('link').unsetLink().run() : null,
      })
    },
  },
  undo: toggle('Undo', '', 'undo'),
  redo: toggle('Redo', '', 'redo'),
}
delete controls.undo.active
delete controls.redo.active

export const presets = {
  basic: ['bold', 'italic', 'bulletList', '|', 'undo', 'redo'],
  article: ['paragraph', 'heading', '|', 'bold', 'italic', 'underline', 'strike', '|', 'bulletList', 'orderedList', 'quote', 'code', '|', 'undo', 'redo'],
}


export function createEditwell(element, {
  content = '', toolbar = presets.article, plugins = [], features = {},
  theme = 'light', tokens = {}, labels = {}, label,
  locale = 'en', messages = {}, direction = 'ltr', headingLevels = [2, 3, 4],
  onContentWarning = () => {}, onError = () => {}, onStateChange = () => {},
  onUploadsChange = () => {}, searchArticles, wordCount = false, tableOfContents = false,
  toolbarStyle = 'icons', icons = {}, editable = true, onChange = () => {},
} = {}) {
  const t = translator(locale, messages)
  label ??= t('document')
  let savedDocument
  let destroyed = false
  let report = []
  let originalHTML = null
  let reviewed = true
  let api
  let lifecycle = []
  const root = document.createElement('div')
  root.className = 'ew'
  root.dir = direction
  root.lang = locale
  const notice = document.createElement('div')
  notice.className = 'ew-notice'
  notice.setAttribute('role', 'status')
  const reportDetails = document.createElement('pre')
  reportDetails.className = 'ew-report'
  reportDetails.hidden = true
  const accept = document.createElement('button')
  accept.type = 'button'
  accept.textContent = t('acknowledge')
  accept.hidden = true
  accept.onclick = () => { reviewed = true; accept.hidden = true; notifyState() }
  root.append(notice, reportDetails, accept)
  function notify(key, cause) {
    notice.textContent = t(key)
    onError({ code:key, message:t(key), cause })
  }
  function recordReport(issues, original = null) {
    originalHTML = issues.length ? original : null
    report = issues
    reviewed = !issues.length
    notice.textContent = issues.length ? t('contentWarning') : ''
    reportDetails.hidden = !issues.length
    reportDetails.textContent = JSON.stringify(issues, null, 2)
    accept.hidden = !issues.length
    if (issues.length) onContentWarning(issues)
  }
  function notifyState() {
    if (api && !destroyed) onStateChange(api.getState())
  }
  const bar = document.createElement('div')
  bar.className = 'ew-bar'
  bar.setAttribute('role', 'group')
  bar.setAttribute('aria-label', t('formattingLabel', { label }))
  const surface = document.createElement('div')
  surface.className = 'ew-surface'
  root.append(bar, surface)

  const source = document.createElement('textarea')
  source.className = 'ew-source'
  source.setAttribute('aria-label', t('sourceLabel', { label }))
  source.spellcheck = false
  source.hidden = true
  root.append(source)

  const commands = new Map(Object.entries(controls))
  commands.set('source', {
    label: t('source'),
    icon: '</>',
    active: () => !source.hidden,
    run: () => setSourceMode(source.hidden),
  })
  const names = new Set()
  for (const plugin of plugins) {
    if (!plugin.name || names.has(plugin.name)) throw new Error('Plugins need unique names')
    names.add(plugin.name)
    for (const [id, control] of Object.entries(plugin.controls ?? {})) {
      if (commands.has(id)) throw new Error('Duplicate toolbar control: ' + id)
      commands.set(id, control)
    }
  }

  const editor = new Editor({
    element: surface,
    extensions: [StarterKit.configure({ link: { openOnClick: false }, ...features }), ...plugins.flatMap(plugin => plugin.extensions ?? [])],
    content: '',
    editable,
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': label },
      transformPastedHTML(html) {
        const imported = importHTML(html, editor.schema)
        if (imported.issues.length) recordReport(imported.issues, html)
        return prepareHTML(html).dom.innerHTML
      },
    },
    onUpdate: ({ editor }) => {
      onChange({ html: editor.getHTML(), json: editor.getJSON() })
      notifyState()
    },
  })
  function jsonHTML(value) {
    const doc = editor.schema.nodeFromJSON(value)
    doc.check()
    const container = document.createElement('div')
    container.append(DOMSerializer.fromSchema(editor.schema).serializeFragment(doc.content))
    return container.innerHTML
  }
  function loadContent(value) {
    try {
      return importHTML(typeof value === 'string' ? value : jsonHTML(value), editor.schema)
    } catch (cause) {
      notify('invalidContent', cause)
      throw new Error(t('invalidContent'), { cause })
    }
  }
  element.append(root)
  {
    let imported
    try { imported = loadContent(content) }
    catch (error) { editor.destroy(); root.remove(); throw error }
    editor.chain().command(({ tr }) => { tr.setMeta('addToHistory', false); return true }).setContent(typeof content !== 'string' && !imported.issues.length ? content : imported.doc.toJSON(), { emitUpdate:false }).run()
    recordReport(imported.issues, typeof content === 'string' ? content : null)
  }
  if (plugins.some(plugin => plugin.name === 'headingAnchors')) editor.chain().command(({ tr }) => { tr.setMeta('addToHistory', false); return true }).setContent(editor.getJSON(), { emitUpdate:false }).run()
  savedDocument = JSON.stringify(editor.getJSON())
  const services = { t, notify, changed:notifyState, onUploads:onUploadsChange }
  for (const [id, control] of Object.entries(writingControls(editor, root, { ...services, searchArticles }))) commands.set(id, control)
  lifecycle = plugins.map(plugin => plugin.setup?.(editor, root, services)).filter(Boolean)
  const uploadManager = lifecycle.find(instance => instance.uploadFile)
  const outline = document.createElement('nav')
  outline.setAttribute('aria-label', t('toc'))
  outline.className = 'ew-outline'
  outline.hidden = !tableOfContents
  root.insertBefore(outline, surface)
  const count = document.createElement('div')
  count.className = 'ew-count'
  count.hidden = !wordCount
  root.append(count)
  function updateDocumentUI() {
    count.textContent = t('wordCount', { count:editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ').trim().split(/\s+/u).filter(Boolean).length })
    outline.replaceChildren()
    if (tableOfContents) editor.state.doc.descendants(node => {
      if (node.type.name !== 'heading' || !node.attrs.id) return
      const link = document.createElement('a')
      link.textContent = node.textContent
      link.href = '#' + encodeURIComponent(node.attrs.id)
      link.onclick = event => {
        event.preventDefault()
        Array.from(surface.querySelectorAll('[data-anchor], [id]')).find(element => element.dataset.anchor === node.attrs.id || element.id === node.attrs.id)?.scrollIntoView({ block:'nearest' })
      }
      outline.append(link)
    })
  }
  editor.on('update', updateDocumentUI)
  updateDocumentUI()
  source.addEventListener('input', notifyState)

  const tableMenu = document.createElement('details')
  tableMenu.className = 'ew-table-menu'
  const tableSummary = document.createElement('summary')
  tableSummary.textContent = t('tableActions')
  const tableActions = document.createElement('div')
  tableMenu.append(tableSummary, tableActions)
  const buttons = []
  function setToolbar(items) {
    if (!items.includes('source')) setSourceMode(false, false)
    buttons.length = 0
    bar.replaceChildren()
    tableActions.replaceChildren()
    for (const id of items) {
      if (id === '|') {
        const divider = document.createElement('span')
        divider.className = 'ew-divider'
        divider.setAttribute('aria-hidden', 'true')
        bar.append(divider)
        continue
      }
      const control = commands.get(id)
      if (!control) continue
      if (id === 'heading' || id === 'alignment') {
        const select = document.createElement('select')
        select.setAttribute('aria-label', labels[id] ?? t(id))
        const choices = id === 'heading'
          ? [{ value:'0', text:t('paragraph') }, ...headingLevels.map(level => ({ value:String(level), text:t('headingLevel', { level }) }))]
          : ['left','center','right','justify'].map(value => ({ value, text:t(value) }))
        for (const choice of choices) select.add(new Option(choice.text, choice.value))
        select.onchange = () => {
          const chain = editor.chain().focus()
          if (id === 'heading') {
            if (Number(select.value)) chain.setHeading({ level:Number(select.value) }).run()
            else chain.setParagraph().run()
          } else {
            chain.updateAttributes(editor.isActive('heading') ? 'heading' : 'paragraph', { textAlign:select.value }).run()
          }
        }
        buttons.push({ button:select, control, id })
        bar.append(select)
        continue
      }
      const button = document.createElement('button')
      button.type = 'button'
      const text = labels[id] ?? (t(id) === id ? control.label ?? id : t(id))
      if (toolbarStyle === 'icons' && !control.context) {
        const custom = icons[id]
        if (custom) {
          const glyph = document.createElement('span')
          glyph.textContent = custom
          glyph.setAttribute('aria-hidden', 'true')
          button.append(glyph)
        } else button.append(icon(id))
        button.setAttribute('aria-label', text)
        button.title = text
      } else button.textContent = text
      button.addEventListener('mousedown', event => event.preventDefault())
      button.addEventListener('click', () => control.run(editor, root, services))
      buttons.push({ button, control, id })
      if (control.context === 'table') tableActions.append(button)
      else bar.append(button)
    }
    if (tableActions.childElementCount) bar.append(tableMenu)
    refresh()
  }
  const refresh = () => {
    tableMenu.hidden = source.hidden === false || !editor.isEditable || !editor.isActive('table')
    if (tableMenu.hidden) tableMenu.open = false
    bar.hidden = !buttons.some(({ control }) => control.context !== 'table' || !tableMenu.hidden)
    for (const { button, control, id } of buttons) {
      button.disabled = id === 'source' ? source.hidden && !editor.isEditable : !source.hidden || !editor.isEditable || !(control.enabled?.(editor) ?? true)
      if (id === 'heading' && button.tagName === 'SELECT') button.value = String(editor.getAttributes('heading').level ?? 0)
      if (id === 'alignment' && button.tagName === 'SELECT') button.value = editor.getAttributes(editor.isActive('heading') ? 'heading' : 'paragraph').textAlign ?? 'left'
      if (control.active) button.setAttribute('aria-pressed', String(control.active(editor)))
    }
  }
  function setSourceMode(enabled, focus = true) {
    if (enabled && uploadManager?.pending()) { notify('pendingSave'); return }
    if (enabled === !source.hidden || (enabled && !editor.isEditable)) return
    if (!enabled && source.value !== editor.getHTML() && editor.isEditable) {
      const imported = importHTML(source.value, editor.schema)
      recordReport(imported.issues, source.value)
      source.hidden = true
      surface.hidden = false
      editor.commands.setContent(imported.doc.toJSON())
    }
    source.hidden = !enabled
    surface.hidden = enabled
    if (enabled) source.value = editor.getHTML()
    refresh()
    notifyState()
    if (focus) {
      if (enabled) source.focus()
      else if (editor.isEditable) editor.commands.focus()
    }
  }

  tableMenu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { tableMenu.open = false; tableSummary.focus(); event.stopPropagation() }
  })
  editor.on('transaction', refresh)
  commands.set('alignment', { enabled: () => Boolean(editor.schema.nodes.paragraph?.spec.attrs?.textAlign) })
  const setTheme = (name, overrides = tokens) => {
    root.dataset.theme = name
    for (const property of Array.from(root.style)) {
      if (property.startsWith('--ew-')) root.style.removeProperty(property)
    }
    for (const [key, value] of Object.entries(overrides)) root.style.setProperty('--ew-' + key, value)
  }
  setTheme(theme)
  setToolbar(toolbar)
  api = {
    getHTML: () => editor.getHTML(),
    getJSON: () => editor.getJSON(),
    setContent(value) {
      if (destroyed) throw new Error(t('destroyed'))
      if (uploadManager?.pending()) throw new Error(t('uploadBusy'))
      const imported = loadContent(value)
      for (const dialog of root.querySelectorAll('dialog')) dialog.close()
      const result = editor.commands.setContent(typeof value !== 'string' && !imported.issues.length ? value : imported.doc.toJSON(), {
        emitUpdate:false, errorOnInvalidContent:true,
      })
      recordReport(imported?.issues ?? [], typeof value === 'string' ? value : null)
      if (!source.hidden) source.value = editor.getHTML()
      updateDocumentUI()
      notifyState()
      return result
    },
    exportContent() {
      if (destroyed) throw new Error(t('destroyed'))
      if (uploadManager?.pending()) throw new Error(t('pendingSave'))
      setSourceMode(false, false)
      if (!reviewed) throw new Error(t('contentRemoved'))
      return { html:editor.getHTML(), json:editor.getJSON() }
    },
    getState: () => ({
      dirty: JSON.stringify(editor.getJSON()) !== savedDocument || !source.hidden && source.value !== editor.getHTML(),
      uploads: uploadManager?.snapshot() ?? [],
      sourceMode: !source.hidden,
      originalHTML,
      contentReport: report.map(issue => ({ ...issue })),
      needsContentReview: !reviewed,
    }),
    isDirty: () => api.getState().dirty,
    markSaved(snapshot) {
      const saved = snapshot ?? api.exportContent()
      savedDocument = JSON.stringify(saved.json)
      notifyState()
    },
    acceptContentChanges() { reviewed = true; accept.hidden = true; notifyState() },
    uploadImage(file) {
      if (!source.hidden) throw new Error(t('uploadBusy'))
      return uploadManager?.uploadFile(file)
    },
    cancelUpload: id => uploadManager?.cancel(id),
    retryUpload: id => uploadManager?.retry(id),
    setSourceMode,
    setToolbar,
    getToolbarControls: () => Array.from(commands, ([id, control]) => ({ id, label: labels[id] ?? (t(id) === id ? control.label ?? id : t(id)) })),
    setEditable: value => {
      if (!value) {
        setSourceMode(false, false)
        for (const task of uploadManager?.snapshot() ?? []) uploadManager.cancel(task.id)
        for (const dialog of root.querySelectorAll('dialog')) dialog.close()
      }
      editor.setEditable(value, false)
      refresh()
      notifyState()
    },
    setTheme,
    destroy() {
      destroyed = true
      for (const instance of lifecycle) instance.destroy?.()
      for (const dialog of root.querySelectorAll('dialog')) dialog.close()
      editor.destroy()
      root.remove()
    },
  }
  return api
}
