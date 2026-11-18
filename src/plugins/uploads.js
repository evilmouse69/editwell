import { Node } from '@tiptap/core'
const runtimes = new WeakMap()
export const uploadPlaceholder = Node.create({
  name: 'uploadPlaceholder', group: 'block', atom: true, selectable: true,
  addAttributes: () => ({ uploadId: { default: null } }),
  parseHTML: () => [],
  renderHTML: () => ['div', { 'data-editwell-pending': '' }],
})
const types = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']
function safeImage(value) {
  if (typeof value !== 'string' || !value.trim()) return
  if (/^data:image\/(png|jpeg|gif|webp|avif);base64,[a-z0-9+/]+=*$/i.test(value)) return value
  const url = new URL(value, document.baseURI)
  if (['http:', 'https:'].includes(url.protocol)) return value
}
export function setupUploads(editor, root, services, options) {
  const { t, notify, changed } = services
  const tasks = new Map()
  let counter = 0
  let destroyed = false
  const panel = document.createElement('div')
  panel.className = 'ew-uploads'
  root.append(panel)
  function position(id) {
    let found
    editor.state.doc.descendants((node, pos) => { if (node.type.name === 'uploadPlaceholder' && node.attrs.uploadId === id) found = pos })
    return found
  }
  function render() {
    panel.replaceChildren()
    for (const task of tasks.values()) {
      const row = document.createElement('div')
      const status = document.createElement('span')
      status.setAttribute('role', 'status')
      status.textContent = t(task.state === 'failed' ? 'failed' : 'uploading', { name: task.file.name, progress: task.progress })
      row.append(status)
      if (task.state === 'failed') {
        const retry = document.createElement('button')
        retry.type = 'button'
        retry.textContent = t('retry')
        retry.disabled = !editor.isEditable
        retry.onclick = () => start(task)
        row.append(retry)
      }
      const cancel = document.createElement('button')
      cancel.type = 'button'
      cancel.textContent = t('cancel')
      cancel.onclick = () => cancelTask(task.id)
      row.append(cancel)
      panel.append(row)
    }
    services.onUploads?.(snapshot())
    changed()
  }
  const snapshot = () => Array.from(tasks.values(), ({ id, state, progress, file }) => ({ id, state, progress, name: file.name }))
  function removeNode(id) {
    const pos = position(id)
    if (pos !== undefined) editor.commands.deleteRange({ from: pos, to: pos + 1 })
  }
  function cancelTask(id) {
    const task = tasks.get(id)
    if (!task) return
    tasks.delete(id)
    task.controller?.abort()
    removeNode(id)
    render()
  }
  async function start(task) {
    if (destroyed || position(task.id) === undefined || !editor.isEditable) return
    task.controller?.abort()
    task.controller = new AbortController()
    const signal = task.controller.signal
    task.state = 'uploading'
    task.progress = 0
    render()
    try {
      const value = await options.upload(task.file, {
        signal,
        onProgress(progress) {
          if (destroyed || signal.aborted || task.state !== 'uploading') return
          task.progress = Math.max(0, Math.min(100, Number(progress) || 0))
          render()
        },
      })
      if (destroyed || signal.aborted || !tasks.has(task.id)) return
      const src = safeImage(value)
      if (!src) throw new Error(t('uploadURL'))
      const pos = position(task.id)
      if (pos === undefined) { cancelTask(task.id); return }
      // Cancelling read-only uploads is safer than mutating a locked document.
      if (!editor.isEditable) { cancelTask(task.id); return }
      const tr = editor.state.tr.replaceWith(pos, pos + 1, editor.schema.nodes.image.create({ src, alt: '' }))
      tasks.delete(task.id)
      editor.view.dispatch(tr)
      render()
    } catch (error) {
      if (destroyed || signal.aborted) return
      task.state = 'failed'
      notify('uploadFailed', error)
      options.onError?.(error)
      render()
    }
  }
  function uploadFile(file) {
    if (destroyed) throw new Error(t('destroyed'))
    if (!editor.isEditable) throw new Error(t('readOnly'))
    if (!types.includes(file.type)) { notify('uploadType'); return null }
    if (file.size > options.maxFileSize) { notify('uploadSize'); return null }
    const id = 'upload-' + ++counter
    const task = { id, file, state: 'uploading', progress: 0 }
    tasks.set(id, task)
    if (!editor.commands.insertContent({ type:'uploadPlaceholder', attrs:{ uploadId:id } })) {
      tasks.delete(id)
      notify('invalidSelection')
      return null
    }
    start(task)
    return id
  }
  function transaction() {
    if (destroyed) return
    for (const task of tasks.values()) {
      if (position(task.id) === undefined) {
        tasks.delete(task.id)
        task.controller?.abort()
        notify('uploadDeleted')
      }
    }
    // Undo must not resurrect an upload whose callback has already finished.
    const orphaned = []
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'uploadPlaceholder' && !tasks.has(node.attrs.uploadId)) orphaned.push(pos)
    })
    if (orphaned.length) {
      const tr = editor.state.tr
      for (const pos of orphaned.reverse()) tr.delete(pos, pos + 1)
      tr.setMeta('addToHistory', false)
      editor.view.dispatch(tr)
    }
    render()
  }
  editor.on('update', transaction)
  const runtime = {
    uploadFile, snapshot, cancel: cancelTask,
    retry: id => { const task = tasks.get(id); if (task?.state === 'failed') start(task) },
    pending: () => tasks.size > 0,
    refresh: render,
    destroy() {
      destroyed = true
      for (const task of tasks.values()) task.controller?.abort()
      tasks.clear()
      editor.off('update', transaction)
      runtimes.delete(editor)
      panel.remove()
    },
  }
  runtimes.set(editor, runtime)
  return runtime
}
export function selectImage(editor) {
  let bookmark = editor.state.selection.getBookmark()
  const map = ({ transaction }) => { bookmark = bookmark.map(transaction.mapping) }
  editor.on('transaction', map)
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = types.join(',')
  const cleanup = () => editor.off('transaction', map)
  input.addEventListener('cancel', cleanup, { once:true })
  input.onchange = () => {
    cleanup()
    const file = input.files?.[0]
    if (!file || editor.isDestroyed || !editor.isEditable) return
    const selection = bookmark.resolve(editor.state.doc)
    editor.view.dispatch(editor.state.tr.setSelection(selection))
    runtimes.get(editor)?.uploadFile(file)
  }
  input.click()
}
