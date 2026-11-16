# Editwell

A standalone rich text editor with configurable toolbars, themes and plugins.
Editwell uses Tiptap and runs in the browser.

Use Node.js 22.12+ on the 22.x line, or Node.js 24 LTS.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. The demo includes an article editor with a
callout plugin and light/dark switching, plus a compact note editor. The
article's Save draft and Restore draft buttons use browser storage.

`npm run build` builds the demo into `dist/`. Use `npm run preview` to serve it.

## Configure an editor

```js
import { createEditwell } from './src/editor.js'
import { callout } from './src/callout.js'

const editor = createEditwell(document.querySelector('#editor'), {
  label: 'Article',
  content: '<h2>Getting started</h2><p>Write here.</p>',
  toolbar: ['heading', 'bold', 'italic', '|', 'callout', 'undo', 'redo'],
  labels: { heading: 'Section heading' },
  theme: 'light',
  tokens: { accent: '#245e43', 'min-height': '220px' },
  features: { strike: false },
  plugins: [callout],
  onChange: ({ html, json }) => {
    // Pass html or json to your application's draft handler.
  },
})
```

Each instance has its own configuration. Use `presets.basic` or
`presets.article`, or supply your own list. A pipe adds a separator.
An empty list hides the toolbar. Use `features` to configure or disable
StarterKit extensions and `labels` to override button names. Toolbars use
icons by default and retain accessible names and hover labels. Set
`toolbarStyle: 'text'` for visible text, or use `icons` to override glyphs
by control ID. Plugins can provide an optional `icon` for each control.

Theme tokens map to CSS variables prefixed with `--ew-`. Available tokens
include surface, ink, border, accent, tint, font, radius, padding and
min-height. Switch themes with `editor.setTheme('dark')` or pass a map of
instance-specific overrides as the second argument.

Read documents with `getHTML()` or `getJSON()`, replace them with
`setContent(htmlOrJson)`, and switch modes with `setEditable(false)`.
Call `destroy()` when removing the editor from the page.

## Add a plugin

A plugin exports a unique `name`, optional Tiptap `extensions`, and an
optional `controls` map. A control has a `label` and `run(editor)` callback.
It can also provide `enabled(editor)` and `active(editor)` predicates.
Add the control's ID to the toolbar array to show it. See
[src/callout.js](src/callout.js) for a block that defines parsing,
serialization and a command. Load the same content plugins when reopening
documents that use their custom nodes. The plugin API is experimental.

## Optional tools

Import `tables` and `imageUploads` from `src/tools.js`. Add the corresponding
plugin and toolbar IDs to each editor where you want them.

- Use `tables` with `table` for a resizable 3 × 3 table with a header row.
  Choose which editing controls to show from `addRow`, `addColumn`,
  `deleteRow`, `deleteColumn`, `mergeCells`, `splitCell` and `deleteTable`.
- Use `imageUploads({ upload, onError })` with `image`. The upload callback
  receives a File and returns a URL or a promise for a URL. The demo reads
  images up to 2 MB into the document locally. To store files externally,
  supply your own upload callback. The optional error callback receives errors.
- Add `link` for link insertion, editing and removal. To disable link
  formatting itself, set `features: { link: false }`.

HTML loading normalizes pasted or imported markup to the current editor schema.
JSON loading checks the document against that schema.

Office paste fidelity and review workflows are future work.

Add `source` to a toolbar to toggle between the visual editor and editable
HTML. Switching back applies the changes after sanitizing the markup and
normalizing it to the editor's enabled formats. `getHTML()` and `getJSON()`
return the applied document. Call `setSourceMode(false, false)` to apply
pending source edits before saving without moving focus.
