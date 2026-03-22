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
    if (pieCtx && typeof window.updateQaWorkTypePieChart === 'function') {
      window.updateQaWorkTypePieChart(null);
    }
  }

  /**
   * @param {Array<{code?: string, label?: string, count?: number}>|null|undefined} segments - from GET /api/dashboard/overview-stats (qa_job_cost_by_type). Pass null to clear only (e.g. module switch).
   */
  function updateQaWorkTypePieChart(segments) {
    if (typeof Chart === 'undefined') return;
    var pieCtx = document.getElementById('pieChart');
    if (!pieCtx) return;

    var existingPie = Chart.getChart(pieCtx);
    if (existingPie) existingPie.destroy();

    if (segments === null || segments === undefined) {
      return;
    }

    var palette = {
      day: '#50F57D',
      hour: '#12D6FF',
      price: '#FFD86B',
      none: '#9E9E9E',
    };
    var fallbackColors = ['#C67BFF', '#FF6A6A', '#88E788', '#FFB74D', '#78909C'];

    var labels = [];
    var data = [];
    var colors = [];
    var list = Array.isArray(segments) ? segments.filter(function (s) { return s && Number(s.count) > 0; }) : [];

    if (list.length === 0) {
      labels = ['No QA jobs yet'];
      data = [1];
      colors = ['#424242'];
    } else {
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        var code = (s.code && String(s.code).toLowerCase()) || 'none';
        labels.push(s.label || code);
        data.push(Number(s.count));
        colors.push(palette[code] || fallbackColors[i % fallbackColors.length]);
      }
    }

    new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#BFBFBF', boxWidth: 12 },
          },
          tooltip: {
            backgroundColor: '#262626',
            titleColor: '#E0E0E0',
            bodyColor: '#BFBFBF',
            callbacks: {
              label: function (ctx) {
                var v = ctx.raw;
                var total = ctx.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                if (labels[0] === 'No QA jobs yet') return '0 jobs';
                var pct = total ? Math.round((v / total) * 100) : 0;
                return ' ' + v + ' jobs (' + pct + '%)';
              },
            },
          },
        },
      },
    });
  }

  window.initDashboardCharts = initCharts;
  window.updateQaWorkTypePieChart = updateQaWorkTypePieChart;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCharts);
  } else {
    initCharts();
  }
})();
