import DOMPurify from 'dompurify'
import { DOMParser as ModelParser, DOMSerializer } from '@tiptap/pm/model'
import { Extension, Mark, Node } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

export const articleFormatting = {
  name: 'articleFormatting',
  extensions: [
    Extension.create({
      name: 'articleAttributes',
      addGlobalAttributes() {
        return [{
          types: ['paragraph', 'heading', 'blockquote', 'table', 'tableCell', 'tableHeader', 'link'],
          attributes: {
            id: { default: null },
            textAlign: {
              default: null,
              parseHTML: element => ['left', 'center', 'right', 'justify', 'start', 'end'].includes(element.style.textAlign) ? element.style.textAlign : null,
              renderHTML: attrs => attrs.textAlign ? { style: 'text-align:' + attrs.textAlign } : {},
            },
          },
        }]
      },
    }),
    Mark.create({
      name: 'articleAnchor',
      addAttributes: () => ({ id: { default:null } }),
      parseHTML: () => [{ tag:'span[id]' }],
      renderHTML: ({ HTMLAttributes }) => ['span', HTMLAttributes, 0],
    }),
    Mark.create({
      name: 'articleStyle',
      addAttributes() {
        return Object.fromEntries(['color', 'backgroundColor', 'fontFamily', 'fontSize'].map(property => [property, {
          default: null,
          parseHTML: element => element.style[property] || null,
          renderHTML: attrs => attrs[property] ? { style: property.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase()) + ':' + attrs[property] } : {},
        }]))
      },
      parseHTML: () => [{ tag: 'span[style]' }],
      renderHTML: ({ HTMLAttributes }) => ['span', HTMLAttributes, 0],
    }),
    ...['sub', 'sup'].map(tag => Mark.create({
      name: tag, parseHTML: () => [{ tag }], renderHTML: () => [tag, 0],
    })),
    Node.create({
      name: 'namedAnchor', inline: true, group: 'inline', content: 'inline*',
      addAttributes: () => ({ id: { default: null } }),
      parseHTML: () => [{
        tag: 'a[id]:not([href]), a[name]:not([href])',
        getAttrs: element => ({ id: element.id || element.getAttribute('name') }),
      }],
      renderHTML: ({ HTMLAttributes }) => ['a', HTMLAttributes, 0],
    }),
  ],
}

export const headingAnchors = {
  name: 'headingAnchors',
  extensions: [Extension.create({
    name: 'headingAnchors',
    addGlobalAttributes: () => [{ types: ['heading'], attributes: { id: { default: null } } }],
    addProseMirrorPlugins() {
      const viewPrefix = 'ew-heading-' + crypto.randomUUID() + '-'
      return [new Plugin({
        props: {
          nodeViews: {
            heading(node) {
              const dom = document.createElement('h' + node.attrs.level)
              if (node.attrs.id) {
                dom.id = viewPrefix + node.attrs.id
                dom.dataset.anchor = node.attrs.id
              }
              if (node.attrs.textAlign) dom.style.textAlign = node.attrs.textAlign
              return { dom, contentDOM:dom }
            },
          },
        },
        appendTransaction(transactions, oldState, state) {
          if (!transactions.some(transaction => transaction.docChanged)) return null
          const used = new Set()
          const reserved = new Set()
          state.doc.descendants(node => { if (node.attrs.id) reserved.add(node.attrs.id) })
          const tr = state.tr
          state.doc.descendants((node, pos) => {
            const existing = node.attrs.id
            if (existing && !used.has(existing)) { used.add(existing); return }
            if (node.type.name !== 'heading') return
            const base = (node.textContent.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section')
            let id = base
            let suffix = 2
            while (reserved.has(id) || used.has(id)) id = base + '-' + suffix++
            used.add(id)
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, id })
          })
          return tr.docChanged ? tr : null
        },
      })]
    },
  })],
}

// Normalise safe, useful HTML before parsing it through the configured schema.
export function prepareHTML(html) {
  const safe = DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form'] })
  const removed = DOMPurify.removed.map(item => ({
    kind: 'unsafe', tag: item.element?.nodeName?.toLowerCase() ?? item.from?.nodeName?.toLowerCase(),
    attribute: item.attribute?.name,
  }))
  const dom = document.createElement('div')
  dom.innerHTML = safe
  for (const element of dom.querySelectorAll('[style]')) {
    if (/mso-list\s*:/i.test(element.getAttribute('style'))) removed.push({ kind:'office-list-review', tag:element.localName })
    for (const property of ['float', 'position', 'background-image', 'line-height', 'border']) {
      if (element.style.getPropertyValue(property)) removed.push({ kind:'unsupported-style', property })
    }
    for (const property of Array.from(element.style)) {
      if (!['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'width', 'height', 'vertical-align'].includes(property)) element.style.removeProperty(property)
    }
    // An allowed CSS property must not smuggle external requests or executable values.
    if (/url\s*\(|expression\s*\(|javascript:/i.test(element.getAttribute('style'))) element.removeAttribute('style')
  }
  for (const table of dom.querySelectorAll('table')) {
    const cols = Array.from(table.querySelectorAll(':scope > colgroup > col')).flatMap(col => {
      const value = col.getAttribute('width') || col.style.width
      return Array(Number(col.getAttribute('span')) || 1).fill(/^\d+(px)?$/.test(value) ? parseInt(value) : null)
    })
    for (const row of table.rows) {
      let index = 0
      for (const cell of row.cells) {
        const span = cell.colSpan || 1
        const explicit = cell.getAttribute('width') || cell.style.width
        const widths = cols.slice(index, index + span)
        if (!cell.hasAttribute('colwidth') && !cell.hasAttribute('data-colwidth')) {
          if (widths.length === span && widths.every(Boolean)) cell.setAttribute('colwidth', widths.join(','))
          else if (span === 1 && /^\d+(px)?$/.test(explicit)) cell.setAttribute('colwidth', String(parseInt(explicit)))
        }
        index += span
      }
    }
  }
  return { dom, removed }
}

function inspectLoss(before, after) {
  const issues = []
  const ignored = new Set(['div', 'span', 'tbody', 'thead', 'tfoot', 'colgroup', 'col', 'meta'])
  const aliases = { b: 'strong', i: 'em', s: 's', strike: 's' }
  for (const element of before.querySelectorAll('[class]')) {
    if (Array.from(element.classList).some(name => !/^(mso|apple-|docs-|kix-)/i.test(name))) issues.push({ kind:'class-style-removed', tag:element.localName })
  }
  for (const element of before.querySelectorAll('*')) {
    const tag = aliases[element.localName] ?? element.localName
    if (!ignored.has(tag) && !after.querySelector(tag)) issues.push({ kind: 'unsupported-element', tag })
  }
  const text = element => element.textContent.replace(/\s+/g, ' ').trim()
  if (text(before) !== text(after)) issues.push({ kind: 'text-changed' })
  for (const attribute of ['id', 'href', 'src', 'alt', 'width', 'height', 'colspan', 'rowspan']) {
    const expected = Array.from(before.querySelectorAll('[' + attribute + ']')).map(el => el.getAttribute(attribute))
    const actual = new Set(Array.from(after.querySelectorAll('[' + attribute + ']')).map(el => el.getAttribute(attribute)))
    if (expected.some(value => value && !actual.has(value) && value !== '1')) issues.push({ kind: 'attribute-removed', attribute })
  }
  for (const property of ['text-align', 'color', 'background-color', 'font-family', 'font-size']) {
    const actual = new Set(Array.from(after.querySelectorAll('[style]')).map(el => el.style.getPropertyValue(property)))
    if (Array.from(before.querySelectorAll('[style]')).some(el => el.style.getPropertyValue(property) && !actual.has(el.style.getPropertyValue(property)))) issues.push({ kind: 'style-removed', property })
  }
  return issues
}
export function importHTML(html, schema) {
  const { dom, removed } = prepareHTML(html)
  const doc = ModelParser.fromSchema(schema).parse(dom)
  const output = document.createElement('div')
  output.append(DOMSerializer.fromSchema(schema).serializeFragment(doc.content))
  return { doc, issues: [...removed, ...inspectLoss(dom, output)] }
}
