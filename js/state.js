// state.js — Central state management with undo/redo (command pattern)

const state = {
  images: [],          // Array of ImageState objects
  activeImageIndex: -1,
  mode: 'navigate',    // 'navigate' | 'calibrate' | 'measure'
  pendingPoint: null,  // {x, y} — first point of a line being drawn
  undoStack: [],
  redoStack: [],
  viewport: { panX: 0, panY: 0, zoom: 1.0 },
  brightness: 100,
  contrast: 100,
};

// Listeners
const listeners = new Set();

export function getState() {
  return state;
}

export function getActiveImage() {
  if (state.activeImageIndex < 0) return null;
  return state.images[state.activeImageIndex] || null;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(changeType) {
  for (const fn of listeners) fn(changeType);
}

// --- Image management ---

export function addImage(imageData) {
  const img = {
    fileName: imageData.fileName,
    width: imageData.width,
    height: imageData.height,
    bitmap: imageData.bitmap,
    thumbnail: imageData.thumbnail,
    calibration: null,
    particles: [],
    pendingLine: null,   // unpaired line {p1, p2} waiting for its pair
    nextParticleId: 1,
  };
  state.images.push(img);
  if (state.activeImageIndex < 0) {
    setActiveImage(state.images.length - 1);
  }
  notify('images');
}

export function setActiveImage(index) {
  if (index < 0 || index >= state.images.length) return;
  state.activeImageIndex = index;
  state.pendingPoint = null;
  notify('activeImage');
}

// --- Mode ---

export function setMode(mode) {
  state.mode = mode;
  state.pendingPoint = null;
  notify('mode');
}

// --- Viewport ---

export function setViewport(vp) {
  Object.assign(state.viewport, vp);
  notify('viewport');
}

export function setFilters(brightness, contrast) {
  state.brightness = brightness;
  state.contrast = contrast;
  notify('filters');
}

// --- Pending interaction state (in-progress line drawing) ---

export function setPendingPoint(point) {
  state.pendingPoint = point;
  notify('pending');
}

export function clearPending() {
  state.pendingPoint = null;
  notify('pending');
}

// --- Undo/Redo command dispatch ---

export function dispatch(action) {
  const inverse = executeAction(action);
  if (inverse) {
    state.undoStack.push(inverse);
    state.redoStack = [];
    notify('data');
  }
}

export function undo() {
  const action = state.undoStack.pop();
  if (!action) return;
  const inverse = executeAction(action);
  if (inverse) state.redoStack.push(inverse);
  notify('data');
}

export function redo() {
  const action = state.redoStack.pop();
  if (!action) return;
  const inverse = executeAction(action);
  if (inverse) state.undoStack.push(inverse);
  notify('data');
}

export function canUndo() { return state.undoStack.length > 0; }
export function canRedo() { return state.redoStack.length > 0; }

function executeAction(action) {
  const img = state.images[action.imageIndex];
  if (!img) return null;

  switch (action.type) {
    // Add a single unpaired line to the image
    case 'ADD_LINE': {
      img.pendingLine = action.line;
      computeLine(img.pendingLine, img.calibration);
      return { type: 'REMOVE_LINE', imageIndex: action.imageIndex, line: action.line };
    }
    // Remove the unpaired line
    case 'REMOVE_LINE': {
      const prev = img.pendingLine;
      img.pendingLine = null;
      return { type: 'ADD_LINE', imageIndex: action.imageIndex, line: prev };
    }
    // Pair the existing pending line with a new line → create particle
    case 'PAIR_LINES': {
      const firstLine = img.pendingLine;
      img.pendingLine = null;
      const particle = buildParticle(img, firstLine, action.line);
      img.particles.push(particle);
      return { type: 'UNPAIR_PARTICLE', imageIndex: action.imageIndex, particleId: particle.id, restoredLine: firstLine };
    }
    // Undo of PAIR_LINES: remove particle, restore pending line
    case 'UNPAIR_PARTICLE': {
      const idx = img.particles.findIndex(p => p.id === action.particleId);
      if (idx < 0) return null;
      const removed = img.particles.splice(idx, 1)[0];
      img.pendingLine = action.restoredLine;
      computeLine(img.pendingLine, img.calibration);
      // The second line that was paired
      const secondLine = getSecondLine(removed, action.restoredLine);
      return { type: 'PAIR_LINES', imageIndex: action.imageIndex, line: secondLine };
    }
    case 'ADD_PARTICLE': {
      img.particles.push(action.particle);
      return { type: 'REMOVE_PARTICLE', imageIndex: action.imageIndex, particleId: action.particle.id };
    }
    case 'REMOVE_PARTICLE': {
      const idx = img.particles.findIndex(p => p.id === action.particleId);
      if (idx < 0) return null;
      const removed = img.particles.splice(idx, 1)[0];
      return { type: 'ADD_PARTICLE', imageIndex: action.imageIndex, particle: removed };
    }
    // Move an endpoint of a particle line, pending line, or calibration
    case 'MOVE_ENDPOINT': {
      // action: { imageIndex, source, particleId?, lineKey?, pointKey, from, to }
      const target = resolveEndpoint(img, action);
      if (!target) return null;
      target[action.pointKey] = action.to;
      recalcAll(img);
      return { type: 'MOVE_ENDPOINT', imageIndex: action.imageIndex, source: action.source,
               particleId: action.particleId, lineKey: action.lineKey, pointKey: action.pointKey,
               from: action.to, to: action.from };
    }
    case 'SET_CALIBRATION': {
      const prev = img.calibration;
      img.calibration = action.calibration;
      recalcAll(img);
      return { type: 'SET_CALIBRATION', imageIndex: action.imageIndex, calibration: prev };
    }
    default:
      return null;
  }
}

// Resolve the line object that contains the endpoint being moved
function resolveEndpoint(img, action) {
  switch (action.source) {
    case 'particle': {
      const p = img.particles.find(p => p.id === action.particleId);
      if (!p) return null;
      return p[action.lineKey]; // 'major' or 'minor'
    }
    case 'pendingLine':
      return img.pendingLine;
    case 'calibration':
      return img.calibration;
    default:
      return null;
  }
}

// Figure out which line in a particle was the "second" one (not restoredLine)
function getSecondLine(particle, restoredLine) {
  // restoredLine was the first line; figure out if it became major or minor
  if (particle.major.p1.x === restoredLine.p1.x && particle.major.p1.y === restoredLine.p1.y &&
      particle.major.p2.x === restoredLine.p2.x && particle.major.p2.y === restoredLine.p2.y) {
    return particle.minor;
  }
  return particle.major;
}

// --- Computation ---

function pixelDistance(p1, p2) {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

// Compute length for a single unpaired line
function computeLine(line, calibration) {
  if (!line) return;
  const px = pixelDistance(line.p1, line.p2);
  if (calibration) {
    line.length = px / calibration.pixelsPerUnit;
    line.unit = calibration.unit;
  } else {
    line.length = px;
    line.unit = 'px';
  }
}

function buildParticle(img, line1, line2) {
  let major = line1;
  let minor = line2;
  const px1 = pixelDistance(line1.p1, line1.p2);
  const px2 = pixelDistance(line2.p1, line2.p2);
  if (px2 > px1) {
    [major, minor] = [minor, major];
  }
  const particle = {
    id: img.nextParticleId++,
    major,
    minor,
  };
  computeParticle(particle, img.calibration);
  return particle;
}

function computeParticle(particle, calibration) {
  const majorPx = pixelDistance(particle.major.p1, particle.major.p2);
  const minorPx = pixelDistance(particle.minor.p1, particle.minor.p2);
  if (calibration) {
    const ppu = calibration.pixelsPerUnit;
    particle.majorLength = majorPx / ppu;
    particle.minorLength = minorPx / ppu;
    particle.aspectRatio = particle.majorLength / particle.minorLength;
    particle.equivalentDiameter = Math.sqrt(particle.majorLength * particle.minorLength);
    particle.unit = calibration.unit;
  } else {
    particle.majorLength = majorPx;
    particle.minorLength = minorPx;
    particle.aspectRatio = majorPx / minorPx;
    particle.equivalentDiameter = Math.sqrt(majorPx * minorPx);
    particle.unit = 'px';
  }
}

function recalcAll(img) {
  computeLine(img.pendingLine, img.calibration);
  for (const p of img.particles) {
    computeParticle(p, img.calibration);
  }
}

export function createCalibration(p1, p2, length, unit) {
  const pxDist = pixelDistance(p1, p2);
  return { p1, p2, length, unit, pixelsPerUnit: pxDist / length };
}
