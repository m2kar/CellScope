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

    // Try to find an existing pending line that intersects with the new line
    let pairedIndex = -1;
    for (let i = 0; i < img.pendingLines.length; i++) {
      const pending = img.pendingLines[i];
      if (segmentsIntersect(pending.p1, pending.p2, line.p1, line.p2)) {
        pairedIndex = i;
        break;
      }
    }

    if (pairedIndex >= 0) {
      // Found an intersecting line — pair them into a particle
      dispatch({ type: 'PAIR_LINES', imageIndex: imgIndex, line, pairedLineIndex: pairedIndex });
      const p = img.particles[img.particles.length - 1];
      const unit = p.unit;
      setStatus(`粒子 #${p.id}: 长径=${p.majorLength.toFixed(1)}${unit} 短径=${p.minorLength.toFixed(1)}${unit} — 继续画下一条线`);
    } else {
      // No intersecting line found — add to pending queue
      dispatch({ type: 'ADD_LINE', imageIndex: imgIndex, line });
      const unit = line.unit || 'px';
      const count = img.pendingLines.length;
      setStatus(`待配对线 ${count} 条: ${line.length.toFixed(1)} ${unit} — 请画交叉的线进行配对`);
    }
  }
}

// Check if two line segments (a1-a2) and (b1-b2) intersect
function segmentsIntersect(a1, a2, b1, b2) {
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  // Check collinear cases
  if (d1 === 0 && onSegment(b1, b2, a1)) return true;
  if (d2 === 0 && onSegment(b1, b2, a2)) return true;
  if (d3 === 0 && onSegment(a1, a2, b1)) return true;
  if (d4 === 0 && onSegment(a1, a2, b2)) return true;
  return false;
}

function cross(p, q, r) {
  return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
}

function onSegment(p, q, r) {
  return Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) &&
         Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
}

export function enterMeasureMode() {
  const img = getActiveImage();
  if (img && !img.calibration) {
    setStatus('测量模式 — 注意: 尚未标定比例尺，尺寸将以像素为单位。请画第1条线');
  } else {
    setStatus('测量模式 — 请画第1条线');
  }
}
