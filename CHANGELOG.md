# Changelog

## 0.1.2 — 2026-09-18

- See the GitHub release notes for the included changes.

## 0.1.1 — 2026-09-18
- Fix Community review errors by moving reading/canvas layout styles into CSS classes and custom properties.
- Validate annotation JSON with explicit types while preserving legacy migration and unknown stored fields.
- Remove redundant command branding and unnecessary CSS !important overrides.
- Make the embedded PDF worker path and license line endings reproducible across build environments.
- Run the official Obsidian linter, compare rebuilt artifacts against committed main.js, and attest release assets in GitHub Actions.
- Disable optional PDF.js eval-based rendering optimizations.

## 0.1.0 — 2026-09-18

- Introduce Remark My Words, previously developed as `obsidian-pdf-annotator-comment`.
- Reading and Canvas modes with shared PDF annotations.
- Claim, Evidence, Method, Concept, Limitation, and Note categories.
- Live red text selection, categorized comments, descriptions, and tags.
- Movable cards, connected highlights, minimap, page thumbnails, and search.
- Reading-mode comment previews and document-wide notes.
- Backward-compatible sidecar loading and legacy category migration.
- Bundle the PDF.js worker so installation needs only three release files.
- Add reproducible builds, CI, release validation, and one-command release automation.

