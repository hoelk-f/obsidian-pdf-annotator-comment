# obsidian-pdf-annotator-comment

An Obsidian plugin that provides a custom PDF reader with a Word-style sidebar
for comments, highlights, and notes. It uses a custom PDF view (PDF.js) and a
sidecar JSON file stored next to each PDF.

## Features

- Custom PDF view for `.pdf` files (separate from Obsidian's native viewer).
- Command to open the current PDF in the annotator view.
- Highlights with two colors: **Yellow** and **Red**.
- Comments use **Blue** highlights and appear in the Comments tab.
- Sidebar tabs: **Comments**, **Highlights**, **Notes**.
- Click a sidebar item to jump to its position in the PDF.
- Notes tab: free-form text saved per PDF.
- Lazy rendering for better performance on large PDFs.

## How it works

- The plugin registers a custom view type (not the default PDF view).
- Use the command palette to open a PDF in the annotator view.
- Selections are captured from the PDF.js text layer.
- Highlights and comments are stored in a sidecar file:
  `<your-pdf>.obsidian-annot.json`.
- Notes are saved in the same sidecar file.
- The PDF is rendered using `pdfjs-dist` with a local worker file in the plugin folder.

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
   - Highlight (Red)
   - Comment (Blue)...
5. Use the sidebar tabs:
   - **Comments**: blue comments only (edit/delete)
   - **Highlights**: yellow/red highlights (delete)
   - **Notes**: free-form notes for the PDF

## Data format

Sidecar file: `example.pdf.obsidian-annot.json`

- `pdfPath`: the path to the PDF inside the vault
- `annotations`: list of highlights/comments with page, quad bounds, and text
- `notes`: free-form notes text (optional)

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