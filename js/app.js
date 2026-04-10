// app.js — Entry point, event wiring, initialization

import { getState, getActiveImage, addImage, setActiveImage, setMode, setViewport, setFilters, subscribe, undo, redo, clearPending, dispatch } from './state.js';
import { loadImageFile, createThumbnail } from './image-loader.js';
import { initCanvas, getOverlayCanvas, screenToImage, fitImageInView, renderImage, renderOverlay, getCanvasSize, setMousePressed, hitTestEndpoint, setHoveredHit, minimapHitTest } from './canvas.js';
import { initCalibration, handleCalibrationClick, enterCalibrationMode } from './calibration.js';
import { handleMeasurementClick, enterMeasureMode } from './measurement.js';
import { initStatistics, updateStatistics } from './statistics.js';
import { exportCSV } from './csv-export.js';
import { exportImage } from './export-image.js';
import { scheduleSave, loadFromStorage, restoreAnnotations } from './storage.js';
import { setStatus, updateZoomDisplay, updateImageList, updateAnnotationTable, updateModeButtons, updateUndoRedoButtons, initTableToggle, initSidebarToggle, initKeyboardShortcuts, setZoomCallbacks, initZoomControls } from './ui.js';

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
  initCanvas();
  initCalibration();
  initStatistics();
  initTableToggle();
  initSidebarToggle();
  initKeyboardShortcuts();
  setZoomCallbacks(zoomBy, resetZoom, setZoomTo);
  initZoomControls();
  bindToolbar();
  bindCanvasEvents();
  bindDragDrop();
  bindFilterSliders();

  // Subscribe to state changes
  subscribe((changeType) => {
    if (changeType === 'images' || changeType === 'data') {
      updateImageList();
      updateAnnotationTable();
      updateStatistics();
      updateUndoRedoButtons();
      scheduleSave();
    }
    if (changeType === 'activeImage') {
      updateImageList();
      const vp = fitImageInView();
      if (vp) setViewport(vp);
      renderImage();
      renderOverlay();
      updateZoomDisplay();
      updateAnnotationTable();
      updateStatistics();
    }
    if (changeType === 'viewport') {
      renderImage();
      renderOverlay();
      updateZoomDisplay();
    }
    if (changeType === 'filters') {
      renderImage();
    }
    if (changeType === 'mode') {
      updateModeButtons();
      updateOverlayCursor();
      const mode = getState().mode;
      if (mode === 'calibrate') enterCalibrationMode();
      else if (mode === 'measure') enterMeasureMode();
      else setStatus('导航模式 — 拖拽平移，滚轮缩放');
    }
    if (changeType === 'pending' || changeType === 'data') {
      renderOverlay();
    }
  });
});

// --- Toolbar bindings ---

function bindToolbar() {
  document.getElementById('file-input').addEventListener('change', handleFileInput);
  document.getElementById('btn-navigate').addEventListener('click', () => setMode('navigate'));
  document.getElementById('btn-calibrate').addEventListener('click', () => setMode('calibrate'));
  document.getElementById('btn-measure').addEventListener('click', () => setMode('measure'));
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-export-image').addEventListener('click', exportImage);
}

// --- File loading ---

async function handleFileInput(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  const savedData = loadFromStorage();
  setStatus(`正在加载 ${files.length} 张图片...`);

  for (const file of files) {
    try {
      const imgData = await loadImageFile(file);
      imgData.thumbnail = createThumbnail(imgData.bitmap);

      // Restore saved annotations if available
      if (savedData) {
        const saved = savedData.find(s => s.fileName === imgData.fileName);
        if (saved) {
          addImage(imgData);
          const img = getState().images[getState().images.length - 1];
          img.calibration = saved.calibration;
          img.particles = saved.particles || [];
          img.nextParticleId = saved.nextParticleId || (img.particles.length + 1);
          continue;
        }
      }
      addImage(imgData);
    } catch (err) {
      console.error('Failed to load:', file.name, err);
      setStatus(`加载失败: ${file.name} — ${err.message}`);
    }
  }

  setStatus(`已加载 ${getState().images.length} 张图片`);
  // Reset file input so same files can be re-loaded
  e.target.value = '';

  // Trigger a full UI refresh after restore
  updateImageList();
  updateAnnotationTable();
  updateStatistics();
  updateUndoRedoButtons();
}

// --- Drag & drop ---

function bindDragDrop() {
  const container = document.getElementById('canvas-container');

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f =>
      /\.(tif|tiff|png|jpg|jpeg|bmp)$/i.test(f.name)
    );
    if (files.length > 0) {
      // Simulate file input
      const input = document.getElementById('file-input');
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    }
  });
}

// --- Canvas mouse events ---

let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let dragStartPanX = 0, dragStartPanY = 0;

// Endpoint drag state
let isDraggingEndpoint = false;
let dragHit = null;        // the hit-test result when drag started
let dragOriginalPos = null; // { x, y } original position for undo

// Minimap drag state
let isDraggingMinimap = false;

// Edge-pan state
const EDGE_PAN_MARGIN = 40;  // px from canvas edge to trigger panning
const EDGE_PAN_SPEED = 8;    // px per frame
let edgePanRAF = null;
let lastMouseEvent = null;

function bindCanvasEvents() {
  const overlay = getOverlayCanvas();

  overlay.addEventListener('mousedown', onMouseDown);
  overlay.addEventListener('mousemove', onMouseMove);
  overlay.addEventListener('mouseup', onMouseUp);
  overlay.addEventListener('mouseleave', onMouseLeave);
  overlay.addEventListener('wheel', onWheel, { passive: false });
  overlay.addEventListener('contextmenu', (e) => e.preventDefault());
}

function getScreenRelativePos(e) {
  const rect = getOverlayCanvas().parentElement.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onMouseDown(e) {
  if (e.button !== 0) return;
  const state = getState();
  const img = getActiveImage();
  if (!img) return;

  setMousePressed(true);

  // Check minimap click
  const screenRelPos = getScreenRelativePos(e);
  const minimapHit = minimapHitTest(screenRelPos.x, screenRelPos.y);
  if (minimapHit) {
    isDraggingMinimap = true;
    centerViewportOnImage(minimapHit.imgX, minimapHit.imgY);
    return;
  }

  // Check for endpoint drag start (works in any mode except when actively drawing)
  if (!state.pendingPoint) {
    const pos = screenToImage(e.clientX, e.clientY);
    const hit = hitTestEndpoint(pos);
    if (hit) {
      isDraggingEndpoint = true;
      dragHit = hit;
      dragOriginalPos = { x: hit.point.x, y: hit.point.y };
      getOverlayCanvas().style.cursor = 'grabbing';
      return;
    }
  }

  if (state.mode === 'navigate') {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = state.viewport.panX;
    dragStartPanY = state.viewport.panY;
    getOverlayCanvas().classList.add('dragging');
  } else if (state.mode === 'calibrate') {
    const pos = screenToImage(e.clientX, e.clientY);
    handleCalibrationClick(pos);
    renderOverlay(pos, getScreenRelativePos(e));
  } else if (state.mode === 'measure') {
    const pos = screenToImage(e.clientX, e.clientY);
    handleMeasurementClick(pos);
    renderOverlay(pos, getScreenRelativePos(e));
  }
}

function onMouseMove(e) {
  const state = getState();
  if (!getActiveImage()) return;

  // Minimap dragging
  if (isDraggingMinimap) {
    const screenRelPos = getScreenRelativePos(e);
    const minimapHit = minimapHitTest(screenRelPos.x, screenRelPos.y);
    if (minimapHit) {
      centerViewportOnImage(minimapHit.imgX, minimapHit.imgY);
    }
    return;
  }

  // Endpoint dragging
  if (isDraggingEndpoint && dragHit) {
    const pos = screenToImage(e.clientX, e.clientY);
    dragHit.point.x = pos.x;
    // Calibration endpoints stay horizontal: lock Y
    if (dragHit.source !== 'calibration') {
      dragHit.point.y = pos.y;
    }
    renderOverlay(pos, getScreenRelativePos(e));
    return;
  }

  if (isDragging) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    setViewport({ panX: dragStartPanX + dx, panY: dragStartPanY + dy });
  } else {
    const pos = screenToImage(e.clientX, e.clientY);

    // Hit-test for endpoint hover (in any mode when not drawing)
    if (!state.pendingPoint) {
      const hit = hitTestEndpoint(pos);
      setHoveredHit(hit);
      if (hit) {
        getOverlayCanvas().style.cursor = 'grab';
      } else {
        getOverlayCanvas().style.cursor = '';
      }
    }

    // Edge-pan when drawing and mouse near canvas border
    if (state.pendingPoint && (state.mode === 'calibrate' || state.mode === 'measure')) {
      lastMouseEvent = e;
      const rect = getOverlayCanvas().parentElement.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;
      if (relX < EDGE_PAN_MARGIN || relX > rect.width - EDGE_PAN_MARGIN ||
          relY < EDGE_PAN_MARGIN || relY > rect.height - EDGE_PAN_MARGIN) {
        startEdgePan();
      } else {
        stopEdgePan();
      }
    } else {
      stopEdgePan();
    }

    renderOverlay(pos, getScreenRelativePos(e));
  }
}

function onMouseUp(e) {
  setMousePressed(false);
  stopEdgePan();

  // Finish minimap drag
  if (isDraggingMinimap) {
    isDraggingMinimap = false;
    return;
  }

  // Finish endpoint drag
  if (isDraggingEndpoint && dragHit) {
    const pos = screenToImage(e.clientX, e.clientY);
    const finalPos = { x: pos.x, y: pos.y };
    // Revert to original position first, then let dispatch handle the move
    dragHit.point.x = dragOriginalPos.x;
    dragHit.point.y = dragOriginalPos.y;
    // Only dispatch if actually moved
    if (finalPos.x !== dragOriginalPos.x || finalPos.y !== dragOriginalPos.y) {
      dispatch({
        type: 'MOVE_ENDPOINT',
        imageIndex: getState().activeImageIndex,
        source: dragHit.source,
        particleId: dragHit.particleId || null,
        lineKey: dragHit.lineKey,
        pointKey: dragHit.pointKey,
        from: dragOriginalPos,
        to: finalPos,
      });
    }
    isDraggingEndpoint = false;
    dragHit = null;
    dragOriginalPos = null;
    getOverlayCanvas().style.cursor = '';
    renderOverlay(pos, getScreenRelativePos(e));
    return;
  }

  if (isDragging) {
    isDragging = false;
    getOverlayCanvas().classList.remove('dragging');
  }
  // Re-render to update magnifier color on release
  const state = getState();
  if (state.mode === 'calibrate' || state.mode === 'measure') {
    const pos = screenToImage(e.clientX, e.clientY);
    renderOverlay(pos, getScreenRelativePos(e));
  }
}

function onMouseLeave() {
  setMousePressed(false);
  stopEdgePan();
  isDraggingMinimap = false;
  if (isDraggingEndpoint && dragHit) {
    // Revert to original position on leave
    dragHit.point.x = dragOriginalPos.x;
    dragHit.point.y = dragOriginalPos.y;
    isDraggingEndpoint = false;
    dragHit = null;
    dragOriginalPos = null;
    getOverlayCanvas().style.cursor = '';
  }
  if (isDragging) {
    isDragging = false;
    getOverlayCanvas().classList.remove('dragging');
  }
  setHoveredHit(null);
  renderOverlay(null, null);
}

// --- Edge-panning when drawing near canvas border ---

function startEdgePan() {
  if (edgePanRAF) return;
  edgePanRAF = requestAnimationFrame(edgePanTick);
}

function stopEdgePan() {
  if (edgePanRAF) {
    cancelAnimationFrame(edgePanRAF);
    edgePanRAF = null;
  }
}

function edgePanTick() {
  edgePanRAF = null;
  const state = getState();
  if (!state.pendingPoint || !lastMouseEvent) return;
  if (state.mode !== 'calibrate' && state.mode !== 'measure') return;

  const rect = getOverlayCanvas().parentElement.getBoundingClientRect();
  const mx = lastMouseEvent.clientX - rect.left;
  const my = lastMouseEvent.clientY - rect.top;

  let dx = 0, dy = 0;
  if (mx < EDGE_PAN_MARGIN) dx = EDGE_PAN_SPEED * (1 - mx / EDGE_PAN_MARGIN);
  else if (mx > rect.width - EDGE_PAN_MARGIN) dx = -EDGE_PAN_SPEED * (1 - (rect.width - mx) / EDGE_PAN_MARGIN);
  if (my < EDGE_PAN_MARGIN) dy = EDGE_PAN_SPEED * (1 - my / EDGE_PAN_MARGIN);
  else if (my > rect.height - EDGE_PAN_MARGIN) dy = -EDGE_PAN_SPEED * (1 - (rect.height - my) / EDGE_PAN_MARGIN);

  if (dx !== 0 || dy !== 0) {
    setViewport({
      panX: state.viewport.panX + dx,
      panY: state.viewport.panY + dy,
    });
    // Update overlay with current mouse position
    const pos = screenToImage(lastMouseEvent.clientX, lastMouseEvent.clientY);
    const screenRelPos = getScreenRelativePos(lastMouseEvent);
    renderOverlay(pos, screenRelPos);
    edgePanRAF = requestAnimationFrame(edgePanTick);
  }
}

function onWheel(e) {
  e.preventDefault();
  const img = getActiveImage();
  if (!img) return;

  const state = getState();
  const delta = e.deltaY > 0 ? 1 / 1.15 : 1.15;
  const newZoom = Math.max(0.05, Math.min(20, state.viewport.zoom * delta));

  // Zoom toward mouse position
  const rect = getOverlayCanvas().parentElement.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const panX = mx - (mx - state.viewport.panX) * (newZoom / state.viewport.zoom);
  const panY = my - (my - state.viewport.panY) * (newZoom / state.viewport.zoom);

  setViewport({ zoom: newZoom, panX, panY });
}

function updateOverlayCursor() {
  const overlay = getOverlayCanvas();
  overlay.className = '';
  overlay.classList.add(`mode-${getState().mode}`);
}

// --- Minimap helper ---

function centerViewportOnImage(imgX, imgY) {
  const state = getState();
  const canvasSize = getCanvasSize();
  const panX = canvasSize.width / 2 - imgX * state.viewport.zoom;
  const panY = canvasSize.height / 2 - imgY * state.viewport.zoom;
  setViewport({ panX, panY });
}

// --- Zoom helpers for keyboard ---

function zoomBy(factor) {
  const state = getState();
  const newZoom = Math.max(0.05, Math.min(20, state.viewport.zoom * factor));
  const canvasSize = getCanvasSize();
  const cx = canvasSize.width / 2;
  const cy = canvasSize.height / 2;
  const panX = cx - (cx - state.viewport.panX) * (newZoom / state.viewport.zoom);
  const panY = cy - (cy - state.viewport.panY) * (newZoom / state.viewport.zoom);
  setViewport({ zoom: newZoom, panX, panY });
}

function resetZoom() {
  const vp = fitImageInView();
  if (vp) setViewport(vp);
}

function setZoomTo(newZoom) {
  const state = getState();
  newZoom = Math.max(0.05, Math.min(20, newZoom));
  const canvasSize = getCanvasSize();
  const cx = canvasSize.width / 2;
  const cy = canvasSize.height / 2;
  const panX = cx - (cx - state.viewport.panX) * (newZoom / state.viewport.zoom);
  const panY = cy - (cy - state.viewport.panY) * (newZoom / state.viewport.zoom);
  setViewport({ zoom: newZoom, panX, panY });
}

// --- Filter sliders ---

function bindFilterSliders() {
  const brightness = document.getElementById('slider-brightness');
  const contrast = document.getElementById('slider-contrast');
  const resetBtn = document.getElementById('btn-reset-filters');

  brightness.addEventListener('input', () => {
    setFilters(parseInt(brightness.value), parseInt(contrast.value));
  });
  contrast.addEventListener('input', () => {
    setFilters(parseInt(brightness.value), parseInt(contrast.value));
  });
  resetBtn.addEventListener('click', () => {
    brightness.value = 100;
    contrast.value = 100;
    setFilters(100, 100);
  });
}
