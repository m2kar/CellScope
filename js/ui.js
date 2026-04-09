// ui.js — DOM updates: sidebar, annotation table, status bar, keyboard shortcuts

import { getState, getActiveImage, setActiveImage, removeImage, setMode, undo, redo, canUndo, canRedo, dispatch, clearPending } from './state.js';

// --- Status bar ---

export function setStatus(msg) {
  document.getElementById('status-message').textContent = msg;
}

export function updateZoomDisplay() {
  const { zoom } = getState().viewport;
  const pct = Math.round(zoom * 100);
  const zoomEl = document.getElementById('status-zoom');
  // Only update text if not currently editing
  if (!zoomEl.querySelector('#zoom-input')) {
    zoomEl.textContent = `缩放: ${pct}%`;
  }
  // Update slider position (logarithmic scale)
  const slider = document.getElementById('zoom-slider');
  slider.value = zoomToSlider(zoom);
}

// Logarithmic mapping: slider value <-> zoom
// slider 5..2000 maps to zoom 0.05..20 via log scale
function sliderToZoom(val) {
  // val 5..2000 -> log space -> zoom 0.05..20
  const minLog = Math.log(0.05);
  const maxLog = Math.log(20);
  const t = (val - 5) / (2000 - 5);
  return Math.exp(minLog + t * (maxLog - minLog));
}

function zoomToSlider(zoom) {
  const minLog = Math.log(0.05);
  const maxLog = Math.log(20);
  const t = (Math.log(zoom) - minLog) / (maxLog - minLog);
  return Math.round(5 + t * (2000 - 5));
}

export function initZoomControls() {
  const slider = document.getElementById('zoom-slider');
  const zoomEl = document.getElementById('status-zoom');

  slider.addEventListener('input', () => {
    const newZoom = sliderToZoom(Number(slider.value));
    setZoomTo(newZoom);
  });

  zoomEl.addEventListener('dblclick', () => {
    const { zoom } = getState().viewport;
    const pct = Math.round(zoom * 100);
    zoomEl.innerHTML = `缩放: <input id="zoom-input" type="number" min="5" max="2000" value="${pct}">%`;
    const input = document.getElementById('zoom-input');
    input.focus();
    input.select();

    const commit = () => {
      const val = parseInt(input.value);
      if (val && val >= 5 && val <= 2000) {
        setZoomTo(val / 100);
      }
      zoomEl.textContent = `缩放: ${Math.round(getState().viewport.zoom * 100)}%`;
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { zoomEl.textContent = `缩放: ${Math.round(getState().viewport.zoom * 100)}%`; }
    });
  });
}

// --- Image list sidebar ---

export function updateImageList() {
  const state = getState();
  const list = document.getElementById('image-list');
  list.innerHTML = '';

  state.images.forEach((img, index) => {
    const div = document.createElement('div');
    div.className = 'image-item' + (index === state.activeImageIndex ? ' active' : '');
    div.innerHTML = `
      <button class="image-close" title="关闭图片">&times;</button>
      ${img.thumbnail ? `<img class="image-thumb" src="${img.thumbnail}" alt="">` : ''}
      <span class="image-name">${img.fileName}</span>
      <span class="image-info">${img.width}x${img.height} | ${img.particles.length} 粒子${img.calibration ? ' | 已标定' : ''}</span>
    `;
    div.addEventListener('click', () => setActiveImage(index));
    div.querySelector('.image-close').addEventListener('click', (e) => {
      e.stopPropagation();
      removeImage(index);
    });
    list.appendChild(div);
  });

  // Show/hide empty hint
  document.getElementById('empty-hint').style.display = state.images.length > 0 ? 'none' : '';
}

// --- Annotation table ---

export function updateAnnotationTable() {
  const state = getState();
  const tbody = document.getElementById('annotation-tbody');
  tbody.innerHTML = '';

  for (let imgIdx = 0; imgIdx < state.images.length; imgIdx++) {
    const img = state.images[imgIdx];

    // Show unpaired pending line first (highlighted)
    if (img.pendingLine) {
      const line = img.pendingLine;
      const tr = document.createElement('tr');
      tr.className = 'row-pending';
      tr.innerHTML = `
        <td>${img.fileName}</td>
        <td style="color:#ffb86b">待配对</td>
        <td>${line.length.toFixed(2)} ${line.unit}</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td><button class="btn-delete" data-img="${imgIdx}" data-action="remove-line">删除</button></td>
      `;
      tbody.appendChild(tr);
    }

    // Show paired particles
    for (const p of img.particles) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${img.fileName}</td>
        <td>#${p.id}</td>
        <td>${p.majorLength.toFixed(2)} ${p.unit}</td>
        <td>${p.minorLength.toFixed(2)} ${p.unit}</td>
        <td>${p.aspectRatio.toFixed(3)}</td>
        <td>${p.equivalentDiameter.toFixed(2)} ${p.unit}</td>
        <td><button class="btn-delete" data-img="${imgIdx}" data-id="${p.id}">删除</button></td>
      `;
      tbody.appendChild(tr);
    }
  }

  // Bind delete buttons
  tbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const imgIdx = parseInt(btn.dataset.img);
      if (btn.dataset.action === 'remove-line') {
        dispatch({ type: 'REMOVE_LINE', imageIndex: imgIdx, line: null });
      } else {
        const particleId = parseInt(btn.dataset.id);
        dispatch({ type: 'REMOVE_PARTICLE', imageIndex: imgIdx, particleId });
      }
    });
  });
}

// --- Toolbar mode buttons ---

export function updateModeButtons() {
  const { mode } = getState();
  for (const m of ['navigate', 'calibrate', 'measure']) {
    const btn = document.getElementById(`btn-${m}`);
    btn.classList.toggle('active', mode === m);
  }
}

export function updateUndoRedoButtons() {
  document.getElementById('btn-undo').disabled = !canUndo();
  document.getElementById('btn-redo').disabled = !canRedo();
}

// --- Table toggle ---

export function initTableToggle() {
  const toggle = document.getElementById('table-toggle');
  const container = document.getElementById('table-container');
  const icon = document.getElementById('table-toggle-icon');
  toggle.addEventListener('click', () => {
    container.classList.toggle('collapsed');
    icon.textContent = container.classList.contains('collapsed') ? '▶' : '▼';
  });
}

export function initSidebarToggle() {
  document.getElementById('toggle-left').addEventListener('click', () => {
    document.getElementById('sidebar-left').classList.toggle('collapsed');
    // Trigger resize so canvas recalculates
    window.dispatchEvent(new Event('resize'));
  });
  document.getElementById('toggle-right').addEventListener('click', () => {
    document.getElementById('sidebar-right').classList.toggle('collapsed');
    window.dispatchEvent(new Event('resize'));
  });
}

// --- Keyboard shortcuts ---

export function initKeyboardShortcuts() {
  let spaceHeld = false;
  let prevMode = null;

  document.addEventListener('keydown', (e) => {
    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    const ctrl = e.ctrlKey || e.metaKey;

    if (e.key === 'z' && ctrl && e.shiftKey) {
      e.preventDefault();
      redo();
    } else if (e.key === 'z' && ctrl) {
      e.preventDefault();
      undo();
    } else if (e.key === ' ' && !spaceHeld) {
      e.preventDefault();
      spaceHeld = true;
      prevMode = getState().mode;
      setMode('navigate');
    } else if (e.key === 'Escape') {
      const state = getState();
      if (state.pendingPoint) {
        clearPending();
        setStatus('操作已取消');
      } else {
        setMode('navigate');
      }
    } else if (e.key === 'c' || e.key === 'C') {
      setMode('calibrate');
    } else if (e.key === 'm' || e.key === 'M') {
      setMode('measure');
    } else if (e.key === 'v' || e.key === 'V') {
      setMode('navigate');
    } else if (e.key === '+' || e.key === '=') {
      zoomBy(1.2);
    } else if (e.key === '-') {
      zoomBy(1 / 1.2);
    } else if (e.key === '0') {
      resetZoom();
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === ' ' && spaceHeld) {
      spaceHeld = false;
      if (prevMode) {
        setMode(prevMode);
        prevMode = null;
      }
    }
  });
}

// These will be set by app.js
let zoomBy = () => {};
let resetZoom = () => {};
let setZoomTo = () => {};

export function setZoomCallbacks(zoomByFn, resetZoomFn, setZoomToFn) {
  zoomBy = zoomByFn;
  resetZoom = resetZoomFn;
  setZoomTo = setZoomToFn;
}
