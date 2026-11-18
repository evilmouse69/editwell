import { test, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { createServer } from 'vite'
let server, browser, page, base
const chrome = process.env.EDITWELL_CHROME || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined)
before(async () => {
  server = await createServer({ server:{ host:'127.0.0.1', port:0 } })
  await server.listen()
  base = server.resolvedUrls.local[0]
  browser = await chromium.launch({ executablePath:chrome, headless:true })
})
after(async () => { await browser?.close(); await server?.close() })
let errors
beforeEach(async () => {
  page = await browser.newPage({ viewport:{ width:390, height:844 } })
  errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base + 'tests/fixtures/host.html')
  await page.waitForFunction(() => window.ready)
})
afterEach(async () => { await page.close(); assert.deepEqual(errors, []) })
async function mount(content = '<p>Initial</p>', options = {}) {
  return page.evaluate(({ content, options }) => {
    const { createEditwell, articleFormatting, headingAnchors, tables, callout, imageUploads } = Editwell
    window.jobs = []
    window.a = createEditwell(document.querySelector('#a'), {
      ...options, content,
      plugins:[articleFormatting, headingAnchors, tables, callout, imageUploads({
        maxFileSize:100,
        upload(file, context) {
          return new Promise((resolve, reject) => jobs.push({ file, ...context, resolve, reject }))
        },
      })],
      toolbar:['heading','bold','link','image','imageDetails','table','addRow','addColumn','mergeCells','splitCell','source','find','internalLink','alignment','undo','redo'],
    })
    return a.getState()
  }, { content, options })
}
test('visual/source save, dirty baseline, undo and programmatic replacement', async () => {
  await mount()
  assert.equal(await page.evaluate(() => a.isDirty()), false)
  await page.getByRole('textbox', {name:'Document',exact:true}).fill('Changed')
  assert.equal(await page.evaluate(() => a.isDirty()), true)
  await page.getByRole('button', {name:'Undo',exact:true}).click()
  assert.equal(await page.evaluate(() => a.isDirty()), false)
  await page.getByRole('button', {name:'HTML source',exact:true}).click()
  await page.getByRole('textbox', {name:'Document HTML source'}).fill('<h3>Source edits</h3>')
  assert.equal(await page.evaluate(() => a.isDirty()), true)
  const exported = await page.evaluate(() => a.exportContent())
  assert.match(exported.html, /<h3.*Source edits/)
  await page.evaluate(() => a.markSaved())
  assert.equal(await page.evaluate(() => a.isDirty()), false)
  await page.evaluate(() => a.setContent('<p>Replacement</p>'))
  assert.equal(await page.evaluate(() => a.isDirty()), true)
  await page.evaluate(snapshot => { a.markSaved(snapshot) }, exported)
  assert.equal(await page.evaluate(() => a.isDirty()), true)
})
test('sanitisation reports losses and blocks export until reviewed', async () => {
  await mount('<p onclick="alert(1)">safe <a href="javascript:alert(1)">link</a></p><script>alert(1)</script><iframe src="https://example.com"></iframe><img src="x" onerror="alert(1)">')
  const html = await page.evaluate(() => a.getHTML())
  assert.doesNotMatch(html, /onclick|onerror|javascript:|<script|<iframe/)
  assert.equal(await page.evaluate(() => a.getState().needsContentReview), true)
  assert.equal(await page.evaluate(() => { try { a.exportContent(); return false } catch { return true } }), true)
  await page.evaluate(() => a.acceptContentChanges())
  assert.match((await page.evaluate(() => a.exportContent())).html, /safe/)
})
test('Office fixtures, anchors, merged cells and widths survive reopen', async () => {
  for (const fixture of ['word','google']) {
    const html = await readFile(new URL('./fixtures/' + fixture + '.html', import.meta.url), 'utf8')
    await mount(html)
    const first = await page.evaluate(() => a.getHTML())
    assert.match(first, /id="(office|google)"/)
    if (fixture === 'word') { assert.match(first, /colspan="2"/); assert.match(first, /120,180/); assert.match(first, /text-align: center/) }
    await page.evaluate(() => { const html = a.getHTML(); a.setContent(html) })
    assert.equal(await page.evaluate(() => a.getHTML()), first)
    await page.evaluate(() => a.destroy())
  }
})
test('paste path normalises Office HTML and reports unsupported features', async () => {
  await mount('')
  const html = await readFile(new URL('./fixtures/word.html', import.meta.url), 'utf8')
  await page.getByRole('textbox',{name:'Document',exact:true}).focus()
  await page.evaluate(html => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/html', html)
    document.querySelector('.tiptap').dispatchEvent(new ClipboardEvent('paste', { bubbles:true, cancelable:true, clipboardData }))
  }, html)
  assert.match(await page.evaluate(() => a.getHTML()), /Office procedure/)
  await page.evaluate(() => a.setContent('<video src="movie.mp4"></video><p>Retain me</p>'))
  assert.ok((await page.evaluate(() => a.getState().contentReport)).length)
})
test('stable unique heading IDs and configurable levels', async () => {
  await mount('<h2>Duplicate</h2><h3>Duplicate</h3><h4 id="existing">Stable</h4>')
  const first = await page.evaluate(() => a.getJSON())
  const ids = first.content.filter(node => node.type === 'heading').map(node => node.attrs.id)
  assert.equal(new Set(ids).size, 3)
  assert.equal(ids[2], 'existing')
  await page.evaluate(() => a.setContent(a.getJSON()))
  assert.deepEqual((await page.evaluate(() => a.getJSON())).content.filter(node => node.type === 'heading').map(node => node.attrs.id), ids)
  assert.equal(await page.getByRole('combobox',{name:'Heading',exact:true}).locator('option').count(), 4)
})
async function upload() {
  return page.evaluate(() => a.uploadImage(new File(['abc'], 'test.png', {type:'image/png'})))
}
test('uploads track progress, preserve position, retry failure and block save', async () => {
  await mount('<p>First</p><p>Last</p>')
  await page.getByRole('textbox',{name:'Document',exact:true}).press('ControlOrMeta+Home')
  const id = await upload()
  const insertionIndex = await page.evaluate(() => a.getJSON().content.findIndex(node => node.type === 'uploadPlaceholder'))
  assert.equal(await page.evaluate(() => { try { a.exportContent(); return false } catch { return true } }), true)
  await page.evaluate(() => jobs[0].onProgress(55))
  assert.equal((await page.evaluate(() => a.getState().uploads))[0].progress, 55)
  const textbox = page.getByRole('textbox',{name:'Document',exact:true})
  await textbox.locator('p').last().click()
  await textbox.press('End')
  await textbox.press('x')
  await page.evaluate(() => jobs[0].reject(new Error('offline')))
  await page.waitForFunction(() => a.getState().uploads[0]?.state === 'failed')
  await page.evaluate(id => a.retryUpload(id), id)
  await page.evaluate(() => jobs[1].resolve('https://example.com/image.png'))
  await page.waitForFunction(() => a.getState().uploads.length === 0)
  const result = await page.evaluate(() => a.exportContent())
  assert.equal(result.json.content.findIndex(node => node.type === 'image'), insertionIndex)
  assert.equal(await page.locator('img').count(), 1)
})
test('cancellation, deleted positions, read-only and destruction abort uploads', async () => {
  await mount()
  const id = await upload()
  await page.evaluate(id => a.cancelUpload(id), id)
  assert.equal(await page.evaluate(() => jobs[0].signal.aborted), true)
  await upload()
  await page.getByRole('textbox',{name:'Document',exact:true}).press('ControlOrMeta+a')
  await page.getByRole('textbox',{name:'Document',exact:true}).press('Backspace')
  assert.equal(await page.evaluate(() => jobs[1].signal.aborted), true)
  await upload()
  await page.evaluate(() => a.setEditable(false))
  assert.equal(await page.evaluate(() => jobs[2].signal.aborted), true)
  await page.evaluate(() => a.setEditable(true))
  await upload()
  await page.evaluate(() => a.destroy())
  assert.equal(await page.evaluate(() => jobs[3].signal.aborted), true)
  await page.evaluate(() => jobs[3].resolve('https://example.com/late.png'))
  assert.equal(await page.locator('img').count(), 0)
})
test('images retain dimensions, alt, caption and alignment through source', async () => {
  await mount('<figure data-alignment="center"><img src="https://example.com/image.png" width="120" height="80" alt="Diagram"><figcaption>Caption</figcaption></figure>')
  const first = await page.evaluate(() => a.getHTML())
  assert.match(first, /width="120"/); assert.match(first, /height="80"/)
  assert.match(first, /Diagram/); assert.match(first, /Caption/)
  await page.evaluate(() => { a.setSourceMode(true, false); a.exportContent() })
  assert.equal(await page.evaluate(() => a.getHTML()), first)
})
test('dialog keyboard focus, table context, independent locales and RTL layout', async () => {
  await mount('<p>Link</p>')
  await page.evaluate(() => {
    window.b = Editwell.createEditwell(document.querySelector('#b'), { locale:'fr', direction:'rtl', toolbar:['bold','link','source'], content:'<p>Deuxième</p>' })
  })
  await page.locator('#a').getByRole('button',{name:'Insert or edit link'}).focus()
  await page.keyboard.press('Enter')
  assert.equal(await page.getByLabel('Link URL').evaluate(el => el === document.activeElement), true)
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('#a').getByRole('button',{name:'Insert or edit link'}).evaluate(el => el === document.activeElement), true)
  assert.equal(await page.locator('#b').getByRole('button',{name:'Gras',exact:true}).count(), 1)
  assert.equal(await page.locator('#b .ew').getAttribute('dir'), 'rtl')
  assert.equal(await page.getByText('Table actions',{exact:true}).isVisible(), false)
  await page.locator('#a').getByRole('button',{name:'Insert table'}).click()
  assert.equal(await page.getByText('Table actions',{exact:true}).isVisible(), true)
  await page.getByText('Table actions',{exact:true}).click()
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('#a details').getAttribute('open'), null)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
})
test('all shipped locales have the same complete message keys', async () => {
  const lengths = await page.evaluate(() => Object.values(Editwell.locales).map(messages => Object.keys(messages).length))
  assert.equal(new Set(lengths).size, 1)
})

test('upload size/type validation, source guard and safe late completion', async () => {
  await mount()
  await page.evaluate(() => {
    a.uploadImage(new File(['x'], 'bad.svg', {type:'image/svg+xml'}))
    a.uploadImage(new File(['x'.repeat(101)], 'big.png', {type:'image/png'}))
  })
  assert.equal(await page.evaluate(() => jobs.length), 0)
  const id = await upload()
  await page.evaluate(() => a.setSourceMode(true))
  assert.equal(await page.evaluate(() => a.getState().sourceMode), false)
  assert.equal(await page.evaluate(() => { try { a.setContent('<p>replace</p>'); return false } catch { return true } }), true)
  await page.evaluate(id => a.cancelUpload(id), id)
  await page.evaluate(() => jobs[0].resolve('https://example.com/late.png'))
  assert.equal(await page.locator('img').count(), 0)
})
test('unsafe JSON URLs and invalid JSON cannot corrupt the current document', async () => {
  await mount('<p>Keep this</p>')
  assert.equal(await page.evaluate(() => { try { a.setContent({type:'missing'}); return false } catch { return true } }), true)
  assert.match(await page.evaluate(() => a.getHTML()), /Keep this/)
  await page.evaluate(() => a.setContent({ type:'doc', content:[{type:'image',attrs:{src:'javascript:alert(1)',alt:'Unsafe'}}] }))
  assert.doesNotMatch(await page.evaluate(() => a.getHTML()), /javascript:/)
  assert.equal(await page.evaluate(() => a.getState().needsContentReview), true)
})
test('internal article callback cancels stale searches and inserts a safe result', async () => {
  await mount()
  await page.evaluate(() => {
    a.destroy()
    window.lookups = []
    window.a = Editwell.createEditwell(document.querySelector('#a'), {
      content:'<p>Article</p>', toolbar:['internalLink'],
      searchArticles(query, { signal }) {
        return new Promise(resolve => lookups.push({ query, signal, resolve }))
      },
    })
  })
  await page.getByRole('button',{name:'Link to article',exact:true}).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').fill('old')
  await dialog.getByRole('button',{name:'Search articles',exact:true}).click()
  await dialog.getByRole('textbox').fill('new')
  await dialog.getByRole('button',{name:'Search articles',exact:true}).click()
  assert.equal(await page.evaluate(() => lookups[0].signal.aborted), true)
  await page.evaluate(() => {
    lookups[0].resolve([{title:'Old',url:'/old'}])
    lookups[1].resolve([{title:'New article',url:'/articles/new'}])
  })
  await dialog.getByRole('button',{name:'New article',exact:true}).click()
  assert.equal(await page.locator('.tiptap a').getAttribute('href'), '/articles/new')
})
test('image details dialog changes dimensions and caption using the public UI', async () => {
  await mount('<p>Image</p><img src="https://example.com/image.png" alt="Before">')
  await page.locator('.tiptap img').click()
  await page.getByRole('button',{name:'Image details',exact:true}).click()
  await page.getByLabel('Width in pixels').fill('240')
  await page.getByLabel('Height in pixels').fill('120')
  await page.getByLabel('Image alignment').selectOption('right')
  await page.getByLabel('Caption',{exact:true}).fill('After')
  await page.getByLabel(/Alt text/).fill('Updated diagram')
  await page.getByRole('button',{name:'Apply',exact:true}).click()
  const result = await page.evaluate(() => a.exportContent())
  assert.match(result.html, /width="240"/)
  assert.match(result.html, /height="120"/)
  assert.match(result.html, /data-alignment="right"/)
  assert.match(result.html, /Updated diagram/)
  assert.match(result.html, /<figcaption>After/)
})
test('replace-all, clear formatting and plain text paste stay optional', async () => {
  await page.evaluate(() => {
    window.a = Editwell.createEditwell(document.querySelector('#a'), {
      content:'<p><strong>Old Old</strong></p>', toolbar:['find','clear','plainPaste'],
    })
  })
  await page.getByRole('button',{name:'Find and replace',exact:true}).click()
  await page.getByLabel('Find text').fill('Old')
  await page.getByLabel('Replace with').fill('New')
  await page.getByRole('button',{name:'Replace all',exact:true}).click()
  assert.match(await page.evaluate(() => a.getHTML()), /New New/)
  await page.getByRole('textbox',{name:'Document',exact:true}).press('ControlOrMeta+a')
  await page.getByRole('button',{name:'Clear formatting',exact:true}).click()
  assert.doesNotMatch(await page.evaluate(() => a.getHTML()), /<strong>/)
  await page.getByRole('button',{name:'Paste plain text',exact:true}).click()
  await page.getByLabel('Plain text',{exact:true}).fill('<script>safe text</script>')
  await page.getByRole('button',{name:'Apply',exact:true}).click()
  assert.match(await page.evaluate(() => a.getHTML()), /&lt;script&gt;/)
})
test('heading DOM IDs are isolated across instances without changing exported anchors', async () => {
  await mount('<h2 id="shared">One</h2>')
  await page.evaluate(() => {
    window.b = Editwell.createEditwell(document.querySelector('#b'), {
      content:'<h2 id="shared">Two</h2>', plugins:[Editwell.headingAnchors],
    })
  })
  const ids = await page.locator('.tiptap h2').evaluateAll(elements => elements.map(element => element.id))
  assert.notEqual(ids[0], ids[1])
  assert.match(await page.evaluate(() => b.getHTML()), /id="shared"/)
  await page.evaluate(() => { a.setTheme('dark'); b.setEditable(false) })
  assert.equal(await page.locator('#a .ew').getAttribute('data-theme'), 'dark')
  assert.equal(await page.locator('#b .ew').getAttribute('data-theme'), 'light')
  assert.equal(await page.locator('#b .tiptap').getAttribute('contenteditable'), 'false')
})
test('library global build works from locally served static assets', async () => {
  await page.goto(base + 'tests/fixtures/library.html')
  await page.waitForFunction(() => window.libraryEditor)
  assert.match(await page.evaluate(() => libraryEditor.exportContent().html), /Local library/)
})

test('article and compact demos render at narrow and high-zoom equivalent widths', async () => {
  await page.goto(base)
  await page.getByRole('textbox',{name:'Article',exact:true}).waitFor()
  assert.equal(await page.locator('#note .ew-bar button').count(), 5)
  await page.setViewportSize({ width:240, height:844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.getByText('Customise toolbar and theme',{exact:true}).click()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.getByText('Customise toolbar and theme',{exact:true}).click()
  await page.setViewportSize({ width:900, height:1000 })
  await page.screenshot({ path:'../../work/editwell-demo.png' })
})

test('onChange can export applied source edits without re-entering source commit', async () => {
  await page.evaluate(() => {
    window.saved = null
    window.a = Editwell.createEditwell(document.querySelector('#a'), {
      content:'<p>Original</p>', toolbar:['source'],
      onChange() { window.saved = a.exportContent() },
    })
  })
  await page.getByRole('button',{name:'HTML source',exact:true}).click()
  await page.getByRole('textbox',{name:'Document HTML source'}).fill('<p>Reentrant save</p>')
  await page.getByRole('button',{name:'HTML source',exact:true}).click()
  assert.match(await page.evaluate(() => saved.html), /Reentrant save/)
})
