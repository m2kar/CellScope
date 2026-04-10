# CellScope — CLAUDE.md

## Project Overview

Browser-based TEM particle size measurement tool. Static site, no build step.

## Architecture

- **Vanilla JS + ES Modules** served directly from `index.html`
- **Dual canvas**: `canvas-image` (bottom, image + CSS filters) + `canvas-overlay` (top, annotations/magnifier/minimap)
- **Command pattern** for undo/redo: `dispatch(action)` → `executeAction()` returns inverse action

## Key Files

| File | Purpose |
|------|---------|
| `js/state.js` | Central state, undo/redo, action handlers (ADD_LINE, REMOVE_LINE, PAIR_LINES, etc.) |
| `js/canvas.js` | Rendering, coordinate transforms, hit-testing (endpoints + lines), magnifier, minimap |
| `js/app.js` | Entry point, event wiring, drag state machines (endpoint, minimap, edge-pan) |
| `js/ui.js` | DOM updates (sidebar, annotation table, status bar), keyboard shortcuts |
| `js/measurement.js` | Line drawing logic, segment intersection, auto-pairing |
| `js/calibration.js` | Scale bar calibration workflow |
| `js/statistics.js` | Chart.js scatter plot, statistics computation |
| `js/image-loader.js` | TIF/PNG/JPG loading via geotiff.js + canvas |
| `js/csv-export.js` | CSV export with UTF-8 BOM |
| `js/export-image.js` | Annotated PNG export |
| `js/storage.js` | localStorage persistence (does NOT persist pendingLines) |
| `css/style.css` | Dark theme, layout |

## Data Model

- `state.images[]` — array of image objects, each with:
  - `pendingLines[]` — unpaired measurement lines (array, supports multiple)
  - `particles[]` — paired measurements `{ id, major, minor, majorLength, minorLength, aspectRatio, equivalentDiameter }`
  - `calibration` — `{ p1, p2, length, unit, pixelsPerUnit }` or null
- `state.viewport` — `{ panX, panY, zoom }`
- `state.pendingPoint` — first click of in-progress line drawing

## Conventions

- All UI text is in Chinese (zh-CN)
- Colors: calibration `#6bffb8`, major axis `#ff6b6b`, minor axis `#6bc5ff`, pending lines `#ffb86b`
- CDN dependencies: geotiff.js 2.1.3, Chart.js 4.4.7 (loaded via `<script>` in index.html)
- No framework, no bundler, no TypeScript
- Coordinate systems: screen pixels ↔ image pixels via `screenToImage()`/`imageToScreen()`
- Hit-testing threshold: 8 screen pixels (`HIT_RADIUS_SCREEN_PX`)

## Commands

- Serve locally: `python3 -m http.server 8000` then open `http://localhost:8000`
- No tests, no build, no linting configured
