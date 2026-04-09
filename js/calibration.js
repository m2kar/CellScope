// calibration.js — Scale bar calibration flow

import { getState, getActiveImage, setPendingPoint, clearPending, dispatch, createCalibration, setMode } from './state.js';
import { setStatus } from './ui.js';

let resolveDialog = null;

export function initCalibration() {
  document.getElementById('calibration-ok').addEventListener('click', onDialogOk);
  document.getElementById('calibration-cancel').addEventListener('click', onDialogCancel);
  document.getElementById('calibration-dialog').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onDialogOk();
    if (e.key === 'Escape') onDialogCancel();
  });
}

export function handleCalibrationClick(imagePos) {
  const state = getState();
  if (!state.pendingPoint) {
    // First click — record first endpoint
    setPendingPoint(imagePos);
    setStatus('请点击比例尺的第二个端点（已锁定为水平线）');
  } else {
    // Second click — lock Y to first point for pure horizontal line
    const p1 = state.pendingPoint;
    const p2 = { x: imagePos.x, y: p1.y };
    const pxDist = Math.abs(p2.x - p1.x);
    clearPending();
    showCalibrationDialog(p1, p2, pxDist);
  }
}

async function showCalibrationDialog(p1, p2, pxDist) {
  const dialog = document.getElementById('calibration-dialog');
  const info = document.getElementById('calibration-pixel-info');
  const lengthInput = document.getElementById('calibration-length');
  const unitSelect = document.getElementById('calibration-unit');

  info.textContent = `像素距离: ${pxDist.toFixed(1)} px`;
  lengthInput.value = '';
  dialog.hidden = false;
  lengthInput.focus();

  const result = await new Promise(resolve => { resolveDialog = resolve; });
  dialog.hidden = true;

  if (result) {
    const length = parseFloat(lengthInput.value);
    const unit = unitSelect.value;
    if (length > 0) {
      const calibration = createCalibration(p1, p2, length, unit);
      const img = getActiveImage();
      const imgIndex = getState().images.indexOf(img);
      dispatch({ type: 'SET_CALIBRATION', imageIndex: imgIndex, calibration });
      setMode('navigate');
      // Set status after mode change to override the default navigate message
      setStatus(`比例尺已标定: ${pxDist.toFixed(1)} px = ${length} ${unit}`);
    }
  } else {
    setStatus('标定已取消');
  }
}

function onDialogOk() {
  if (resolveDialog) { resolveDialog(true); resolveDialog = null; }
}

function onDialogCancel() {
  if (resolveDialog) { resolveDialog(false); resolveDialog = null; }
}

export function enterCalibrationMode() {
  setStatus('请点击比例尺的第一个端点');
}
