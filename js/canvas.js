// canvas.js — Dual canvas rendering, zoom/pan, coordinate transforms, magnifier

import { getState, getActiveImage } from './state.js';

let imageCanvas, imageCtx, overlayCanvas, overlayCtx;
let container;
let mouseImagePos = null;   // current mouse position in image coords
let mouseScreenPos = null;  // current mouse position in screen-relative coords (relative to container)
let mousePressed = false;   // whether mouse button is currently held down

const MAGNIFIER_SIZE = 140; // magnifier box size in CSS pixels
const MAGNIFIER_ZOOM = 4;   // magnification level inside the loupe
const MAGNIFIER_OFFSET_Y = 30; // gap between cursor and magnifier bottom edge

const MINIMAP_MAX_SIZE = 160; // max width or height of the minimap
const MINIMAP_MARGIN = 10;    // margin from canvas edges

export function initCanvas() {
  container = document.getElementById('canvas-container');
  imageCanvas = document.getElementById('canvas-image');
  overlayCanvas = document.getElementById('canvas-overlay');
  imageCtx = imageCanvas.getContext('2d');
  overlayCtx = overlayCanvas.getContext('2d');

  resizeCanvases();
  new ResizeObserver(resizeCanvases).observe(container);
}

function resizeCanvases() {
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  for (const c of [imageCanvas, overlayCanvas]) {
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    c.style.width = rect.width + 'px';
    c.style.height = rect.height + 'px';
  }
  renderImage();
  renderOverlay();
}

export function getCanvasSize() {
  const dpr = window.devicePixelRatio || 1;
  return {
    width: imageCanvas.width / dpr,
    height: imageCanvas.height / dpr,
  };
}

export function getOverlayCanvas() {
  return overlayCanvas;
}

export function setMousePressed(pressed) {
  mousePressed = pressed;
}

// --- Endpoint hit-testing ---
// Returns { source, particleId/null, lineKey, pointKey, point } or null
// source: 'particle' | 'pendingLine' | 'calibration'
const HIT_RADIUS_SCREEN_PX = 8;

export function hitTestEndpoint(imagePos) {
  const img = getActiveImage();
  if (!img || !imagePos) return null;
  const { zoom } = getState().viewport;
  const hitRadiusImage = HIT_RADIUS_SCREEN_PX / zoom; // convert screen px to image px

  function near(p) {
    const dx = imagePos.x - p.x;
    const dy = imagePos.y - p.y;
    return Math.sqrt(dx * dx + dy * dy) <= hitRadiusImage;
  }

  // Check particles
  for (const p of img.particles) {
    if (near(p.major.p1)) return { source: 'particle', particleId: p.id, lineKey: 'major', pointKey: 'p1', point: p.major.p1 };
    if (near(p.major.p2)) return { source: 'particle', particleId: p.id, lineKey: 'major', pointKey: 'p2', point: p.major.p2 };
    if (near(p.minor.p1)) return { source: 'particle', particleId: p.id, lineKey: 'minor', pointKey: 'p1', point: p.minor.p1 };
    if (near(p.minor.p2)) return { source: 'particle', particleId: p.id, lineKey: 'minor', pointKey: 'p2', point: p.minor.p2 };
  }
  // Check pending line
  if (img.pendingLine) {
    if (near(img.pendingLine.p1)) return { source: 'pendingLine', lineKey: null, pointKey: 'p1', point: img.pendingLine.p1 };
    if (near(img.pendingLine.p2)) return { source: 'pendingLine', lineKey: null, pointKey: 'p2', point: img.pendingLine.p2 };
  }
  // Check calibration
  if (img.calibration) {
    if (near(img.calibration.p1)) return { source: 'calibration', lineKey: null, pointKey: 'p1', point: img.calibration.p1 };
    if (near(img.calibration.p2)) return { source: 'calibration', lineKey: null, pointKey: 'p2', point: img.calibration.p2 };
  }
  return null;
}

// Track which endpoint is hovered for rendering highlight
let hoveredHit = null;
export function setHoveredHit(hit) { hoveredHit = hit; }

// --- Coordinate transforms ---

export function screenToImage(sx, sy) {
  const rect = container.getBoundingClientRect();
  const { panX, panY, zoom } = getState().viewport;
  return {
    x: (sx - rect.left - panX) / zoom,
    y: (sy - rect.top - panY) / zoom,
  };
}

export function imageToScreen(ix, iy) {
  const rect = container.getBoundingClientRect();
  const { panX, panY, zoom } = getState().viewport;
  return {
    x: ix * zoom + panX + rect.left,
    y: iy * zoom + panY + rect.top,
  };
}

// --- Fit image to viewport ---

export function fitImageInView() {
  const img = getActiveImage();
  if (!img) return;
  const rect = container.getBoundingClientRect();
  const padding = 20;
  const scaleX = (rect.width - padding * 2) / img.width;
  const scaleY = (rect.height - padding * 2) / img.height;
  const zoom = Math.min(scaleX, scaleY, 1);
  const panX = (rect.width - img.width * zoom) / 2;
  const panY = (rect.height - img.height * zoom) / 2;
  return { zoom, panX, panY };
}

// --- Render image layer ---

export function renderImage() {
  const dpr = window.devicePixelRatio || 1;
  const w = imageCanvas.width;
  const h = imageCanvas.height;
  imageCtx.clearRect(0, 0, w, h);

  const img = getActiveImage();
  if (!img || !img.bitmap) return;

  const { panX, panY, zoom } = getState().viewport;
  imageCtx.save();
  imageCtx.scale(dpr, dpr);
  imageCtx.translate(panX, panY);
  imageCtx.scale(zoom, zoom);
  imageCtx.imageSmoothingEnabled = zoom < 1;
  imageCtx.drawImage(img.bitmap, 0, 0);
  imageCtx.restore();

  // Apply brightness/contrast via CSS filter
  const { brightness, contrast } = getState();
  imageCanvas.style.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
}

// --- Render overlay layer (annotations, pending lines, magnifier) ---

export function renderOverlay(currentMousePos, currentScreenPos) {
  if (currentMousePos !== undefined) mouseImagePos = currentMousePos;
  if (currentScreenPos !== undefined) mouseScreenPos = currentScreenPos;

  const dpr = window.devicePixelRatio || 1;
  const w = overlayCanvas.width;
  const h = overlayCanvas.height;
  overlayCtx.clearRect(0, 0, w, h);

  const img = getActiveImage();
  if (!img) return;

  const state = getState();
  overlayCtx.save();
  overlayCtx.scale(dpr, dpr);

  // Fixed screen-pixel line width — stays thin regardless of zoom
  const lineWidth = 1.5;
  resetLabelBoxes();

  // Helper to format a length value
  const fmtLen = (len, unit) => `${len.toFixed(1)} ${unit}`;

  // Draw calibration line
  if (img.calibration) {
    const calLabel = `${img.calibration.length} ${img.calibration.unit}`;
    drawLine(img.calibration.p1, img.calibration.p2, '#6bffb8', lineWidth, overlayCtx, calLabel);
  }

  // Draw completed particles
  for (const p of img.particles) {
    const majorLabel = `#${p.id} ${fmtLen(p.majorLength, p.unit)}`;
    const minorLabel = fmtLen(p.minorLength, p.unit);
    drawLine(p.major.p1, p.major.p2, '#ff6b6b', lineWidth, overlayCtx, majorLabel);
    drawLine(p.minor.p1, p.minor.p2, '#6bc5ff', lineWidth, overlayCtx, minorLabel);
  }

  // Draw unpaired pending line (waiting for its pair)
  if (img.pendingLine) {
    const pendingLabel = fmtLen(img.pendingLine.length, img.pendingLine.unit);
    drawLine(img.pendingLine.p1, img.pendingLine.p2, '#ffb86b', lineWidth, overlayCtx, pendingLabel);
  }

  // Effective mouse position for rubber-band (calibration locks Y)
  const effectiveMousePos = getEffectiveMousePos(state);

  // Draw pending point and rubber-band line
  if (state.pendingPoint && effectiveMousePos) {
    drawLine(state.pendingPoint, effectiveMousePos, getPendingColor(state), lineWidth, overlayCtx);
    drawDot(state.pendingPoint, getPendingColor(state), overlayCtx);
  } else if (state.pendingPoint) {
    drawDot(state.pendingPoint, getPendingColor(state), overlayCtx);
  }

  // Draw magnifier in calibrate/measure mode
  if (mouseImagePos && mouseScreenPos && (state.mode === 'calibrate' || state.mode === 'measure')) {
    drawMagnifier(overlayCtx, img, effectiveMousePos || mouseImagePos);
  }

  // Draw minimap
  drawMinimap(overlayCtx, img);

  overlayCtx.restore();
}

// In calibration mode with a pending point, lock Y to first point's Y
function getEffectiveMousePos(state) {
  if (!mouseImagePos) return null;
  if (state.mode === 'calibrate' && state.pendingPoint) {
    return { x: mouseImagePos.x, y: state.pendingPoint.y };
  }
  return mouseImagePos;
}

function getPendingColor(state) {
  if (state.mode === 'calibrate') return '#6bffb8';
  const img = getActiveImage();
  return (img && img.pendingLine) ? '#6bc5ff' : '#ff6b6b';
}

function imageToCanvasNoDpr(ix, iy) {
  const { panX, panY, zoom } = getState().viewport;
  return { x: ix * zoom + panX, y: iy * zoom + panY };
}

// --- Magnifier ---

// Sample pixel at (x, y) on the canvas and return its inverted color
function getCrosshairColor(ctx, x, y) {
  try {
    const pixel = ctx.getImageData(
      x * (window.devicePixelRatio || 1),
      y * (window.devicePixelRatio || 1),
      1, 1
    ).data;
    const r = 255 - pixel[0];
    const g = 255 - pixel[1];
    const b = 255 - pixel[2];
    return `rgb(${r},${g},${b})`;
  } catch {
    return '#ffffff';
  }
}

function drawMagnifier(ctx, img, imagePos) {
  const rect = container.getBoundingClientRect();
  // Position magnifier above the cursor
  const half = MAGNIFIER_SIZE / 2;
  let mx = mouseScreenPos.x - half;
  let my = mouseScreenPos.y - MAGNIFIER_SIZE - MAGNIFIER_OFFSET_Y;

  // If magnifier would go above the container, flip it below the cursor
  if (my < 0) {
    my = mouseScreenPos.y + MAGNIFIER_OFFSET_Y;
  }
  // Clamp horizontally
  mx = Math.max(0, Math.min(rect.width - MAGNIFIER_SIZE, mx));

  const borderColor = mousePressed ? '#ffee00' : '#6c9bff';

  // The magnifier shows a zoomed-in portion of the image centered on imagePos
  // We sample from the image bitmap directly
  const sampleRadius = MAGNIFIER_SIZE / (2 * MAGNIFIER_ZOOM); // in image pixels

  ctx.save();

  // Clip to rounded rect
  const r = 6;
  ctx.beginPath();
  roundRect(ctx, mx, my, MAGNIFIER_SIZE, MAGNIFIER_SIZE, r);
  ctx.clip();

  // Draw dark background
  ctx.fillStyle = '#111';
  ctx.fillRect(mx, my, MAGNIFIER_SIZE, MAGNIFIER_SIZE);

  // Draw magnified image region
  if (img.bitmap) {
    const sx = imagePos.x - sampleRadius;
    const sy = imagePos.y - sampleRadius;
    const sw = sampleRadius * 2;
    const sh = sampleRadius * 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img.bitmap, sx, sy, sw, sh, mx, my, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
  }

  // Sample center pixel and compute inverse color for crosshair
  const crossColor = mousePressed ? '#ffee00' : getCrosshairColor(ctx, mx + half, my + half);

  // Draw crosshair in the center of the magnifier
  const cx = mx + half;
  const cy = my + half;
  const armLen = 18;
  const gap = 4;

  ctx.strokeStyle = crossColor;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.9;

  // Horizontal arms
  ctx.beginPath();
  ctx.moveTo(cx - armLen, cy);
  ctx.lineTo(cx - gap, cy);
  ctx.moveTo(cx + gap, cy);
  ctx.lineTo(cx + armLen, cy);
  // Vertical arms
  ctx.moveTo(cx, cy - armLen);
  ctx.lineTo(cx, cy - gap);
  ctx.moveTo(cx, cy + gap);
  ctx.lineTo(cx, cy + armLen);
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fillStyle = crossColor;
  ctx.fill();

  ctx.globalAlpha = 1;

  // Draw border
  ctx.beginPath();
  roundRect(ctx, mx, my, MAGNIFIER_SIZE, MAGNIFIER_SIZE, r);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw pixel coordinate label at bottom of magnifier
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(mx, my + MAGNIFIER_SIZE - 18, MAGNIFIER_SIZE, 18);
  ctx.fillStyle = '#ccc';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`(${Math.round(imagePos.x)}, ${Math.round(imagePos.y)})`, mx + half, my + MAGNIFIER_SIZE - 5);

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
}

// --- Drawing helpers ---

// Track placed label bounding boxes per frame to avoid overlap
let labelBoxes = [];

function resetLabelBoxes() {
  labelBoxes = [];
}

function drawLine(p1, p2, color, lineWidth, ctx, label) {
  const a = imageToCanvasNoDpr(p1.x, p1.y);
  const b = imageToCanvasNoDpr(p2.x, p2.y);
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([5, 3]);
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw endpoints — fixed 3px screen radius; highlight if hovered
  const pts = [{ screen: a, image: p1 }, { screen: b, image: p2 }];
  for (const { screen, image } of pts) {
    const isHovered = hoveredHit && hoveredHit.point === image;
    const r = isHovered ? 6 : 3;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (isHovered) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // Draw label parallel to the line, above it
  if (label) {
    drawLineLabel(ctx, a, b, label, color);
  }
}

function drawLineLabel(ctx, a, b, text, color) {
  const fontSize = 11;
  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let angle = Math.atan2(dy, dx);
  // Keep text readable: flip if upside-down
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;

  const lineLen = Math.sqrt(dx * dx + dy * dy);
  if (lineLen < 20) { ctx.restore(); return; }

  // Tangent unit vector (along the line, in the direction of the readable angle)
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Perpendicular: "above" = left-hand normal of tangent
  let nx = -sin;
  let ny = cos;
  // Ensure "above" points roughly up on screen (ny < 0)
  if (ny > 0) { nx = -nx; ny = -ny; }

  const textWidth = ctx.measureText(text).width;
  const textHeight = fontSize;
  const padding = 3;
  const perpOffset = 6; // distance from line

  // Center of line
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;

  // Tangential shift: 25% of line length toward each end
  const tangentShift = lineLen * 0.25;

  // Generate candidate positions:
  // [tangent side] x [perpendicular side]
  // tangent: left (-shift), center (0), right (+shift)
  // perp: above (+perpOffset), below (-perpOffset)
  const tangentOffsets = [-tangentShift, 0, tangentShift];
  const perpSides = [perpOffset, -perpOffset]; // above first, then below

  let placed = false;
  for (const perpSide of perpSides) {
    for (const tOff of tangentOffsets) {
      const cx = mx + cos * tOff + nx * perpSide;
      const cy = my + sin * tOff + ny * perpSide;
      const box = computeLabelBox(cx, cy, angle, textWidth, textHeight, padding);

      if (!labelBoxes.some(b => boxesOverlap(b, box))) {
        labelBoxes.push(box);
        drawLabelAt(ctx, cx, cy, angle, text, color);
        placed = true;
        break;
      }
    }
    if (placed) break;
  }

  // Fallback: draw at left-above anyway
  if (!placed) {
    const cx = mx + cos * (-tangentShift) + nx * perpOffset;
    const cy = my + sin * (-tangentShift) + ny * perpOffset;
    const box = computeLabelBox(cx, cy, angle, textWidth, textHeight, padding);
    labelBoxes.push(box);
    drawLabelAt(ctx, cx, cy, angle, text, color);
  }

  ctx.restore();
}

function computeLabelBox(cx, cy, angle, textWidth, textHeight, padding) {
  const hw = textWidth / 2 + padding;
  const hh = textHeight / 2 + padding;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [
    { x: cx + (-hw) * cos - (-hh) * sin, y: cy + (-hw) * sin + (-hh) * cos },
    { x: cx + (hw) * cos - (-hh) * sin,  y: cy + (hw) * sin + (-hh) * cos },
    { x: cx + (hw) * cos - (hh) * sin,   y: cy + (hw) * sin + (hh) * cos },
    { x: cx + (-hw) * cos - (hh) * sin,  y: cy + (-hw) * sin + (hh) * cos },
  ];
  return {
    minX: Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x),
    maxX: Math.max(corners[0].x, corners[1].x, corners[2].x, corners[3].x),
    minY: Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y),
    maxY: Math.max(corners[0].y, corners[1].y, corners[2].y, corners[3].y),
  };
}

function drawLabelAt(ctx, cx, cy, angle, text, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function boxesOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function drawDot(p, color, ctx) {
  const cp = imageToCanvasNoDpr(p.x, p.y);
  ctx.beginPath();
  ctx.arc(cp.x, cp.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function midpoint(p1, p2) {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

// --- Minimap ---

function getMinimapRect(img) {
  const rect = container.getBoundingClientRect();
  const aspect = img.width / img.height;
  let mw, mh;
  if (aspect >= 1) {
    mw = MINIMAP_MAX_SIZE;
    mh = MINIMAP_MAX_SIZE / aspect;
  } else {
    mh = MINIMAP_MAX_SIZE;
    mw = MINIMAP_MAX_SIZE * aspect;
  }
  return {
    x: MINIMAP_MARGIN,
    y: rect.height - mh - MINIMAP_MARGIN,
    w: mw,
    h: mh,
    scale: mw / img.width, // minimap pixels per image pixel
  };
}

function drawMinimap(ctx, img) {
  const mm = getMinimapRect(img);
  const { panX, panY, zoom } = getState().viewport;
  const canvasRect = container.getBoundingClientRect();

  // Background
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#111118';
  ctx.fillRect(mm.x, mm.y, mm.w, mm.h);
  ctx.globalAlpha = 1;

  // Draw thumbnail of the image
  if (img.bitmap) {
    ctx.globalAlpha = 0.7;
    ctx.drawImage(img.bitmap, 0, 0, img.width, img.height, mm.x, mm.y, mm.w, mm.h);
    ctx.globalAlpha = 1;
  }

  // Compute visible region in image coordinates
  const visLeft = -panX / zoom;
  const visTop = -panY / zoom;
  const visWidth = canvasRect.width / zoom;
  const visHeight = canvasRect.height / zoom;

  // Convert to minimap coordinates
  const vx = mm.x + visLeft * mm.scale;
  const vy = mm.y + visTop * mm.scale;
  const vw = visWidth * mm.scale;
  const vh = visHeight * mm.scale;

  // Clip viewport rect to minimap bounds
  ctx.save();
  ctx.beginPath();
  ctx.rect(mm.x, mm.y, mm.w, mm.h);
  ctx.clip();

  // Draw viewport rectangle
  ctx.strokeStyle = '#6c9bff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(vx, vy, vw, vh);

  // Semi-transparent fill
  ctx.fillStyle = 'rgba(108, 155, 255, 0.1)';
  ctx.fillRect(vx, vy, vw, vh);
  ctx.restore();

  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mm.x, mm.y, mm.w, mm.h);

  ctx.restore();
}

// Hit-test: is a screen-relative point inside the minimap?
export function minimapHitTest(screenX, screenY) {
  const img = getActiveImage();
  if (!img) return null;
  const mm = getMinimapRect(img);
  if (screenX >= mm.x && screenX <= mm.x + mm.w &&
      screenY >= mm.y && screenY <= mm.y + mm.h) {
    // Convert minimap coords to image coords
    const imgX = (screenX - mm.x) / mm.scale;
    const imgY = (screenY - mm.y) / mm.scale;
    return { imgX, imgY };
  }
  return null;
}

// --- Export for image export ---

export function renderToExportCanvas() {
  const img = getActiveImage();
  if (!img) return null;

  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(img.bitmap, 0, 0);

  const lineWidth = Math.max(2, img.width / 800);
  const fontSize = Math.max(14, img.width / 120);
  const fmtLen = (len, unit) => `${len.toFixed(1)} ${unit}`;

  if (img.calibration) {
    const label = `${img.calibration.length} ${img.calibration.unit}`;
    drawExportLine(ctx, img.calibration.p1, img.calibration.p2, '#6bffb8', lineWidth, fontSize, label);
  }

  for (const p of img.particles) {
    const majorLabel = `#${p.id} ${fmtLen(p.majorLength, p.unit)}`;
    const minorLabel = fmtLen(p.minorLength, p.unit);
    drawExportLine(ctx, p.major.p1, p.major.p2, '#ff6b6b', lineWidth, fontSize, majorLabel);
    drawExportLine(ctx, p.minor.p1, p.minor.p2, '#6bc5ff', lineWidth, fontSize, minorLabel);
  }

  return canvas;
}

function drawExportLine(ctx, p1, p2, color, lineWidth, fontSize, label) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  for (const pt of [p1, p2]) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, lineWidth * 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Draw label parallel to line
  if (label) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 10) return;
    let angle = Math.atan2(dy, dx);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;

    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2;
    let nx = -dy / len;
    let ny = dx / len;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const offset = fontSize * 0.8 + lineWidth * 2;

    ctx.save();
    ctx.translate(mx + nx * offset, my + ny * offset);
    ctx.rotate(angle);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}
