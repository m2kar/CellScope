// csv-export.js — CSV generation and download

import { getState } from './state.js';

export function exportCSV() {
  const state = getState();
  const rows = [
    ['Image Name', 'Particle ID', 'Major Axis', 'Minor Axis', 'Aspect Ratio', 'Equivalent Diameter', 'Unit'].join(','),
  ];

  for (const img of state.images) {
    const unit = img.calibration ? img.calibration.unit : 'px';
    for (const p of img.particles) {
      rows.push([
        `"${img.fileName}"`,
        p.id,
        p.majorLength.toFixed(2),
        p.minorLength.toFixed(2),
        p.aspectRatio.toFixed(3),
        p.equivalentDiameter.toFixed(2),
        unit,
      ].join(','));
    }
  }

  if (rows.length === 1) {
    alert('没有标注数据可导出');
    return;
  }

  const csv = rows.join('\n');
  const bom = '\uFEFF'; // UTF-8 BOM for Excel compatibility
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'particle_measurements.csv';
  a.click();
  URL.revokeObjectURL(url);
}
