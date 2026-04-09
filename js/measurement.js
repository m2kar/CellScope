// measurement.js — Line drawing, auto-pairing into particles

import { getState, getActiveImage, setPendingPoint, clearPending, dispatch } from './state.js';
import { setStatus } from './ui.js';

export function handleMeasurementClick(imagePos) {
  const state = getState();

  if (!state.pendingPoint) {
    // First click — start a new line
    setPendingPoint(imagePos);
    setStatus('请点击终点完成这条线');
  } else {
    // Second click — complete the line
    const p1 = state.pendingPoint;
    const p2 = imagePos;
    const line = { p1, p2 };
    clearPending();

    const img = getActiveImage();
    if (!img) return;
    const imgIndex = state.images.indexOf(img);

    if (!img.pendingLine) {
      // No unpaired line — this becomes the first unpaired line
      dispatch({ type: 'ADD_LINE', imageIndex: imgIndex, line });
      const unit = line.unit || 'px';
      setStatus(`第1条线: ${line.length.toFixed(1)} ${unit} — 请画第2条线进行配对`);
    } else {
      // There is an unpaired line — pair them into a particle
      dispatch({ type: 'PAIR_LINES', imageIndex: imgIndex, line });
      const p = img.particles[img.particles.length - 1];
      const unit = p.unit;
      setStatus(`粒子 #${p.id}: 长径=${p.majorLength.toFixed(1)}${unit} 短径=${p.minorLength.toFixed(1)}${unit} — 继续画下一条线`);
    }
  }
}

export function enterMeasureMode() {
  const img = getActiveImage();
  if (img && !img.calibration) {
    setStatus('测量模式 — 注意: 尚未标定比例尺，尺寸将以像素为单位。请画第1条线');
  } else {
    setStatus('测量模式 — 请画第1条线');
  }
}
