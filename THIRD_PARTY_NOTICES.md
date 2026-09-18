# Third-party notices

## PDF.js

Remark My Words bundles PDF.js (`pdfjs-dist` 4.10.38), including its matching
worker. PDF.js is developed by Mozilla and the PDF.js contributors and is
licensed under the Apache License, Version 2.0.

- Source: https://github.com/mozilla/pdf.js
- Project: https://mozilla.github.io/pdf.js/
- License: [Apache 2.0](docs/licenses/pdfjs-dist.txt)

The build retains existing legal comments and embeds the full PDF.js license
in `main.js`, so it accompanies the files installed by Obsidian. The worker is
embedded from the upstream distribution without source modifications.

## Obsidian

The plugin uses the Obsidian API supplied by the host application. Obsidian is
not bundled, and this project is not affiliated with or endorsed by Obsidian.
