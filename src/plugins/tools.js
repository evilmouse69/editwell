import { TableKit } from '@tiptap/extension-table'
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
    addRow: tableCommand('Add row', 'addRowAfter'),
    addColumn: tableCommand('Add column', 'addColumnAfter'),
    deleteRow: tableCommand('Delete row', 'deleteRow'),
    deleteColumn: tableCommand('Delete column', 'deleteColumn'),
    deleteTable: tableCommand('Delete table', 'deleteTable'),
    mergeCells: tableCommand('Merge cells', 'mergeCells'),
    splitCell: tableCommand('Split cell', 'splitCell'),
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

export function imageUploads({ upload, onError = error => window.alert(error.message) }) {
  return {
    name: 'imageUploads',
    extensions: [Image.configure({ allowBase64: true })],
    controls: {
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
