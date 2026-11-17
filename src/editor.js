import { editDialog } from './edit-dialog.js'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import DOMPurify from 'dompurify'
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
    run(editor, root) {
      const { from, to, empty } = editor.state.selection
      const current = editor.getAttributes('link').href ?? ''
      const insert = empty && !current
      editDialog(editor, root, {
        title: current ? 'Edit link' : 'Insert link',
        fields: {
          href: { label: 'Link URL', value: current },
          ...(insert ? { text: { label: 'Link text' } } : {}),
        },
        submit({ href, text }) {
          if (!href || !editor.can().setLink({ href })) return 'Enter a supported link URL.'
          const chain = editor.chain().setTextSelection({ from, to })
          const applied = insert
            ? chain.insertContent({ type: 'text', text: text || href, marks: [{ type: 'link', attrs: { href } }] }).run()
            : chain.extendMarkRange('link').setLink({ href }).run()
          if (!applied) return 'This selection cannot contain a link.'
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

const defaultIcons = {
  paragraph: '¶', heading: 'H₂', bold: 'B', italic: 'I', underline: 'U',
  strike: 'S', bulletList: '☷', orderedList: '≡', quote: '❝',
  code: '‹/›', link: '🔗', undo: '↶', redo: '↷',
}

export const presets = {
  basic: ['bold', 'italic', 'bulletList', '|', 'undo', 'redo'],
  article: ['paragraph', 'heading', '|', 'bold', 'italic', 'underline', 'strike', '|', 'bulletList', 'orderedList', 'quote', 'code', '|', 'undo', 'redo'],
}

const clean = html => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })

export function createEditwell(element, {
  content = '', toolbar = presets.article, plugins = [], features = {},
  theme = 'light', tokens = {}, labels = {}, label = 'Document',
  toolbarStyle = 'icons', icons = {}, editable = true, onChange = () => {},
} = {}) {
  const root = document.createElement('div')
  root.className = 'ew'
  const bar = document.createElement('div')
  bar.className = 'ew-bar'
  bar.setAttribute('role', 'group')
  bar.setAttribute('aria-label', label + ' formatting')
  const surface = document.createElement('div')
  surface.className = 'ew-surface'
  root.append(bar, surface)

  const source = document.createElement('textarea')
  source.className = 'ew-source'
  source.setAttribute('aria-label', label + ' HTML source')
  source.spellcheck = false
  source.hidden = true
  root.append(source)

  const commands = new Map(Object.entries(controls))
  commands.set('source', {
    label: 'HTML source',
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
    content: typeof content === 'string' ? clean(content) : content,
    editable,
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': label },
      transformPastedHTML: clean,
    },
    onUpdate: ({ editor }) => onChange({ html: editor.getHTML(), json: editor.getJSON() }),
  })
  element.append(root)

  const tableMenu = document.createElement('details')
  tableMenu.className = 'ew-table-menu'
  const tableSummary = document.createElement('summary')
  tableSummary.textContent = 'Table actions'
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
      const button = document.createElement('button')
      button.type = 'button'
      const text = labels[id] ?? control.label
      const icon = icons[id] ?? control.icon ?? defaultIcons[id]
      if (toolbarStyle === 'icons' && icon) {
        const glyph = document.createElement('span')
        glyph.className = 'ew-glyph'
        glyph.dataset.control = id
        glyph.textContent = icon
        glyph.setAttribute('aria-hidden', 'true')
        button.append(glyph)
        button.setAttribute('aria-label', text)
        button.title = text
      } else {
        button.textContent = text
      }
      button.addEventListener('mousedown', event => event.preventDefault())
      button.addEventListener('click', () => control.run(editor, root))
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
      if (control.active) button.setAttribute('aria-pressed', String(control.active(editor)))
    }
  }
  function setSourceMode(enabled, focus = true) {
    if (enabled === !source.hidden || (enabled && !editor.isEditable)) return
    if (!enabled && source.value !== editor.getHTML() && editor.isEditable) {
      editor.commands.setContent(clean(source.value))
    }
    source.hidden = !enabled
    surface.hidden = enabled
    if (enabled) source.value = editor.getHTML()
    refresh()
    if (focus) {
      if (enabled) source.focus()
      else if (editor.isEditable) editor.commands.focus()
    }
  }

  editor.on('transaction', refresh)
  const setTheme = (name, overrides = tokens) => {
    root.dataset.theme = name
    for (const property of Array.from(root.style)) {
      if (property.startsWith('--ew-')) root.style.removeProperty(property)
    }
    for (const [key, value] of Object.entries(overrides)) root.style.setProperty('--ew-' + key, value)
  }
  setTheme(theme)
  setToolbar(toolbar)
  return {
    getHTML: () => editor.getHTML(),
    getJSON: () => editor.getJSON(),
    setContent(value) {
      const result = editor.commands.setContent(typeof value === 'string' ? clean(value) : value, {
        emitUpdate: false, errorOnInvalidContent: typeof value !== 'string',
      })
      if (!source.hidden) source.value = editor.getHTML()
      return result
    },
    setSourceMode,
    setToolbar,
    getToolbarControls: () => Array.from(commands, ([id, control]) => ({ id, label: labels[id] ?? control.label })),
    setEditable: value => { if (!value) setSourceMode(false, false); editor.setEditable(value, false); refresh() },
    setTheme,
    destroy: () => { editor.destroy(); root.remove() },
  }
}
