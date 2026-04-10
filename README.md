# CellScope

Browser-based particle size measurement tool for TEM microscope images. No installation or build step required — runs entirely in the browser.

**[Live Demo](https://m2kar.github.io/CellScope/)**

## Features

- **Image loading**: TIF/TIFF/PNG/JPG via file picker or drag-and-drop; multi-image support with sidebar thumbnails
- **Scale calibration**: Draw a reference line on a known scale bar, enter real-world length (nm/μm/mm)
- **Particle measurement**: Draw major & minor axis lines per particle; auto-pairs intersecting lines
- **Multi pending lines**: Multiple unpaired lines can coexist; new lines auto-pair with the first intersecting pending line
- **Auto-computed metrics**: Aspect ratio, equivalent diameter
- **Canvas interaction**: Drag endpoints to adjust; hover + Delete/Backspace to remove lines or particles directly on canvas
- **Magnifier**: Adaptive zoom loupe follows cursor during calibration/measurement
- **Minimap**: Draggable viewport overview for large images
- **Edge-panning**: Auto-scrolls when drawing near canvas borders
- **Brightness/Contrast**: Adjustable image filters
- **Statistics**: Mean, std dev, scatter plot (major vs minor axis) via Chart.js
- **Undo/Redo**: Full command-pattern undo/redo for all annotation operations
- **Export**: CSV (UTF-8 BOM) and annotated PNG image export
- **Persistence**: Annotations saved to localStorage automatically
- **Collapsible panels**: Left (image list) and right (statistics) sidebars
- **Logarithmic zoom**: Slider + double-click to type exact zoom percentage
- **Keyboard shortcuts**: Space (temp navigate), C (calibrate), M (measure), V (navigate), Ctrl+Z/Shift+Ctrl+Z (undo/redo), +/- (zoom), 0 (fit), Delete (remove hovered line)
- **Dark theme UI**

## Usage

Open `index.html` in a modern browser, or visit the [live demo](https://m2kar.github.io/CellScope/).

### Workflow

1. Load one or more microscope images
2. Switch to **Calibrate** mode (C key) — draw a line along a known scale bar, enter the real length and unit
3. Switch to **Measure** mode (M key) — draw two intersecting lines (major & minor axis) per particle
4. Review measurements in the annotation table and statistics panel
5. Export CSV or annotated image

## Tech Stack

- Vanilla JavaScript (ES Modules, no build step)
- [geotiff.js](https://geotiffjs.github.io/) v2.1.3 for TIFF decoding
- [Chart.js](https://www.chartjs.org/) v4.4.7 for scatter plots
- Dual HTML5 Canvas (image layer + overlay layer)
- Static site — deployable on GitHub Pages or any HTTP server

## License

MIT
