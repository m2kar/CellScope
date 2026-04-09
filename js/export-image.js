// export-image.js — Export annotated image as PNG

import { getActiveImage } from './state.js';
import { renderToExportCanvas } from './canvas.js';

export function exportImage() {
  const img = getActiveImage();
  if (!img) {
    alert('没有活跃图片');
    return;
  }

  const canvas = renderToExportCanvas();
  if (!canvas) return;

  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = img.fileName.replace(/\.[^.]+$/, '');
    a.download = `${baseName}_annotated.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
