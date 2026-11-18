import { editDialog } from './edit-dialog.js'
export function writingControls(editor, root, { t, searchArticles, notify }) {
  return {
    clear: {
      run: () => editor.chain().focus().unsetAllMarks().clearNodes().run(),
    },
    plainPaste: {
      run: () => editDialog(editor, root, {
        title: t('plainPaste'), t,
        fields: { text: { label: t('plainText'), multiline: true } },
        submit: ({ text }) => { editor.commands.insertContent(text.split('\n').map(line => ({ type:'paragraph', content: line ? [{ type:'text', text:line }] : [] }))) },
      }),
    },
    find: {
      run: () => editDialog(editor, root, {
        title: t('find'), t: key => t(key === 'apply' ? 'replace' : key),
        fields: { search: { label: t('search') }, replacement: { label: t('replacement') } },
        submit({ search, replacement }) {
          if (!search) return t('noMatch')
          const matches = []
          editor.state.doc.descendants((node, pos) => {
            if (!node.isText) return
            let index = node.text.indexOf(search)
            while (index >= 0) {
              matches.push({ from:pos + index, to:pos + index + search.length, marks:node.marks })
              index = node.text.indexOf(search, index + search.length)
            }
          })
          if (!matches.length) return t('noMatch')
          const tr = editor.state.tr
          for (const match of matches.reverse()) {
            if (replacement) tr.replaceWith(match.from, match.to, editor.schema.text(replacement, match.marks))
            else tr.delete(match.from, match.to)
          }
          editor.view.dispatch(tr)
        },
      }),
    },
    internalLink: {
      enabled: () => Boolean(searchArticles) && typeof editor.commands.setLink === 'function',
      run() {
        if (!searchArticles) return
        const bookmark = editor.state.selection.getBookmark()
        const dialog = document.createElement('dialog')
        dialog.className = 'ew-dialog'
        dialog.setAttribute('aria-label', t('internalLink'))
        const previous = document.activeElement
        const form = document.createElement('form')
        const label = document.createElement('label')
        const query = document.createElement('input')
        label.append(t('articleSearch'), query)
        const search = document.createElement('button')
        search.textContent = t('articleSearch')
        const cancel = document.createElement('button')
        cancel.type = 'button'
        cancel.textContent = t('cancel')
        cancel.onclick = () => dialog.close()
        const results = document.createElement('div')
        const status = document.createElement('p')
        status.setAttribute('role','status')
        form.append(label, search, cancel)
        dialog.append(form, status, results)
        root.append(dialog)
        let controller
        let selection = bookmark
        const map = ({ transaction }) => { selection = selection.map(transaction.mapping) }
        editor.on('transaction', map)
        form.onsubmit = async event => {
          event.preventDefault()
          controller?.abort()
          controller = new AbortController()
          const signal = controller.signal
          status.textContent = t('searching')
          results.replaceChildren()
          try {
            const articles = await searchArticles(query.value, { signal })
            if (signal.aborted || editor.isDestroyed || !dialog.open) return
            status.textContent = articles.length ? '' : t('noResults')
            for (const article of articles) {
              const button = document.createElement('button')
              button.type = 'button'
              button.textContent = article.title
              button.onclick = () => {
                if (!editor.isEditable) return
                const resolved = selection.resolve(editor.state.doc)
                if (!editor.can().setLink({ href:article.url })) { status.textContent = t('invalidLink'); return }
                editor.commands.setTextSelection({ from:resolved.from, to:resolved.to })
                if (resolved.empty) editor.commands.insertContent({ type:'text', text:article.title, marks:[{ type:'link', attrs:{ href:article.url } }] })
                else editor.commands.setLink({ href:article.url })
                dialog.close()
              }
              results.append(button)
            }
          } catch {
            if (!signal.aborted) status.textContent = t('searchFailed')
          }
        }
        dialog.addEventListener('close', () => {
          controller?.abort()
          editor.off('transaction', map)
          dialog.remove()
          if (previous?.isConnected) previous.focus()
        })
        dialog.showModal()
      },
    },
  }
}
