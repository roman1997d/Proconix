/**
 * Manager Dashboard – chart initialisation (exposed for dynamic content).
 */

(function () {
  'use strict';

  function initCharts() {
    if (typeof Chart === 'undefined') return;

    var lineCtx = document.getElementById('lineChart');
    if (lineCtx) {
      var existing = Chart.getChart(lineCtx);
      if (existing) existing.destroy();
      new Chart(lineCtx, {
        type: 'line',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [{
            label: 'Activity',
            data: [30, 45, 38, 52, 48, 65],
            borderColor: '#12D6FF',
            backgroundColor: 'rgba(18, 214, 255, 0.1)',
            fill: true,
            tension: 0.4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#262626',
              titleColor: '#E0E0E0',
              bodyColor: '#BFBFBF',
              borderColor: '#12D6FF',
              borderWidth: 1,
            },
          },
          scales: {
            x: {
              grid: { color: '#333' },
              ticks: { color: '#9E9E9E' },
            },
            y: {
              grid: { color: '#333' },
              ticks: { color: '#9E9E9E' },
            },
          },
        },
      });
    }

    var pieCtx = document.getElementById('pieChart');
    if (pieCtx) {
      var existingPie = Chart.getChart(pieCtx);
      if (existingPie) existingPie.destroy();
      new Chart(pieCtx, {
        type: 'doughnut',
        data: {
          labels: ['Revenue', 'Expense', 'Others'],
          datasets: [{
            data: [55, 30, 15],
            backgroundColor: ['#50F57D', '#FF6A6A', '#FFD86B'],
            borderWidth: 0,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#BFBFBF' },
            },
            tooltip: {
              backgroundColor: '#262626',
              titleColor: '#E0E0E0',
              bodyColor: '#BFBFBF',
            },
          },
        },
      });
    }
  }

  window.initDashboardCharts = initCharts;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCharts);
  } else {
    initCharts();
  }
})();
