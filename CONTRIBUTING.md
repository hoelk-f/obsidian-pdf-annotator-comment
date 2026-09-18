# Contributing to Remark My Words

Bug reports, usability feedback, and focused pull requests are welcome.
For substantial behavior changes, open an issue first to discuss the intended
workflow. Keep the English interface consistent and preserve existing sidecars.

## Local setup

Use Node.js 22 or later, then run:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run test:browser
npm run test:build
npm run package:release
```

The browser test defaults to Edge on Windows; use `BROWSER_PATH` for another
Chromium installation. See [development notes](docs/DEVELOPMENT.md) for details.
Install the three release files in a separate test vault for Obsidian checks.

Before submitting a change, describe the user-visible behavior, how it was
verified, and any data-format implications. Add regression coverage for behavior
changes where it can catch real failures. Do not commit `node_modules`, private
PDFs, vault contents, or generated test artifacts.

The maintainer handles [releases and directory submission](docs/RELEASING.md).
