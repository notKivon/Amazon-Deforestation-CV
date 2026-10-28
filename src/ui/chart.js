// Forest cover % by year. Too-cloudy years are gaps; extended-window years are hollow points.
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend } from 'chart.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

export function chartConfig(report) {
  const green = '#2d6a4f';
  return {
    type: 'line',
    data: {
      labels: report.map((r) => String(r.year)),
      datasets: [{
        label: 'Forest cover (%)',
        data: report.map((r) => (r.reported ? r.coverPct : null)),
        borderColor: green,
        backgroundColor: green,
        spanGaps: false,
        tension: 0,
        pointRadius: report.map((r) => (r.extended ? 6 : 5)),
        pointBorderWidth: 2,
        pointBackgroundColor: report.map((r) => (r.extended ? '#ffffff' : green)),
        pointStyle: 'circle',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: { y: { min: 0, max: 100, title: { display: true, text: 'Forest cover (%)' } } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const r = report[ctx.dataIndex];
              return `${r.coverPct.toFixed(1)}% forest${r.extended ? ' (extended window)' : ''}`;
            },
          },
        },
      },
    },
  };
}

export function createChart(canvas, report) {
  return new Chart(canvas, chartConfig(report));
}
