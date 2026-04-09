// statistics.js — Statistics computation + scatter plot (major vs minor axis)

import { getState } from './state.js';

let scatterChart = null;

export function initStatistics() {
  // No dropdown needed anymore — scatter plot always shows major vs minor
}

export function updateStatistics() {
  const state = getState();
  const allParticles = [];
  for (const img of state.images) {
    for (const p of img.particles) {
      allParticles.push(p);
    }
  }

  const el = (id) => document.getElementById(id);
  el('stat-count').textContent = allParticles.length;

  if (allParticles.length === 0) {
    for (const id of ['stat-major-mean', 'stat-major-std', 'stat-minor-mean', 'stat-minor-std', 'stat-eq-mean', 'stat-eq-std']) {
      el(id).textContent = '-';
    }
    updateScatter([], '');
    return;
  }

  const unit = allParticles[0].unit || '';
  const majors = allParticles.map(p => p.majorLength);
  const minors = allParticles.map(p => p.minorLength);
  const eqDiams = allParticles.map(p => p.equivalentDiameter);

  const fmt = (v) => v.toFixed(2) + (unit ? ` ${unit}` : '');
  el('stat-major-mean').textContent = fmt(mean(majors));
  el('stat-major-std').textContent = fmt(stddev(majors));
  el('stat-minor-mean').textContent = fmt(mean(minors));
  el('stat-minor-std').textContent = fmt(stddev(minors));
  el('stat-eq-mean').textContent = fmt(mean(eqDiams));
  el('stat-eq-std').textContent = fmt(stddev(eqDiams));

  updateScatter(allParticles, unit);
}

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr) {
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function updateScatter(particles, unit) {
  const canvas = document.getElementById('histogram-canvas');
  const ctx = canvas.getContext('2d');

  if (scatterChart) {
    scatterChart.destroy();
    scatterChart = null;
  }

  if (particles.length === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const data = particles.map(p => ({ x: p.majorLength, y: p.minorLength }));

  // Compute range for 1:1 reference line
  const allVals = particles.flatMap(p => [p.majorLength, p.minorLength]);
  const maxVal = Math.max(...allVals) * 1.1;

  scatterChart = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: '粒子',
          data,
          backgroundColor: 'rgba(108, 155, 255, 0.7)',
          borderColor: 'rgba(108, 155, 255, 1)',
          borderWidth: 1,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
        {
          // 1:1 reference line (major = minor, i.e. perfect sphere)
          label: '1:1',
          data: [{ x: 0, y: 0 }, { x: maxVal, y: maxVal }],
          type: 'line',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderDash: [4, 4],
          borderWidth: 1,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => {
              const p = particles[item.dataIndex];
              if (!p) return '';
              return `#${p.id}: 长径=${item.parsed.x.toFixed(1)} 短径=${item.parsed.y.toFixed(1)} ${unit}`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#a0a0b8', font: { size: 10 } },
          grid: { color: 'rgba(64, 64, 96, 0.3)' },
          title: { display: true, text: `长径 (${unit || 'px'})`, color: '#a0a0b8', font: { size: 11 } },
          beginAtZero: true,
          max: maxVal,
        },
        y: {
          ticks: { color: '#a0a0b8', font: { size: 10 } },
          grid: { color: 'rgba(64, 64, 96, 0.3)' },
          title: { display: true, text: `短径 (${unit || 'px'})`, color: '#a0a0b8', font: { size: 11 } },
          beginAtZero: true,
          max: maxVal,
        },
      },
    },
  });
}
