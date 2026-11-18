import { setupUploads, selectImage, uploadPlaceholder } from './uploads.js'
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

export const CaptionedImage = Image.extend({
  addAttributes() {
    const inherited = this.parent()
    const readImage = element => element.matches('figure') ? element.querySelector('img') : element
    const attributes = Object.fromEntries(Object.entries(inherited).map(([name, config]) => [
      name, { ...config, parseHTML: element => config.parseHTML ? config.parseHTML(readImage(element)) : readImage(element).getAttribute(name) },
    ]))
    return {
      ...attributes,
      width: {
        default: null,
        parseHTML: element => {
          const image = readImage(element)
          return image.getAttribute('width') || (/^\d+px$/.test(image.style.width) ? parseInt(image.style.width) : null)
        },
      },
      height: {
        default: null,
        parseHTML: element => {
          const image = readImage(element)
          return image.getAttribute('height') || (/^\d+px$/.test(image.style.height) ? parseInt(image.style.height) : null)
        },
      },
      alignment: {
        default: 'left',
        parseHTML: element => {
          const image = readImage(element)
          const alignment = element.getAttribute('data-alignment') || image.getAttribute('data-alignment') || image.getAttribute('align') || element.style.textAlign
          return ['left', 'center', 'right'].includes(alignment) ? alignment : 'left'
        },
        renderHTML: attrs => ({ 'data-alignment': attrs.alignment }),
      },
      caption: {
        default: '',
        rendered: false,
        parseHTML: element => element.matches('figure') ? element.querySelector('figcaption')?.textContent ?? '' : '',
      },
    }
  },
  parseHTML() {
    return [
      { tag: 'figure', getAttrs: element => element.querySelector('img[src]') ? {} : false },
      ...this.parent(),
    ]
  },
  renderHTML({ node, HTMLAttributes }) {
    const image = ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
    return node.attrs.caption
      ? ['figure', { 'data-editwell-image': '', 'data-alignment': node.attrs.alignment }, image, ['figcaption', node.attrs.caption]]
      : image
  },
})

export function imageUploads({ upload, onError, maxFileSize = 10 * 1024 * 1024 }) {
  return {
    name: 'imageUploads',
    extensions: [CaptionedImage.configure({ allowBase64: true }), uploadPlaceholder],
    setup: (editor, root, services) => setupUploads(editor, root, services, { upload, onError, maxFileSize }),
    controls: {
      imageDetails: {
        label: 'Image details',
        enabled: editor => editor.isActive('image'),
        run(editor, root, { t }) {
          const { alt, caption, width, height, alignment } = editor.getAttributes('image')
          editDialog(editor, root, {
            title: t('imageDetails'),
            t,
            fields: {
              alt: { label: t('alt'), value: alt ?? '' },
              caption: { label: t('caption'), value: caption ?? '' },
              width: { label: t('width'), value: width ?? '' },
              height: { label: t('height'), value: height ?? '' },
              alignment: { label: t('imageAlignment'), value: alignment, choices: ['left', 'center', 'right'].map(value => ({ value, label: t(value) })) },
            },
            submit(values) {
              if (['width', 'height'].some(key => values[key] && !/^[1-9]\d{0,4}$/.test(values[key]))) return t('invalidSize')
              return editor.commands.updateAttributes('image', { ...values, width: Number(values.width) || null, height: Number(values.height) || null }) ? undefined : t('invalidImage')
            },
          })
        },
      },
      image: {
        label: 'Upload image',
        icon: '▧',
        enabled: editor => editor.can().setImage({ src: 'placeholder.png' }),
        run: selectImage,
      },
    },
  }
}
