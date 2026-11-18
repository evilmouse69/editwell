# Changelog

## 0.2.0

- Audited the existing editor, preserving the Tiptap foundation and public factory.
- Added sanitised HTML/JSON import, content-loss reports and review acknowledgement.
- Added reliable source-aware export, dirty tracking, saved snapshots and upload guards.
- Added cancellable, retryable, progress-aware uploads using document placeholders.
- Added H2–H4 selection, text alignment, article formatting, stable anchors and outline.
- Added optional internal-article search callback, replace-all, clear formatting and word count.
- Preserved image dimensions, alignment, alt text and captions.
- Added per-instance English, French, German and Spanish dictionaries and RTL support.
- Replaced default glyphs with original SVG icons and improved dialog focus restoration.
- Added separate ES module/IIFE library builds, CSS and bundled dependency notices.
- Added browser regression tests and representative Office paste fixtures.

Migration: existing imports remain supported. Use exportContent() for saves and
markSaved(snapshot) after persistence. Upload callbacks may optionally accept
a second argument with signal and onProgress. No Staff Wiki changes are included.
