import { TableKit } from '@tiptap/extension-table'
import { mergeAttributes } from '@tiptap/core'
import { editDialog } from '../edit-dialog.js'
import Image from '@tiptap/extension-image'

const tableCommand = (label, command, options) => ({
  label,
  run: editor => editor.chain().focus()[command](options).run(),
  enabled: editor => editor.can()[command](options),
})

export const tables = {
  name: 'tables',
  extensions: [TableKit.configure({ table: { resizable: true } })],
  controls: {
    table: { ...tableCommand('Insert table', 'insertTable', { rows: 3, cols: 3, withHeaderRow: true }), icon: '▦' },
    addRow: { ...tableCommand('Add row', 'addRowAfter'), context: 'table' },
    addColumn: { ...tableCommand('Add column', 'addColumnAfter'), context: 'table' },
    deleteRow: { ...tableCommand('Delete row', 'deleteRow'), context: 'table' },
    deleteColumn: { ...tableCommand('Delete column', 'deleteColumn'), context: 'table' },
    deleteTable: { ...tableCommand('Delete table', 'deleteTable'), context: 'table' },
    mergeCells: { ...tableCommand('Merge cells', 'mergeCells'), context: 'table' },
    splitCell: { ...tableCommand('Split cell', 'splitCell'), context: 'table' },
  },
}

const rasterTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']
const inlineRaster = /^data:image\/(png|jpeg|gif|webp|avif);base64,[a-z0-9+/]+=*$/i

function imageSource(value) {
  if (typeof value !== 'string' || !value.trim()) return
  if (inlineRaster.test(value)) return value
  const url = new URL(value, document.baseURI)
  if (['http:', 'https:'].includes(url.protocol)) return value.trim()
}

const CaptionedImage = Image.extend({
  addAttributes() {
    const inherited = this.parent()
    const readImage = element => element.matches('figure') ? element.querySelector('img') : element
    const attributes = Object.fromEntries(Object.entries(inherited).map(([name, config]) => [
      name, { ...config, parseHTML: element => config.parseHTML ? config.parseHTML(readImage(element)) : readImage(element).getAttribute(name) },
    ]))
    return {
      ...attributes,
      caption: {
        default: '',
        rendered: false,
        parseHTML: element => element.matches('figure') ? element.querySelector('figcaption')?.textContent ?? '' : '',
      },
    }
  },
  parseHTML() {
    return [
      { tag: 'figure[data-editwell-image]', getAttrs: element => element.querySelector('img[src]') ? {} : false },
      ...this.parent(),
    ]
  },
  renderHTML({ node, HTMLAttributes }) {
    const image = ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
    return node.attrs.caption
      ? ['figure', { 'data-editwell-image': '' }, image, ['figcaption', node.attrs.caption]]
      : image
  },
})

export function imageUploads({ upload, onError = error => window.alert(error.message) }) {
  return {
    name: 'imageUploads',
    extensions: [CaptionedImage.configure({ allowBase64: true })],
    controls: {
      imageDetails: {
        label: 'Image details',
        enabled: editor => editor.isActive('image'),
        run(editor, root) {
          const { alt, caption } = editor.getAttributes('image')
          editDialog(editor, root, {
            title: 'Image details',
            fields: {
              alt: { label: 'Alt text (leave blank for decorative images)', value: alt ?? '' },
              caption: { label: 'Caption', value: caption ?? '' },
            },
            submit: values => editor.commands.updateAttributes('image', values) ? undefined : 'Select an image to edit.',
          })
        },
      },
      image: {
        label: 'Upload image',
        icon: '▧',
        enabled: editor => editor.can().setImage({ src: 'placeholder.png' }),
        run(editor) {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = rasterTypes.join(',')
          input.addEventListener('change', async () => {
            const file = input.files?.[0]
            if (!file) return
            try {
              if (!rasterTypes.includes(file.type)) throw new Error('Choose a PNG, JPEG, GIF, WebP or AVIF image.')
              const src = imageSource(await upload(file))
              if (!src) throw new Error('The upload did not return a supported image URL.')
              if (!editor.isDestroyed && editor.isEditable) {
                editor.chain().focus().setImage({ src, alt: '' }).run()
              }
            } catch (error) {
              onError(error)
            }
          }, { once: true })
          input.click()
        },
      },
    },
  }
}
