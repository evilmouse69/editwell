# Editwell

A standalone, self-hosted rich text editor built on Tiptap. MIT licensed.
[Try the demo](https://evilmouse69.github.io/editwell/).

## Develop and verify

Use Node.js 24 LTS or Node.js 22.12+.

```sh
npm ci
npx playwright install chromium
npm test
npm run build
npm run dev
```

On macOS tests use installed Google Chrome. On other platforms they use
Playwright Chromium. Set `EDITWELL_CHROME` to override the executable.
The build produces the demo in `dist/` and the separate library in `lib/`.
`lib/version.json` identifies the library version. Retain `LICENSE` and
`THIRD_PARTY_NOTICES.txt` when distributing bundled assets.

## Embed locally in PHP or plain HTML

Build on a development machine or download a built package. Copy `lib/`
into your application's static assets. The production server only serves
JavaScript and CSS files. It needs no Node.js runtime or CDN.

```html
<meta charset="utf-8">
<link rel="stylesheet" href="/assets/editwell/editwell.css">
<div id="editor"></div>
<script src="/assets/editwell/editwell.global.js"></script>
<script>
const editor = Editwell.createEditwell(document.querySelector('#editor'), {
  content: '<h2>Getting started</h2><p>Write here.</p>',
  plugins: [Editwell.articleFormatting, Editwell.headingAnchors],
  toolbar: ['heading', 'bold', 'italic', 'link', '|', 'source'],
})
</script>
```

ES module consumers can import the named exports from `lib/editwell.js`.
Source consumers can import from `src/index.js`. A locally packed npm
tarball also exposes `editwell` and `editwell/style.css`.

## Features and configuration

Each instance owns its document, toolbar, dialogs, upload queue and theme.
The compact demo uses only `presets.basic`.

- `toolbar` is an array of control IDs. A pipe adds a visual group separator.
  An empty array hides the toolbar. `setToolbar(ids)` changes it without
  rebuilding the document or undo history.
- `presets.basic` and `presets.article` are editable starting points.
  `getToolbarControls()` lists the available controls.
- `heading` shows a selector. `headingLevels` defaults to `[2, 3, 4]`.
  StarterKit still preserves other heading levels on import unless configured
  otherwise in `features.heading`.
- `features` configures Tiptap StarterKit. Use `{ link:false }`, for example,
  to disable link formatting. Toolbar visibility controls UI, independently of
  the allowed document schema.
- `labels` overrides individual control names. `toolbarStyle:'text'` shows
  text buttons. `icons` retains the original API for custom text glyphs.
  Default buttons use original, consistently drawn SVG stroke icons.
- `theme:'light' | 'dark'`, `tokens` and `setTheme(name, overrides)` style
  each instance. Token names map to `--ew-*` CSS variables, including
  `surface`, `ink`, `muted`, `border`, `accent`, `tint`, `font`,
  `radius`, `padding` and `min-height`. Theme styles live in `src/themes/`.
- `locale` accepts `en`, `fr`, `de`, `es`. All built-in UI messages,
  validation errors and accessibility labels can be overridden through
  `messages`. Dictionaries live in `src/locales/`. Values can contain named
  placeholders such as `{count}`, `{name}`, `{progress}`, `{label}`.
  `direction:'rtl'` sets the writing and interface direction per instance.
  Custom plugins supply their own translated labels and messages.
- `editable:false` starts read-only. `setEditable(boolean)` changes it.
  Switching to read-only closes dialogs and cancels pending uploads.
- `onChange({ html, json })` reports visual document changes. Source drafts
  are tracked through `onStateChange(state)`.
- `destroy()` aborts uploads and removes the instance. Call it before
  unmounting the containing page component.

## Content preservation and reports

`articleFormatting` preserves text alignment, paragraph/heading IDs,
font family and size, text and background colours, subscript, superscript
and named anchors. The table and image plugins preserve merged cells,
pixel column widths, links, image dimensions, alt text and captions.
Existing figure captions and plain images can be loaded.

HTML is sanitised and parsed into the enabled Tiptap schema. HTML strings,
JSON input and pasted HTML pass through this boundary. Scripts, event
handlers, unsafe URLs, embeds and forms are removed. Server applications
must sanitise and validate stored/rendered content as well.

Meaningful detected loss produces a visible report and calls
`onContentWarning(issues)`. Structured issue codes identify unsafe elements
or attributes, unsupported elements/styles, removed attributes and changed
text. `getState().originalHTML` retains the most recent reported HTML so
the host can offer a recovery view. `acceptContentChanges()` acknowledges
that report, as does the visible acceptance button.

The report compares the input with the configured schema. It is a heuristic,
not a full semantic diff. Review complex imports visually. In particular,
Word-specific `mso-list` paragraphs are flagged for review. Real HTML lists,
headings, links and tables are retained. Representative Word and Google Docs
fixtures are covered by tests. Office page layouts, fonts unavailable on the
client, floating objects, comments, equations, pagination and arbitrary HTML
are not supported. Many CSS layout properties and Office metadata are
discarded. Pixel table widths are supported. Percentage-based widths and
complex nested/row-spanning width calculations need visual review.
`plainPaste` opens a plain-text paste dialog. Normal browser
Ctrl/Command+Shift+V paste also uses the plain-text clipboard path.

## Reliable saving

`getHTML()`, `getJSON()` and `setContent(value)` retain their original
roles. Getters return the applied visual document. `setContent` replaces it
without firing `onChange`, validates JSON before mutation and updates dirty
state. It throws while uploads are pending, preserving the current document.

Use `exportContent()` for saving. It applies pending source-mode changes,
sanitises and normalises them, then returns `{ html, json }`. It throws if
uploads are unfinished/failed, the editor is destroyed, or a content-loss
report needs review. Handle the exception and keep the editor open.

```js
try {
  const snapshot = editor.exportContent()
  await saveToYourServer(snapshot.html)
  editor.markSaved(snapshot)
} catch (error) {
  showSaveError(error.message)
}
```

Passing the exported snapshot to `markSaved` keeps edits made during an
asynchronous save dirty. With no argument, `markSaved()` exports and marks
the current document saved. `isDirty()` compares the document to the saved
snapshot, including pending source text. Undoing back to the saved document
clears dirty state. Initial content starts clean. Programmatic replacement
does not reset the saved baseline.

`getState()` returns `dirty`, `uploads`, `sourceMode`, `contentReport`,
`needsContentReview` and `originalHTML`. Subscribe with
`onStateChange(state)` and `onUploadsChange(tasks)`.
`setSourceMode(boolean, focus=true)` remains available.
Source mode is blocked during pending uploads.

## Uploads and image editing

```js
const images = Editwell.imageUploads({
  maxFileSize: 5 * 1024 * 1024,
  async upload(file, { signal, onProgress }) {
    // Your callback owns storage, authentication and the request.
    // Report progress as a percentage from 0 to 100.
    return await uploadToYourServer(file, { signal, onProgress })
  },
  onError(error) { console.error(error) },
})
```

Load `images` in `plugins` and use `image` and `imageDetails` toolbar IDs.
The callback returns an HTTP(S), relative, or supported raster data URL.
Callbacks accepting only `file` continue to work. Respect `signal` to stop
network work on cancellation. Late results are ignored even if the host
callback ignores cancellation.

An upload placeholder marks the insertion location. Document edits move that
node naturally. Deleting it cancels the task. Selection changes never redirect
the completed image. Read-only transitions and destruction abort tasks.
Failed tasks retain their file and insertion location for retry. Save is
blocked until they are retried or cancelled. The task UI exposes progress,
retry and cancel actions. APIs are `uploadImage(file)` (returns a task ID),
`retryUpload(id)` and `cancelUpload(id)`. Validation errors call
`onError({ code, message, cause })` and display a localised notice.

`imageDetails` edits alt text, captions, width/height in whole pixels and
left/centre/right alignment. Empty dimensions retain intrinsic sizing.
The demo stores raster data in the document, limits files to 2 MB and has a
failure simulation checkbox to exercise retry. Production hosts control
storage through their upload callback. MIME checks, file size, real file
validation, authorisation and permissions must also be enforced server-side.

## Optional writing tools

- Load `tables` and add `table` to insert a table. Choose contextual actions
  from `addRow`, `addColumn`, `deleteRow`, `deleteColumn`, `mergeCells`,
  `splitCell`, `deleteTable`. The actions menu appears only inside an
  editable table. Tab navigates its actions. Escape closes it.
- `link` opens an accessible insert/edit/remove dialog.
- `internalLink` uses an async `searchArticles(query, { signal })` host
  callback returning `[{ title, url }]`. Searches abort on replacement or
  dialog close. Results use safe URLs. The selected range is mapped through
  document edits while searching. The demo supplies an in-memory example,
  with no WHMCS-specific endpoints.
- Load `headingAnchors` for stable, unique heading IDs. Existing unique IDs
  are retained. Renaming a heading keeps its ID. Set `tableOfContents:true`
  to generate a heading outline. Editor DOM IDs use an instance prefix,
  while exported HTML retains the original document IDs.
- `alignment` requires `articleFormatting`. `clear` removes formatting.
- `find` provides literal, case-sensitive replace-all. Matches are within
  individual text runs, so a phrase crossing formatting boundaries needs
  manual editing.
- `wordCount:true` shows a whitespace-based word count. It is optional.

## Plugins and rendering

Plugins export a unique `name`, optional Tiptap `extensions`, a `controls`
map and optional `setup(editor, root, services)`. Controls receive
`run(editor, root, services)`, `enabled(editor)` and `active(editor)`.
A `context:'table'` control appears in the contextual menu.
`services.t(key, parameters)` translates messages.
`setup` may return an object with `destroy()` for resource cleanup.
Use `src/plugins/callout.js` as a small content extension example.

Load the same content plugins when reopening a document. Disabling a toolbar
button preserves its existing content. Removing a content extension changes
the allowed schema and can cause a content-loss report.

For saved article rendering, load `editwell.css` and wrap sanitised saved
HTML in `<article class="ew ew-render" data-theme="light">`.
This styles tables, callouts, code blocks, image alignment and captions.
Heading IDs support regular anchors. The host must ensure unique document
IDs if rendering several complete saved articles on one page.

## Compatibility

The factory and existing getters, setters and plugin callbacks remain
compatible. Version 0.2 adds export/state/upload methods, optional extensions,
locales and a library build. Source save and pending-upload guards deliberately
reject incomplete saves through the new export method. Existing low-level
getters do not enforce that contract.

The plugin setup/services API and structured content-report codes are
experimental during 0.x. Additive changes will be documented in the changelog.
Breaking changes require a minor version increment during 0.x, a migration
note and regression coverage. Saved JSON depends on the enabled schema.
Use HTML for interchange and retain backups before changing content plugins.
