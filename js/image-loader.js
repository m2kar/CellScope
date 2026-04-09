// image-loader.js — TIFF/image loading with lazy decode strategy

export async function loadImageFile(file) {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'tif' || ext === 'tiff') {
    return loadTiff(file);
  }
  return loadStandardImage(file);
}

async function loadTiff(file) {
  const buffer = await file.arrayBuffer();
  const tiff = await GeoTIFF.fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const rasters = await image.readRasters();
  const samplesPerPixel = rasters.length;

  // Build RGBA pixel data
  const rgba = new Uint8ClampedArray(width * height * 4);
  const n = width * height;

  if (samplesPerPixel >= 3) {
    // RGB or RGBA
    const r = rasters[0], g = rasters[1], b = rasters[2];
    const a = samplesPerPixel >= 4 ? rasters[3] : null;
    for (let i = 0; i < n; i++) {
      const off = i * 4;
      rgba[off]     = r[i];
      rgba[off + 1] = g[i];
      rgba[off + 2] = b[i];
      rgba[off + 3] = a ? a[i] : 255;
    }
  } else {
    // Grayscale (1 channel)
    const gray = rasters[0];
    for (let i = 0; i < n; i++) {
      const off = i * 4;
      rgba[off] = rgba[off + 1] = rgba[off + 2] = gray[i];
      rgba[off + 3] = 255;
    }
  }

  const imageData = new ImageData(rgba, width, height);
  const bitmap = await createImageBitmap(imageData);
  return { fileName: file.name, width, height, bitmap };
}

async function loadStandardImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      const bitmap = await createImageBitmap(img);
      URL.revokeObjectURL(url);
      resolve({ fileName: file.name, width: img.naturalWidth, height: img.naturalHeight, bitmap });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${file.name}`));
    };
    img.src = url;
  });
}

export function createThumbnail(bitmap, maxSize = 140) {
  const scale = Math.min(maxSize / bitmap.width, maxSize / bitmap.height);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.6);
}
