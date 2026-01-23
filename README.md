# obsidian-pdf-annotator-comment

An Obsidian plugin that provides a custom PDF reader with a Word-style comment
sidebar. It supports two highlight colors and lets you attach comments to text
selections directly inside Obsidian.

## Features

- Custom PDF view for `.pdf` files.
- Command to open the current PDF in the annotator view.
- Text selection highlights in two colors (yellow, green).
- Comment modal for selections, with a dedicated sidebar.
- Edit/delete UI for annotations in the sidebar.
- Simple JSON sidecar file stored next to each PDF.

## How it works

- The plugin registers a custom view type for PDFs.
- Use the command palette action to open the current PDF in the annotator view.
- Selections are captured from the invisible text layer of the rendered PDF.
- Highlights and comments are stored in a sidecar file:
  `<your-pdf>.obsidian-annot.json`.
- The PDF is rendered using `pdfjs-dist`, with a local worker file inside the
  plugin folder.

## Installation (manual)

1. Build the plugin (see Development below).
2. In your vault, create:
   `.obsidian/plugins/obsidian-pdf-annotator-comment/`
3. Copy these files into that folder:
   - `manifest.json`
   - `main.js`
   - `styles.css`
   - `pdf.worker.min.mjs`
4. Make sure the folder name matches the plugin ID:
   `obsidian-pdf-annotator-comment`.
5. Enable the plugin in Obsidian Settings -> Community plugins.

## Usage

1. Open any PDF in your vault.
2. Run the command palette action: `Open PDF in Annotator view`.
3. Select text inside the PDF.
4. Right-click to open the context menu:
   - Highlight (Yellow)
   - Highlight (Green)
   - Comment...
5. All annotations appear in the right sidebar with edit/delete actions.

## Data format

Sidecar file: `example.pdf.obsidian-annot.json`

- `pdfPath`: the path to the PDF inside the vault
- `annotations`: list of highlights/comments with page, quad bounds, and text

This file is created automatically on first open.

## Development

Requirements:
- Node.js + npm

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Watch (dev):

```bash
npm run dev
```

Notes:
- `postinstall` copies `pdf.worker.min.mjs` from `pdfjs-dist` into the repo root.
- `main.js` is the bundled output from `src/main.ts`.

## Compatibility

- Minimum Obsidian version: `1.4.0` (see `manifest.json`)

## Known limitations

- Rendering is fully custom and does not reuse Obsidian's native PDF viewer.

## License

MIT License. See `LICENSE`.