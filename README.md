# Codebase Packer & Unpacker — split version

This is a structural split of the original single-file application.

## Layout

- `index.html` — application markup and external CDN dependencies
- `css/styles.css` — application CSS
- `js/state.js` — shared application state
- `js/core.js` — toasts, tabs, escaping, paths, language mapping, ignore rules
- `js/formats.js` — format selection, packers, unpackers, and diff engine
- `js/packer.js` — packer UI and folder scanning
- `js/unpacker.js` — unpacker UI and folder application
- `js/tests.js` — property/regression test suite
- `js/main.js` — startup/bootstrap

The JavaScript files intentionally use classic scripts rather than ES modules so the existing global function names and inline `onclick` handlers continue to work without changing the application's behavior.

External dependencies remain the same as the original:
- Tailwind CSS CDN
- JSZip CDN
- Font Awesome CDN
- Google Fonts

Open `index.html` directly in a browser. Folder write-back still depends on the browser's File System Access API, just as in the original.
