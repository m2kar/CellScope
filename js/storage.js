// storage.js — localStorage save/restore for annotations

import { getState } from './state.js';

const STORAGE_KEY = 'particle-measure-state';
let saveTimer = null;

export function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToStorage, 1000);
}

function saveToStorage() {
  const state = getState();
  const data = state.images.map(img => ({
    fileName: img.fileName,
    width: img.width,
    height: img.height,
    calibration: img.calibration,
    particles: img.particles,
    nextParticleId: img.nextParticleId,
  }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }
}

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to load from localStorage:', e);
    return null;
  }
}

export function restoreAnnotations(savedData, images) {
  if (!savedData) return;
  for (const img of images) {
    const saved = savedData.find(s => s.fileName === img.fileName);
    if (saved) {
      img.calibration = saved.calibration;
      img.particles = saved.particles || [];
      img.nextParticleId = saved.nextParticleId || (img.particles.length + 1);
    }
  }
}

export function clearStorage() {
  localStorage.removeItem(STORAGE_KEY);
}
