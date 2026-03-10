const DASHBOARD_CHARTS = {};
const DASHBOARD_STATE = {
  vesselInspectionScopeFilter: 'All',
  vesselInspectionStatusFilter: 'All',
  steamTrapInspectionScopeFilter: 'All'
};

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 10);
}

function inspectionCompletionDateISO(row = {}) {
  return String(
    row.completed_at
    || row.completion_date
    || row.completion_datetime
    || row.timestamp
    || row.inspection_date
    || ''
  ).slice(0, 10);
}

function groupByUnit(rows = []) {
  return rows.reduce((acc, row) => {
    const unit = row.unit_name || row.unit || 'Unknown';
    if (!acc[unit]) acc[unit] = [];
    acc[unit].push(row);
    return acc;
  }, {});
}

function computeSummary(rows = [], opts = {}) {
  const today = todayISO();
  const inspectionMode = opts.mode === 'inspection';
  const requisitionMode = opts.mode === 'requisition';
  const observationMode = opts.mode === 'observation';

  if (observationMode) {
    return {
      total: rows.length,
      inProgress: rows.filter((r) => r.status === 'In Progress').length,
      completed: rows.filter((r) => r.status === 'Completed').length
    };
  }

  if (requisitionMode) {
    const completed = rows.filter((r) => String(r.result || '').toLowerCase() === 'completed').length;
    return {
      total: rows.length,
      planned: rows.length,
      completed,
      todayCompleted: rows.filter((r) => String(r.timestamp || r.requisition_datetime || '').slice(0, 10) === today && String(r.result || '').toLowerCase() === 'completed').length,
      inProgress: Math.max(rows.length - completed, 0),
      percent: rows.length ? Number(((completed / rows.length) * 100).toFixed(1)) : 0
    };
  }

  if (inspectionMode) {
    const planned = rows.filter((r) => normalizeInspectionType(r.inspection_type) === 'planned').length;
    const opportunity = rows.filter((r) => normalizeInspectionType(r.inspection_type) === 'opportunity based').length;
    const inProgress = rows.filter((r) => r.status === 'In Progress' || r.final_status === 'In Progress').length;
    const completed = rows.filter((r) => r.status === 'Completed' || r.final_status === 'Completed').length;
    return {
      total: rows.length,
      planned,
      opportunity,
      inProgress,
      completed,
      todayCompleted: rows.filter((r) => inspectionCompletionDateISO(r) === today && (r.status === 'Completed' || r.final_status === 'Completed')).length,
      percent: rows.length ? Number(((completed / rows.length) * 100).toFixed(1)) : 0
    };
  }

  return { total: rows.length };
}

function renderBarChart(canvasId, labels, plannedData, completedData, percentData = []) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;

  if (DASHBOARD_CHARTS[canvasId]) DASHBOARD_CHARTS[canvasId].destroy();

  const datasets = [
    { label: 'Planned', data: plannedData, backgroundColor: '#0ea5e9' },
    { label: 'Completed', data: completedData, backgroundColor: '#22c55e' }
  ];

  if (percentData.length) {
    datasets.push({
      label: '% Completed',
      data: percentData,
      type: 'line',
      yAxisID: 'y1',
      borderColor: '#f59e0b',
      backgroundColor: '#f59e0b',
      tension: 0.2
    });
  }

  DASHBOARD_CHARTS[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { beginAtZero: true },
        y1: percentData.length ? { beginAtZero: true, max: 100, position: 'right', grid: { drawOnChartArea: false } } : undefined
      }
    }
  });
}


function normalizeInspectionType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'planned') return 'planned';
  if (['opportunity', 'opportunity based', 'opportunity-based'].includes(normalized)) return 'opportunity based';
  return normalized;
}

function isCompletedInspection(row) {
  return row.status === 'Completed' || row.final_status === 'Completed';
}

function isInProgressInspection(row) {
  return row.status === 'In Progress' || row.final_status === 'In Progress';
}

function normalizeInspectionForm(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['boroscopy', 'borescopy'].includes(normalized)) return 'boroscopy';
  if (normalized === 'internal') return 'internal';
  if (normalized === 'external') return 'external';
  if (normalized === 'hot') return 'hot';
  if (normalized === 'cold') return 'cold';
  return normalized;
}

function inspectionFormLabel(value) {
  const normalized = normalizeInspectionForm(value);
  if (normalized === 'boroscopy') return 'BOROSCOPY';
  if (normalized === 'internal') return 'INTERNAL';
  if (normalized === 'external') return 'EXTERNAL';
  if (normalized === 'hot') return 'HOT';
  if (normalized === 'cold') return 'COLD';
  return String(value || '').trim();
}

function renderVesselProgressTable(rows = []) {
  const today = todayISO();
  const grouped = groupByUnit(rows);
  const units = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

  const metricsByUnit = units.map((unit) => {
    const unitRows = grouped[unit];
    const plannedRows = unitRows.filter((r) => normalizeInspectionType(r.inspection_type) === 'planned');
    const opportunityRows = unitRows.filter((r) => normalizeInspectionType(r.inspection_type) === 'opportunity based');

    return {
      unit,
      planned: plannedRows.length,
      opportunity: opportunityRows.length,
      dayPlannedCompleted: plannedRows.filter((r) => inspectionCompletionDateISO(r) === today && isCompletedInspection(r)).length,
      dayOpportunityCompleted: opportunityRows.filter((r) => inspectionCompletionDateISO(r) === today && isCompletedInspection(r)).length,
      cumulativePlannedCompleted: plannedRows.filter(isCompletedInspection).length,
      cumulativeOpportunityCompleted: opportunityRows.filter(isCompletedInspection).length,
      inProgress: unitRows.filter(isInProgressInspection).length
    };
  });

  const totals = metricsByUnit.reduce((acc, row) => {
    acc.planned += row.planned;
    acc.opportunity += row.opportunity;
    acc.dayPlannedCompleted += row.dayPlannedCompleted;
    acc.dayOpportunityCompleted += row.dayOpportunityCompleted;
    acc.cumulativePlannedCompleted += row.cumulativePlannedCompleted;
    acc.cumulativeOpportunityCompleted += row.cumulativeOpportunityCompleted;
    acc.inProgress += row.inProgress;
    return acc;
  }, {
    planned: 0,
    opportunity: 0,
    dayPlannedCompleted: 0,
    dayOpportunityCompleted: 0,
    cumulativePlannedCompleted: 0,
    cumulativeOpportunityCompleted: 0,
    inProgress: 0
  });

  return `
    <div class="table-wrap vessel-progress-wrap">
      <table class="vessel-progress-table">
        <thead>
          <tr>
            <th colspan="3">Planned</th>
            <th colspan="2">Day's Progress</th>
            <th colspan="3">Cumulative Progress</th>
          </tr>
          <tr>
            <th>Plant</th>
            <th>Planned</th>
            <th>Opportunity</th>
            <th>Planned Completed</th>
            <th>Opportunity Completed</th>
            <th>Planned Completed</th>
            <th>Opportunity Completed</th>
            <th>In Progress</th>
          </tr>
        </thead>
        <tbody>
          ${metricsByUnit.map((row) => `
            <tr>
              <td>${row.unit}</td>
              <td>${row.planned || ''}</td>
              <td>${row.opportunity || ''}</td>
              <td>${row.dayPlannedCompleted || ''}</td>
              <td>${row.dayOpportunityCompleted || ''}</td>
              <td>${row.cumulativePlannedCompleted || ''}</td>
              <td>${row.cumulativeOpportunityCompleted || ''}</td>
              <td>${row.inProgress || ''}</td>
            </tr>
          `).join('') || '<tr><td colspan="8">No records</td></tr>'}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            <td>${totals.planned}</td>
            <td>${totals.opportunity}</td>
            <td>${totals.dayPlannedCompleted || ''}</td>
            <td>${totals.dayOpportunityCompleted || ''}</td>
            <td>${totals.cumulativePlannedCompleted || ''}</td>
            <td>${totals.cumulativeOpportunityCompleted || ''}</td>
            <td>${totals.inProgress || ''}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function renderInspectionChartWithOpportunity(canvasId, labels, plannedData, opportunityData, completedData) {
  const baseData = plannedData.map((v, idx) => v + (opportunityData[idx] || 0));
  const percentData = labels.map((_, idx) => {
    const denom = baseData[idx] || 0;
    return denom ? Number(((completedData[idx] / denom) * 100).toFixed(1)) : 0;
  });

  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  if (DASHBOARD_CHARTS[canvasId]) DASHBOARD_CHARTS[canvasId].destroy();

  DASHBOARD_CHARTS[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Planned', data: plannedData, backgroundColor: '#0ea5e9' },
        { label: 'Opportunity Based', data: opportunityData, backgroundColor: '#f59e0b' },
        { label: 'Completed', data: completedData, backgroundColor: '#22c55e' },
        {
          label: '% Completed',
          data: percentData,
          type: 'line',
          yAxisID: 'y1',
          borderColor: '#a855f7',
          backgroundColor: '#a855f7',
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: { beginAtZero: true },
        y1: { beginAtZero: true, max: 100, position: 'right', grid: { drawOnChartArea: false } }
      }
    }
  });
}

function renderSummaryCards(cards = []) {
  return `<section class="cards-grid">${cards.map((c) => `<article class="card"><h3>${c.label}</h3><p>${c.value}</p></article>`).join('')}</section>`;
}

function renderUnitTable(headers, rows) {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="99">No records</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function sectionInspection(title, type, chartId, options = {}) {
  const includeOpportunity = options.includeOpportunity === true;
  const enableInspectionScopeFilter = options.enableInspectionScopeFilter === true;
  const enableInspectionStatusFilter = options.enableInspectionStatusFilter === true;
  const selectedInspectionScopeFilter = options.inspectionScopeFilter || 'All';
  const selectedInspectionStatusFilter = options.inspectionStatusFilter || 'All';
  const inspectionScopeStateKey = options.inspectionScopeStateKey || '';
  const inspectionStatusStateKey = options.inspectionStatusStateKey || '';
  const normalizedSelectedForm = normalizeInspectionForm(selectedInspectionScopeFilter);
  const normalizedSelectedStatus = String(selectedInspectionStatusFilter || '').trim().toLowerCase();

  const baseRows = getCollection('inspections').filter((r) => r.equipment_type === type);
  const inspectionScopeOptions = ['All', ...Array.from(new Set(baseRows
    .map((r) => inspectionFormLabel(r.inspection_form || r.inspection_possible))
    .filter(Boolean)))
    .sort((a, b) => a.localeCompare(b))
  ];

  const inspectionStatusOptions = ['All', ...Array.from(new Set(baseRows
    .map((r) => String(r.status || '').trim())
    .filter(Boolean)))
    .sort((a, b) => a.localeCompare(b))
  ];

  const scopeFilteredRows = normalizedSelectedForm === 'all'
    ? baseRows
    : baseRows.filter((r) => normalizeInspectionForm(r.inspection_form || r.inspection_possible) === normalizedSelectedForm);

  const source = normalizedSelectedStatus === 'all'
    ? scopeFilteredRows
    : scopeFilteredRows.filter((r) => String(r.status || '').trim().toLowerCase() === normalizedSelectedStatus);

  const summary = computeSummary(source, { mode: 'inspection' });
  const grouped = groupByUnit(source);
  const units = Object.keys(grouped);

  const tableRows = units.map((unit) => {
    const unitRows = grouped[unit];
    const unitSummary = computeSummary(unitRows, { mode: 'inspection' });
    return includeOpportunity
      ? [unit, unitSummary.planned, unitSummary.opportunity, unitSummary.todayCompleted, unitSummary.completed]
      : [unit, unitSummary.planned, unitSummary.completed, unitSummary.todayCompleted];
  });

  const cards = [
    { label: 'Total Planned', value: summary.planned },
    includeOpportunity ? { label: 'Total Opportunity Based', value: summary.opportunity } : null,
    { label: 'In Progress', value: summary.inProgress },
    { label: 'Completed', value: summary.completed }
  ].filter(Boolean);

  const filterHtml = enableInspectionScopeFilter
    ? `<div class="filter-tabs dashboard-filter-tabs">${inspectionScopeOptions.map((inspectionScope) => {
      const active = normalizeInspectionForm(inspectionScope) === normalizedSelectedForm;
      return `<button type="button" class="btn tab-btn inspection-scope-filter-btn ${active ? 'active' : ''}" data-inspection-scope="${inspectionScope}" data-inspection-scope-key="${inspectionScopeStateKey}">${inspectionScope}</button>`;
    }).join('')}</div>`
    : '';

  const statusFilterHtml = enableInspectionStatusFilter
    ? `<div class="filter-tabs dashboard-filter-tabs">${inspectionStatusOptions.map((inspectionStatus) => {
      const active = String(inspectionStatus || '').trim().toLowerCase() === normalizedSelectedStatus;
      return `<button type="button" class="btn tab-btn inspection-status-filter-btn ${active ? 'active' : ''}" data-inspection-status="${inspectionStatus}" data-inspection-status-key="${inspectionStatusStateKey}">${inspectionStatus}</button>`;
    }).join('')}</div>`
    : '';

  const tableHeaders = includeOpportunity
    ? ['Unit', 'Planned', 'Opportunity Based', 'Completed Today', 'Total Completed']
    : ['Unit', 'Total Planned', 'Total Completed', `Today\'s Completed`];

  const sectionHtml = `
    <section class="table-card">
      <h2>${title}</h2>
      ${filterHtml}
      ${statusFilterHtml}
      ${renderSummaryCards(cards)}
      ${type === 'Vessel' && includeOpportunity ? renderVesselProgressTable(source) : renderUnitTable(tableHeaders, tableRows)}
      <article class="chart-card"><canvas id="${chartId}"></canvas></article>
    </section>
  `;

  if (includeOpportunity) {
    const plannedData = units.map((u) => computeSummary(grouped[u], { mode: 'inspection' }).planned);
    const opportunityData = units.map((u) => computeSummary(grouped[u], { mode: 'inspection' }).opportunity);
    const completedData = units.map((u) => computeSummary(grouped[u], { mode: 'inspection' }).completed);
    return {
      html: sectionHtml,
      chart: () => renderInspectionChartWithOpportunity(chartId, units, plannedData, opportunityData, completedData)
    };
  }

  const plannedData = units.map((u) => computeSummary(grouped[u], { mode: 'inspection' }).planned);
  const completedData = units.map((u) => computeSummary(grouped[u], { mode: 'inspection' }).completed);
  const percentData = units.map((u, idx) => {
    const planned = plannedData[idx] || 0;
    return planned ? Number(((completedData[idx] / planned) * 100).toFixed(1)) : 0;
  });

  return { html: sectionHtml, chart: () => renderBarChart(chartId, units, plannedData, completedData, percentData) };
}

function sectionRequisitionRT() {
  const allReq = getCollection('requisitions');
  const rt = allReq.filter((r) => (r.type || r.module_type) === 'RT');
  const grouped = groupByUnit(rt);
  const units = Object.keys(grouped);

  const rows = units.map((unit) => {
    const s = computeSummary(grouped[unit], { mode: 'requisition' });
    return [unit, s.total, s.planned, s.completed, `${s.percent}%`];
  });

  const plannedData = units.map((u) => computeSummary(grouped[u], { mode: 'requisition' }).planned);
  const completedData = units.map((u) => computeSummary(grouped[u], { mode: 'requisition' }).completed);
  const percentData = units.map((u) => computeSummary(grouped[u], { mode: 'requisition' }).percent);

  return {
    html: `
      <section class="table-card">
        <h2>Requisition Dashboard (RT)</h2>
        ${renderUnitTable(['Unit', 'Total Requisitions', 'Planned', 'Completed', 'Progress %'], rows)}
        <article class="chart-card"><canvas id="requisitionRtChart"></canvas></article>
      </section>
    `,
    chart: () => renderBarChart('requisitionRtChart', units, plannedData, completedData, percentData)
  };
}

function sectionObservations() {
  const rows = getCollection('observations');
  const s = computeSummary(rows, { mode: 'observation' });

  return `
    <section class="table-card" id="observationDashboardLink" style="cursor:pointer;">
      <h2>Observation Dashboard</h2>
      ${renderSummaryCards([
    { label: 'Total Observations', value: s.total },
    { label: 'In Progress', value: s.inProgress },
    { label: 'Completed', value: s.completed }
  ])}
      <p class="hint">Click this section to open Observation Entry.</p>
    </section>
  `;
}

function renderDashboard() {
  if (document.body.dataset.page !== 'dashboard') return;

  // touch readDB to satisfy request for runtime visibility without schema change
  readDB();

  const root = document.getElementById('dashboardRoot');
  if (!root) return;

  const vessel = sectionInspection('Vessel Dashboard', 'Vessel', 'vesselAnalyticsChart', {
    includeOpportunity: true,
    enableInspectionScopeFilter: true,
    enableInspectionStatusFilter: true,
    inspectionScopeStateKey: 'vesselInspectionScopeFilter',
    inspectionScopeFilter: DASHBOARD_STATE.vesselInspectionScopeFilter,
    inspectionStatusStateKey: 'vesselInspectionStatusFilter',
    inspectionStatusFilter: DASHBOARD_STATE.vesselInspectionStatusFilter
  });
  const pipeline = sectionInspection('Pipeline Dashboard', 'Pipeline', 'pipelineAnalyticsChart');
  const steamTrap = sectionInspection('Steam Trap Dashboard', 'Steam Trap', 'steamTrapAnalyticsChart', {
    enableInspectionScopeFilter: true,
    inspectionScopeStateKey: 'steamTrapInspectionScopeFilter',
    inspectionScopeFilter: DASHBOARD_STATE.steamTrapInspectionScopeFilter
  });
  const requisition = sectionRequisitionRT();

  root.innerHTML = [
    vessel.html,
    pipeline.html,
    steamTrap.html,
    requisition.html,
    sectionObservations()
  ].join('');

  vessel.chart();
  pipeline.chart();
  steamTrap.chart();
  requisition.chart();

  const inspectionFilterButtons = root.querySelectorAll('.inspection-scope-filter-btn');
  inspectionFilterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const scopeKey = btn.dataset.inspectionScopeKey;
      if (!scopeKey || !(scopeKey in DASHBOARD_STATE)) return;
      DASHBOARD_STATE[scopeKey] = btn.dataset.inspectionScope || 'All';
      renderDashboard();
    });
  });

  const inspectionStatusFilterButtons = root.querySelectorAll('.inspection-status-filter-btn');
  inspectionStatusFilterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const statusKey = btn.dataset.inspectionStatusKey;
      if (!statusKey || !(statusKey in DASHBOARD_STATE)) return;
      DASHBOARD_STATE[statusKey] = btn.dataset.inspectionStatus || 'All';
      renderDashboard();
    });
  });

  const obsSection = document.getElementById('observationDashboardLink');
  if (obsSection) {
    obsSection.onclick = () => {
      const navTarget = document.querySelector('a[href="observation.html"]')?.getAttribute('href');
      window.location.href = navTarget || 'pages/observation.html';
    };
  }
}

function calculateProgress(inspections) {
  const summary = computeSummary(inspections, { mode: 'inspection' });
  return {
    total: summary.total,
    completed: summary.completed,
    inProgress: summary.inProgress,
    notStarted: Math.max(summary.total - summary.completed - summary.inProgress, 0),
    todaysProgress: summary.todayCompleted
  };
}

function renderCharts() {
  renderDashboard();
}

function getDashboardJsPdf() {
  if (typeof ensurePdfLib === 'function') return ensurePdfLib();
  return window.jspdf?.jsPDF || null;
}

function getDashboardHtml2Canvas() {
  return window.html2canvas || null;
}

function addPdfPageHeader(doc, title, pageWidth, generatedAt = '') {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, 12, 14);
  if (generatedAt) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const timeTextWidth = doc.getTextWidth(generatedAt);
    doc.text(generatedAt, pageWidth - timeTextWidth - 12, 14);
  }
  doc.setDrawColor(148, 163, 184);
  doc.line(10, 18, pageWidth - 10, 18);
}

function addPdfPageFooter(doc, pageWidth, pageHeight, dateLabel) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const footerText = `Date: ${dateLabel}`;
  const textWidth = doc.getTextWidth(footerText);
  doc.text(footerText, pageWidth - textWidth - 10, pageHeight - 8);
}


async function waitForDashboardVisualStability() {
  await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
  await new Promise((resolve) => window.setTimeout(resolve, 200));
}

function collectDashboardExportTargets(root) {
  const sections = Array.from(root.querySelectorAll('.table-card'));
  const targets = [];

  sections.forEach((section) => {
    const title = section.querySelector('h2')?.textContent?.trim() || 'Dashboard Section';
    const table = section.querySelector('.table-wrap, .vessel-progress-wrap');
    const chart = section.querySelector('.chart-card');
    const cards = section.querySelector('.cards-grid');

    if (table) {
      targets.push({ title: `${title} - Table`, element: table });
    }

    if (chart) {
      targets.push({ title: `${title} - Chart`, element: chart });
    } else if (cards) {
      targets.push({ title: `${title} - Summary`, element: cards });
    }
  });

  return targets;
}

async function addElementAsLandscapePage(doc, html2canvas, options) {
  const { element, title, reportTitle, dateLabel, generatedAt = "" } = options;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentY = 26;
  const contentHeight = pageHeight - contentY - 10;
  const contentWidth = pageWidth - (margin * 2);

  const exportToken = `pdf-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  element.setAttribute('data-pdf-export-token', exportToken);

  let canvas;
  try {
    canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
      logging: false,
      onclone: (clonedDoc) => {
        const clonedElement = clonedDoc.querySelector(`[data-pdf-export-token="${exportToken}"]`);
        if (!clonedElement) return;
        prepareDashboardExportClone(clonedElement, clonedDoc);
      }
    });
  } finally {
    element.removeAttribute('data-pdf-export-token');
  }

  const imageData = canvas.toDataURL('image/png', 0.95);
  const imageRatio = canvas.width / canvas.height;
  let drawWidth = contentWidth;
  let drawHeight = drawWidth / imageRatio;

  if (drawHeight > contentHeight) {
    drawHeight = contentHeight;
    drawWidth = drawHeight * imageRatio;
  }

  const x = (pageWidth - drawWidth) / 2;
  const y = contentY + ((contentHeight - drawHeight) / 2);

  doc.addPage('a4', 'landscape');
  addPdfPageHeader(doc, reportTitle, pageWidth, generatedAt);
  addPdfPageFooter(doc, pageWidth, pageHeight, dateLabel);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, margin, 23);
  doc.addImage(imageData, 'PNG', x, y, drawWidth, drawHeight, undefined, 'FAST');
}

function styleExportSummaryCards(container) {
  const cards = Array.from(container.querySelectorAll('.card'));
  cards.forEach((card) => {
    card.style.background = '#f8fafc';
    card.style.border = '1px solid #cbd5e1';
    card.style.borderRadius = '12px';
    card.style.boxShadow = 'none';
    card.style.color = '#0f172a';
  });

  const labels = Array.from(container.querySelectorAll('.card h3'));
  labels.forEach((label) => {
    label.style.color = '#1e293b';
  });

  const values = Array.from(container.querySelectorAll('.card p'));
  values.forEach((value) => {
    value.style.color = '#0f172a';
    value.style.fontSize = '1.8rem';
  });
}

function styleExportTables(container) {
  const tables = Array.from(container.querySelectorAll('table'));
  tables.forEach((table) => {
    table.style.background = '#ffffff';
    table.style.color = '#0f172a';
    table.style.borderCollapse = 'collapse';
  });

  const headers = Array.from(container.querySelectorAll('th'));
  headers.forEach((cell) => {
    cell.style.background = '#e2e8f0';
    cell.style.color = '#0f172a';
    cell.style.border = '1px solid #cbd5e1';
  });

  const dataCells = Array.from(container.querySelectorAll('td'));
  dataCells.forEach((cell) => {
    cell.style.background = '#ffffff';
    cell.style.color = '#0f172a';
    cell.style.border = '1px solid #cbd5e1';
  });

  const oddRows = Array.from(container.querySelectorAll('tbody tr:nth-child(odd) td'));
  oddRows.forEach((cell) => {
    cell.style.background = '#f8fafc';
  });

  const totalCells = Array.from(container.querySelectorAll('tfoot td'));
  totalCells.forEach((cell) => {
    cell.style.background = '#e2e8f0';
    cell.style.fontWeight = '700';
  });

  const wrappers = Array.from(container.querySelectorAll('.table-wrap, .vessel-progress-wrap'));
  wrappers.forEach((wrap) => {
    wrap.style.background = '#ffffff';
    wrap.style.border = '1px solid #cbd5e1';
    wrap.style.borderRadius = '8px';
    wrap.style.padding = '2px';
  });
}

function styleExportChartCard(container) {
  const charts = Array.from(container.querySelectorAll('.chart-card'));
  charts.forEach((chartCard) => {
    chartCard.style.background = '#ffffff';
    chartCard.style.border = '1px solid #cbd5e1';
    chartCard.style.borderRadius = '12px';
  });
}

function prepareDashboardExportClone(container, clonedDoc) {
  clonedDoc.documentElement.setAttribute('data-theme', 'light');

  container.style.background = '#ffffff';
  container.style.color = '#0f172a';
  container.style.boxShadow = 'none';

  styleExportSummaryCards(container);
  styleExportTables(container);
  styleExportChartCard(container);
}

function writeKeyValueList(doc, items, y) {
  doc.setFontSize(10);
  items.forEach((item) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${item.label}:`, 12, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(item.value), 70, y);
    y += 6;
  });
  return y;
}

function addTableRow(doc, columns, widths, y, isHeader = false) {
  let x = 12;
  doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
  columns.forEach((col, idx) => {
    doc.rect(x, y - 4.5, widths[idx], 7);
    const text = doc.splitTextToSize(String(col ?? '-'), widths[idx] - 2).slice(0, 2);
    doc.text(text, x + 1, y);
    x += widths[idx];
  });
}

function renderInspectionSummaryRows(rows = []) {
  const grouped = groupByUnit(rows);
  return Object.keys(grouped).sort((a, b) => a.localeCompare(b)).map((unit) => {
    const s = computeSummary(grouped[unit], { mode: 'inspection' });
    return [unit, s.planned, s.opportunity, s.inProgress, s.completed, s.todayCompleted];
  });
}

function paginateTable(doc, opts) {
  const {
    title,
    headers,
    rows,
    widths,
    startY,
    pageWidth,
    pageHeight,
    reportTitle,
    dateLabel
  } = opts;

  let y = startY;

  const addPage = () => {
    doc.addPage('a4', 'landscape');
    addPdfPageHeader(doc, reportTitle, pageWidth);
    addPdfPageFooter(doc, pageWidth, pageHeight, dateLabel);
    y = 24;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, 12, y);
  y += 8;

  addTableRow(doc, headers, widths, y, true);
  y += 8;

  rows.forEach((row) => {
    if (y > pageHeight - 18) {
      addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(title, 12, y);
      y += 8;
      addTableRow(doc, headers, widths, y, true);
      y += 8;
    }
    addTableRow(doc, row, widths, y);
    y += 8;
  });

  return y + 4;
}

function setupDashboardDateTime() {
  const el = document.getElementById('dashboardDateTime');
  if (!el) return;

  const render = () => {
    el.textContent = new Date().toLocaleString();
  };

  render();
  window.setInterval(render, 1000);
}

async function exportDashboardPdf() {
  const jsPDF = getDashboardJsPdf();
  const html2canvasLib = getDashboardHtml2Canvas();
  if (!jsPDF) {
    alert('PDF library not loaded. Please refresh and try again.');
    return;
  }
  if (!html2canvasLib) {
    alert('Export capture library not loaded. Please refresh and try again.');
    return;
  }

  const root = document.getElementById('dashboardRoot');
  if (!root) {
    alert('Dashboard is not ready for export.');
    return;
  }

  const exportBtn = document.getElementById('exportDashboardPdfBtn');
  if (exportBtn) {
    exportBtn.disabled = true;
    exportBtn.textContent = 'Preparing PDF...';
  }

  try {
    await waitForDashboardVisualStability();

    const targets = collectDashboardExportTargets(root);
    if (!targets.length) {
      alert('No dashboard content available to export.');
      return;
    }

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const now = new Date();
    const today = todayISO();
    const reportTitle = 'Inspection Department Daily Progress Report | ATR 2026';
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const dateLabel = now.toLocaleDateString();
    const generatedAt = `Generated: ${now.toLocaleString()}`;

    addPdfPageHeader(doc, reportTitle, pageWidth, generatedAt);
    addPdfPageFooter(doc, pageWidth, pageHeight, dateLabel);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Dashboard Visual Export', 12, 28);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Generated on: ${now.toLocaleString()}`, 12, 36);

    for (const target of targets) {
      await addElementAsLandscapePage(doc, html2canvasLib, {
        element: target.element,
        title: target.title,
        reportTitle,
        dateLabel,
        generatedAt
      });
    }

    doc.save(`ATR2026_Dashboard_Visual_Report_${today}.pdf`);
  } catch (err) {
    console.error('Dashboard export failed:', err);
    alert('Unable to export dashboard visuals. Please refresh and retry.');
  } finally {
    if (exportBtn) {
      exportBtn.disabled = false;
      exportBtn.textContent = 'Export Dashboard + Observations PDF';
    }
  }
}

function setupDashboardExportButton() {
  const exportBtn = document.getElementById('exportDashboardPdfBtn');
  if (!exportBtn) return;
  exportBtn.addEventListener('click', exportDashboardPdf);
}

window.addEventListener('atr-db-updated', renderDashboard);
window.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'dashboard') {
    renderDashboard();
    setupDashboardDateTime();
    setupDashboardExportButton();
  }
});
