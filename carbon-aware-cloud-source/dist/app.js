import { defaults, generateTasks, validateScenario, clone, LABELS, COLORS, ALGORITHMS, parseCSV, toCSV } from './engine.js';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (v, digits = 1) => v === null || v === undefined ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const money = v => `$${fmt(v, 4)}`;
const date = v => new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const symbols = {
 overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 centers: '<rect x="4" y="3" width="16" height="7" rx="2"/><rect x="4" y="14" width="16" height="7" rx="2"/><path d="M8 6.5h.01M8 17.5h.01M12 6.5h5M12 17.5h5"/>',
 workloads: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
 scheduler: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor" stroke="white"/><circle cx="15" cy="17" r="3" fill="currentColor" stroke="white"/>',
 experiments: '<path d="M8 3h8M9 3v6L4 18a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-9V3M7 15h10"/>',
 methodology: '<path d="M12 5C7 2 3 4 3 4v15s4-2 9 1c5-3 9-1 9-1V4s-4-2-9 1Zm0 0v15"/>',
 leaf: '<path d="M20 3C8 2 2 8 5 16c7 7 15 1 15-13ZM5 20l10-11"/>',
 bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z"/>',
 check: '<path d="m5 12 4 4L19 6"/><circle cx="12" cy="12" r="10"/>',
 play: '<path d="m8 5 11 7-11 7V5Z"/>',
 download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',
 upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
 plus: '<path d="M12 5v14M5 12h14"/>',
 globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
 clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
 refresh: '<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 13 3M5 14a7 7 0 0 0 13 3"/>',
 arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
 close: '<path d="m6 6 12 12M6 18 18 6"/>'
};
const icon = (name, size = 16, cls = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="${cls}">${symbols[name] ?? symbols.info}</svg>`;
const pages = { overview: ['Overview', 'Your cloud. A little greener.'], centers: ['Data centers', 'Build your cloud landscape.'], workloads: ['Workloads', 'Every task has a footprint.'], scheduler: ['Scheduler', 'Find your balance.'], experiments: ['Experiments', 'Make the comparison count.'], methodology: ['Methodology', 'Understand the numbers.'] };
const state = { page: 'overview', scenario: defaults(), experiment: null, history: [], busy: false, dirty: false, algorithm: 'carbon', chart: 'carbon', search: '', status: 'all', taskPage: 0, mapCenter: null, api: false, storage: true };
try {
  const saved = JSON.parse(localStorage.getItem('verdant-scenario') || 'null');
  if (saved && !validateScenario(saved).length) state.scenario = saved;
  const history = JSON.parse(localStorage.getItem('verdant-history') || '[]');
  state.history = Array.isArray(history) ? history.filter(x => x?.results?.carbon?.metrics && x?.scenario && !validateScenario(x.scenario).length).slice(0, 8) : [];
} catch { state.storage = false; }
if (!state.scenario.tasks.length) state.scenario.tasks = generateTasks(state.scenario.settings);
if (state.history.length) { state.experiment = state.history[0]; state.dirty = JSON.stringify(state.scenario) !== JSON.stringify(state.experiment.scenario); }

function persist() {
  try { localStorage.setItem('verdant-scenario', JSON.stringify(state.scenario)); localStorage.setItem('verdant-history', JSON.stringify(state.history)); }
  catch { if (state.storage) toast('Browser storage is unavailable or full. Export your experiment to keep a copy.', true); state.storage = false; }
}
let toastTimeout;
function toast(message, error = false) {
  const el = $('#toast'); el.textContent = message; el.className = `toast visible${error ? ' error' : ''}`;
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove('visible'), error ? 8000 : 4500);
}
function markDirty(message) { state.dirty = true; persist(); render(); if (message) toast(message); }
function button(label, action, kind = '', symbol = '', extra = '') { return `<button class="button ${kind}" data-action="${action}" ${extra}>${symbol ? icon(symbol, 14) : ''}${label}</button>`; }
function heading(page, subtitle, actions = '') { return `<div class="page-heading"><div><div class="eyebrow">Carbon-aware cloud scheduling</div><h1>${pages[page][1]}</h1><p class="subtitle">${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`; }
function runButton() { return button(state.busy ? 'Running experiment…' : 'Run experiment', 'run', 'primary', state.busy ? 'refresh' : 'play', state.busy ? 'disabled' : ''); }
function experimentStrip() {
  const config = state.experiment?.scenario ?? state.scenario;
  return `<div class="status-strip"><div><span class="pill"><span class="status-dot"></span>${state.dirty ? 'Configuration changed' : 'Sample / user-supplied data'}</span><span>${config.centers.filter(c => c.enabled).length} data centers</span><span>·</span><span>${config.tasks.length} workloads</span><span>·</span><span>${fmt(config.settings.duration / 60, 0)} min simulated</span>${state.dirty ? '<span class="pill amber">Run to update results</span>' : ''}</div><span>${state.experiment ? `Last run ${date(state.experiment.createdAt)}` : 'Ready for your first experiment'}</span></div>`;
}
function render() {
  $('#navigation').innerHTML = Object.entries(pages).map(([key, [label]]) => `<button class="nav-item ${state.page === key ? 'active' : ''}" data-action="navigate" data-page="${key}" ${state.page === key ? 'aria-current="page"' : ''}>${icon(key, 17)}${label}${key === 'centers' ? `<span class="nav-count">${state.scenario.centers.length}</span>` : ''}</button>`).join('');
  $('#breadcrumb-current').textContent = pages[state.page][0];
  $('#main').innerHTML = ({ overview, centers: centersPage, workloads: workloadsPage, scheduler: schedulerPage, experiments: experimentsPage, methodology: methodologyPage })[state.page]();
  if (['overview', 'workloads'].includes(state.page)) renderTaskTable();
  document.querySelectorAll('[data-action="run"]').forEach(el => el.disabled = state.busy);
}
function metric(title, value, unit, note, symbol, featured = false, noteClass = '') {
  return `<div class="metric-card ${featured ? 'featured' : ''}"><div class="metric-title">${title}${icon(symbol, 15)}</div><div class="metric-value">${value}<small>${unit}</small></div><div class="metric-note ${noteClass}">${note}</div></div>`;
}
function overview() {
  let html = heading('overview', 'Less carbon. Smarter placement. See the impact of every scheduling decision.', button('Export results', 'export', '', 'download', state.experiment ? '' : 'disabled') + runButton()) + experimentStrip();
  if (!state.experiment) return html + (state.busy ? `<div class="panel loading"><div class="spinner"></div>Preparing your scheduling comparison…</div>` : `<div class="panel empty-state"><h3>Your next experiment starts here.</h3><p>Configure your inputs and click Run experiment to compare all three strategies.</p></div>`);
  const m = state.experiment.results.carbon.metrics, baseline = state.experiment.results.roundRobin.metrics;
  const reduction = baseline.carbon ? (baseline.carbon - m.carbon) / baseline.carbon * 100 : null;
  const comparison = reduction === null ? 'Baseline emissions are zero' : `${reduction >= 0 ? '↘' : '↗'} ${fmt(Math.abs(reduction))}% ${reduction >= 0 ? 'less' : 'more'} than round-robin`;
  html += `<div class="metrics-grid">${metric('Carbon emissions', fmt(m.carbon), 'gCO₂e', comparison, 'leaf', true, reduction >= 0 ? 'positive' : 'negative')}${metric('Energy consumed', fmt(m.energy, 3), 'kWh', 'Includes idle power & facility overhead', 'bolt')}${metric('Renewable energy', fmt(m.renewableShare), '%', 'Energy-weighted renewable share', 'globe')}${metric('SLA compliance', fmt(m.sla), '%', `${m.completed} of ${m.total} tasks completed`, 'check')}</div>`;
  html += `<div class="two-column"><section class="panel"><div class="panel-header"><div><h2>Impact over time</h2><p class="panel-subtitle">Same workloads. Three scheduling strategies.</p></div><div class="segmented" aria-label="Chart metric">${[['carbon', 'Carbon'], ['energy', 'Energy'], ['completed', 'Tasks']].map(([key, text]) => `<button class="segment ${state.chart === key ? 'active' : ''}" data-action="chart" data-metric="${key}">${text}</button>`).join('')}</div></div>${chart()}<div class="chart-legend">${ALGORITHMS.map(key => `<span class="legend-item"><i style="background:${COLORS[key]}"></i>${LABELS[key]}</span>`).join('')}</div><div class="chart-footnote">${state.chart === 'completed' ? 'Cumulative completed tasks' : `Cumulative ${state.chart === 'carbon' ? 'operational emissions (gCO₂e)' : 'energy consumption (kWh)'}`} · simulated time</div></section>${regionMap()}</div>`;
  html += `<div class="two-column"><section class="panel"><div class="panel-header"><div><h2>A fairer comparison</h2><p class="panel-subtitle">Identical infrastructure, workload, and time horizon.</p></div><span class="pill green">3 strategies</span></div>${comparisonTable()}<div class="comparison-note">Lower emissions are useful alongside throughput and SLA compliance. Check all three before choosing a strategy.</div></section><section class="panel"><div class="panel-header"><div><h2>Where the work happens</h2><p class="panel-subtitle">Carbon-aware placement · average CPU usage</p></div>${icon('centers', 16)}</div>${utilization()}<div class="panel-footer"><span>Time-weighted over the full experiment</span><button class="text-link" data-action="navigate" data-page="centers">Configure ${icon('arrow', 12)}</button></div></section></div>`;
  html += `<div class="section-heading"><h2>A closer look</h2><p>Carbon-aware strategy</p></div><div class="metric-details">${detailMetrics(m)}</div><div class="section-heading"><h2>Workload activity</h2><button class="text-link" data-action="navigate" data-page="workloads">View all workloads ${icon('arrow', 12)}</button></div><section class="panel results-section"><div id="task-table"></div></section>`;
  return html;
}
function detailMetrics(m) {
  return [ ['Electricity cost', money(m.cost), 'USD · modeled electricity only'], ['Avg. response time', m.response === null ? '—' : `${fmt(m.response)} s`, `P95: ${m.p95 === null ? '—' : `${fmt(m.p95)} s`}`], ['Throughput', `${fmt(m.throughput * 60)} /min`, 'Completed tasks per simulated minute'], ['Renewable-rich tasks', `${fmt(m.renewableTasks)}%`, `Completed tasks ≥ ${state.experiment.scenario.settings.renewableThreshold}% renewable`], ['CPU utilization', `${fmt(m.cpu)}%`, 'Time-weighted, all enabled hosts'], ['RAM utilization', `${fmt(m.ram)}%`, 'Time-weighted reserved memory'], ['Task completion', `${m.completed} / ${m.total}`, `${m.running} running · ${m.queued} queued`], ['Rejected tasks', `${m.rejected}`, 'Resource, latency, or deadline constraints'] ].map(([label, value, note]) => `<div class="detail-metric"><small>${label}</small><strong>${value}</strong><span>${note}</span></div>`).join('');
}
function chart() {
  const series = ALGORITHMS.map(key => { let total = 0; return { key, points: [0, ...state.experiment.results[key].timeline.map(bin => total += bin[state.chart])] }; });
  const maximum = Math.max(1e-8, ...series.flatMap(s => s.points)) * 1.15;
  const W = 560, H = 200, left = 43, right = 15, top = 17, bottom = 31;
  const x = i => left + i / 24 * (W - left - right), y = value => H - bottom - value / maximum * (H - top - bottom);
  const digits = state.chart === 'energy' ? 3 : state.chart === 'completed' ? 0 : 1;
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative ${state.chart} comparison"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#39885a" stop-opacity=".12"/><stop offset="100%" stop-color="#39885a" stop-opacity="0"/></linearGradient></defs>${[0, 1, 2, 3].map(i => { const value = maximum * i / 3; return `<line x1="${left}" x2="${W - right}" y1="${y(value)}" y2="${y(value)}" class="chart-grid"/><text x="${left - 10}" y="${y(value) + 3}" text-anchor="end">${fmt(value, digits)}</text>`; }).join('')}${[0, 6, 12, 18, 24].map(i => `<text x="${x(i)}" y="${H - 9}" text-anchor="middle">${fmt(i / 24 * state.experiment.scenario.settings.duration / 60, 0)} min</text>`).join('')}${series.map(({ key, points }) => { const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' '); return `${key === 'carbon' ? `<path d="${path} L${x(24)},${y(0)} L${x(0)},${y(0)} Z" fill="url(#chart-fill)"/>` : ''}<path d="${path}" fill="none" stroke="${COLORS[key]}" stroke-width="${key === 'carbon' ? 2.5 : 1.6}" ${key === 'roundRobin' ? 'stroke-dasharray="4 4"' : ''}/>${points.filter((_, i) => i % 4 === 0).map((value, j) => `<circle cx="${x(j * 4)}" cy="${y(value)}" r="3.5" fill="${COLORS[key]}" opacity=".8"><title>${LABELS[key]} · ${fmt(j * 4 / 24 * state.experiment.scenario.settings.duration / 60)} min: ${fmt(value, digits)}</title></circle>`).join('')}`; }).join('')}</svg></div>`;
}
function regionMap() {
  const config = state.experiment.scenario.centers.filter(c => c.enabled), stats = state.experiment.results.carbon.centers;
  const selected = config.find(c => c.id === state.mapCenter);
  const coordinates = (c, i) => { const known = defaults().centers.find(d => d.region === c.region); return known ? [known.x * 5, known.y * 1.7] : [55 + (i % 6) * 76, 80 + Math.floor(i / 6) * 35]; };
  return `<section class="panel"><div class="panel-header"><div><h2>A distributed cloud</h2><p class="panel-subtitle">${config.length} regions. One smaller footprint.</p></div><span class="pill"><span class="status-dot"></span>Modeled</span></div><svg class="map" viewBox="0 0 500 170" role="img" aria-label="Illustrative data center regions"><path class="map-grid" d="M25 55h450M25 95h450M25 135h450M100 20v130M200 20v130M300 20v130M400 20v130"/><g class="map-continent"><path d="m38 47 20-17 38-8 22 9 32-3 18 17-13 16-23 4-2 18-17 13-13-7-13-23-26 0Z"/><path d="m111 93 22 7 19 24-8 25-17 12-8-26-14-17Z"/><path d="m174 23 24-13 22 8-9 20-20 7Z"/><path d="m226 42 14-13 16 5 4-15 15-5 6 22 18 2 14 18-12 9-22-7-20 9-21-9Z"/><path d="m238 69 32-8 21 17 2 19-16 36-17 9-14-24-2-22-15-16Z"/><path d="m284 38 25-15 36 7 21-4 18 13 41 3 18 17-12 22-28-3-13 17-21-3-3 23-14-6-14-24-15-5-13-19-20 5Z"/><path d="m377 131 27-15 28 13 2 19-37 5-19-9Z"/><path d="m420 92 10 6-7 15-9-8ZM447 130l5 17-8 6-2-13Z"/></g>${config.map((c, i) => { const [x, y] = coordinates(c, i); return `<g class="map-point ${state.mapCenter === c.id ? 'active' : ''}" data-action="map" data-id="${esc(c.id)}" tabindex="0" role="button" aria-label="Show ${esc(c.name)}"><circle class="halo" cx="${x}" cy="${y}" r="12"/><circle class="point" cx="${x}" cy="${y}" r="4"/><title>${esc(c.name)} · ${c.carbon} gCO₂e/kWh</title></g>`; }).join('')}</svg><div class="region-list">${config.map(c => { const stat = stats.find(d => d.id === c.id); return `<div class="region-row"><span class="region-dot"></span><strong>${esc(c.name)}</strong><small>${stat.assigned} tasks</small><span class="region-carbon">${fmt(stat.carbon)} gCO₂e</span></div>`; }).join('')}</div>${selected ? `<div class="map-detail"><strong>${esc(selected.name)}</strong> · Base intensity ${selected.carbon} gCO₂e/kWh · ${selected.renewable}% renewable · ${selected.latency} ms latency. Custom regions use illustrative marker positions.</div>` : ''}<div class="panel-footer"><span>Illustrative map · click a region for details</span><button class="text-link" data-action="navigate" data-page="centers">Manage regions ${icon('arrow', 12)}</button></div></section>`;
}
function comparisonTable() {
  return `<div class="table-wrap comparison-table"><table><thead><tr><th>Strategy</th><th>Carbon</th><th>Cost</th><th>Avg. response</th><th>Completed</th><th>SLA</th></tr></thead><tbody>${ALGORITHMS.map(key => { const m = state.experiment.results[key].metrics; return `<tr class="${key === 'carbon' ? 'highlight-row' : ''}"><td><span class="algorithm-label"><i class="algorithm-dot" style="background:${COLORS[key]}"></i><strong>${LABELS[key]}</strong></span></td><td>${fmt(m.carbon)} g</td><td>${money(m.cost)}</td><td>${m.response === null ? '—' : `${fmt(m.response)} s`}</td><td>${m.completed}/${m.total}</td><td>${fmt(m.sla)}%</td></tr>`; }).join('')}</tbody></table></div>`;
}
function utilization() {
  return `<div style="padding:25px 22px 20px;display:grid;gap:22px">${state.experiment.results.carbon.centers.map(c => `<div><div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:9px"><span>${esc(c.name)} <span class="muted">· ${c.assigned} tasks</span></span><strong style="font-weight:500">${fmt(c.cpuUtilization)}%</strong></div><div style="height:6px;border-radius:4px;background:#f0f3eb;overflow:hidden"><div style="height:100%;width:${Math.min(100, c.cpuUtilization)}%;background:#83a87a;border-radius:4px"></div></div></div>`).join('')}</div>`;
}
function centersPage() {
  return heading('centers', 'Define the infrastructure and energy conditions your scheduler can choose from.', button('CSV template', 'template-centers', '', 'download') + button('Import CSV', 'import-centers', '', 'upload') + button('Add data center', 'add-center', 'primary', 'plus')) + `<div class="info-banner">${icon('info')}<div>These are simulation inputs, not connected AWS resources. Prices use <strong>USD/kWh</strong>. Carbon intensity is supplied independently of renewable share.</div></div><div class="center-grid">${state.scenario.centers.map(c => `<article class="center-card ${!c.enabled ? 'disabled' : ''}"><div class="center-card-top"><div class="center-name"><span class="region-icon">${icon('centers', 19)}</span><div><h2>${esc(c.name)}</h2><p>${esc(c.country)} · ${esc(c.region)}</p></div></div><span class="pill ${c.renewable >= state.scenario.settings.renewableThreshold ? 'green' : ''}">${c.renewable >= state.scenario.settings.renewableThreshold ? 'Renewable-rich' : 'Standard mix'}</span></div><div class="center-stats">${[['Carbon intensity', fmt(c.carbon, 0), 'gCO₂e/kWh'], ['Renewable share', fmt(c.renewable, 0), '%'], ['Electricity price', `$${fmt(c.price, 3)}`, '/kWh'], ['CPU capacity', c.hosts * c.cores, 'cores'], ['Memory', c.hosts * c.ram, 'GB'], ['Network latency', c.latency, 'ms']].map(([label, value, unit]) => `<div class="center-stat"><small>${label}</small><strong>${value} <span>${unit}</span></strong></div>`).join('')}</div><div class="center-card-bottom"><label class="switch"><input type="checkbox" data-center-toggle="${esc(c.id)}" ${c.enabled ? 'checked' : ''}>${c.enabled ? 'Included' : 'Excluded'}</label>${button('Edit', 'edit-center', 'small', '', `data-id="${esc(c.id)}"`)}${button('Remove', 'remove-center', 'small', '', `data-id="${esc(c.id)}"`)}</div></article>`).join('')}</div><div class="section-heading"><h2>Time-varying energy profiles</h2><span class="badge-count">${state.scenario.profiles.length} observations</span></div><section class="panel form-panel"><h2>Let the energy mix change over time.</h2><p>Optionally upload carbon intensity, renewable share, and electricity price by data center and simulated second. Values remain in effect until the next observation. Before the first observation, the data center’s base values apply.</p><div style="display:flex;gap:10px;flex-wrap:wrap">${button('Download template', 'template-profiles', '', 'download')}${button('Import energy profile', 'import-profiles', '', 'upload')}${state.scenario.profiles.length ? button('Clear profiles', 'clear-profiles', '') : ''}</div></section>`;
}
function workloadsPage() {
  return heading('workloads', 'Create a reproducible workload or bring your own task dataset.', button('CSV template', 'template-tasks', '', 'download') + button('Import CSV', 'import-tasks', '', 'upload') + runButton()) + `<div class="configuration-layout"><section class="panel form-panel"><h2>Workload generator</h2><p>Generate repeatable batch workloads using a seed. Processing length is total work across all requested cores; deadlines are relative to arrival.</p><form id="generator-form"><div class="form-grid">${field('Number of tasks', 'count', state.scenario.settings.count, 'number', 'min="1" max="1000" step="1"', '1–1,000 tasks')}${field('Random seed', 'seed', state.scenario.settings.seed, 'number', 'min="0" max="2147483647" step="1"', 'Same seed + settings = same dataset')}${field('Simulation horizon (seconds)', 'duration', state.scenario.settings.duration, 'number', 'min="10" max="86400"', 'Also determines the arrival window')}</div><p class="input-note">Generated tasks: 1–4 CPU cores, 2 GB RAM per core, 120,000–480,000 MI, arrivals in the first 70% of the horizon. Tight-latency tasks are included.</p><div class="form-actions">${button('Generate workloads', 'generate', 'primary', 'refresh')}</div></form></section><section class="panel form-panel"><h2>Your current dataset</h2><ul class="method-list"><li><strong>${state.scenario.tasks.length} workloads</strong>${state.scenario.tasks.length ? `${fmt(Math.min(...state.scenario.tasks.map(t => t.arrival)), 0)}–${fmt(Math.max(...state.scenario.tasks.map(t => t.arrival)), 0)} seconds arrival window` : 'No tasks loaded'}</li><li><strong>CPU, RAM & deadlines</strong>Every task carries resource requirements, a latency limit, and a relative deadline.</li><li><strong>Imported task support</strong>Use the CSV template to set individual task sizes, arrival times, origin labels, and QoS requirements.</li></ul><div style="margin-top:18px">${button('Export input workloads', 'export-input-tasks', '', 'download')}</div></section></div><div class="section-heading"><h2>Workloads & scheduling results</h2><span class="badge-count">${state.scenario.tasks.length} inputs</span></div>${state.dirty ? '<div class="info-banner">Inputs have changed. The table shows your current inputs until you run an updated experiment.</div>' : ''}<section class="panel"><div id="task-table"></div></section>`;
}
function field(label, name, value, type = 'text', extra = '', hint = '') { return `<div class="field"><label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${type}" value="${esc(value)}" required ${extra}>${hint ? `<small>${hint}</small>` : ''}</div>`; }
function schedulerPage() {
  const s = state.scenario.settings;
  return heading('scheduler', 'Keep constraints firm. Choose which trade-offs matter most.', runButton()) + `<div class="configuration-layout"><section class="panel form-panel"><h2>Carbon-aware scoring</h2><p>We first filter placements by resources, network latency, and deadline feasibility. Your weights rank the remaining candidates.</p><form id="scheduler-form">${field('Experiment name', 'experimentName', state.scenario.name, 'text', 'maxlength="150"')}${[['carbonWeight', 'Carbon emissions', 'leaf'], ['costWeight', 'Electricity cost', 'bolt'], ['responseWeight', 'Response time', 'clock']].map(([key, label, symbol]) => `<div class="range-field"><div><label for="${key}" style="display:flex;align-items:center;gap:9px">${icon(symbol, 16)}${label}</label><strong id="value-${key}">${s[key]}</strong></div><input id="${key}" name="${key}" type="range" min="0" max="100" step="1" value="${s[key]}"></div>`).join('')}<div id="weight-bar" class="weight-bar"></div><p class="input-note">Weights are relative and normalized by their sum. Candidate metrics use min–max normalization within each scheduling decision.</p><div class="form-grid" style="margin-top:25px">${field('Renewable-rich threshold (%)', 'renewableThreshold', s.renewableThreshold, 'number', 'min="0" max="100"')}<div class="field"><label for="policy">If no placement meets the deadline</label><select name="policy" id="policy"><option value="queue" ${s.policy === 'queue' ? 'selected' : ''}>Queue with a possible SLA miss</option><option value="reject" ${s.policy === 'reject' ? 'selected' : ''}>Reject the task</option></select></div>${field('Simulation horizon (seconds)', 'duration', s.duration, 'number', 'min="10" max="86400"')}</div><div class="form-actions"><button class="button primary" type="submit">Save scheduler settings</button></div><div class="form-error" id="scheduler-error" role="alert"></div></form></section><section class="panel form-panel"><h2>Three strategies. One experiment.</h2><ul class="method-list"><li><strong>01 &nbsp; Carbon-aware</strong>Minimizes your weighted combination of predicted task emissions, electricity cost, and response time.</li><li><strong>02 &nbsp; Round-robin</strong>Cycles through feasible data centers, selecting the earliest available host within each location.</li><li><strong>03 &nbsp; Performance-first</strong>Selects the feasible host with the earliest estimated response time.</li><li><strong>Shared constraints</strong>All three use the same CPU, RAM, latency, deadline policy, energy model, and observation horizon.</li></ul></section></div>`;
}
function experimentsPage() {
  return heading('experiments', 'Keep a record of the assumptions behind every result.', button('Import experiment', 'import-experiment', '', 'upload') + runButton()) + `<div class="info-banner">${icon('info')}<div>The latest eight experiments are kept in this browser. Export JSON to preserve an experiment, its input configuration, and all three strategies. ${state.api ? 'Local API is connected.' : 'Browser simulation runs locally; no cloud account is required.'}</div></div><section class="panel">${state.history.length ? state.history.map(exp => { const m = exp.results.carbon.metrics; return `<article class="history-card"><span class="history-icon">${icon('experiments', 20)}</span><div><h3>${esc(exp.name)}</h3><p>${date(exp.createdAt)} · ${exp.scenario.tasks.length} tasks · seed ${exp.scenario.settings.seed}</p><p class="replay-status">${esc(exp.engine)}${exp.cloudsimError ? ' · Replay unavailable (details in JSON)' : ''}${exp.cloudsim ? ` · CloudSim replay: ${exp.cloudsim.completed} completed / ${exp.cloudsim.submitted} submitted` : ''}</p></div><div class="history-meta">${fmt(m.carbon)} gCO₂e<small>${fmt(m.sla)}% SLA compliance</small></div><div class="history-actions">${button('View', 'view-experiment', 'small', '', `data-id="${esc(exp.id)}"`)}${button('Restore inputs', 'restore-experiment', 'small', '', `data-id="${esc(exp.id)}"`)}${button('Export', 'export-experiment', 'small', 'download', `data-id="${esc(exp.id)}"`)}</div></article>`; }).join('') : '<div class="empty-state"><h3>Your first experiment starts here.</h3><p>Configure your data centers and workloads, then run a comparison.</p></div>'}</section><div style="margin-top:20px;display:flex;gap:10px">${button('Clear experiment history', 'clear-history', 'danger')}${button('Restore sample scenario', 'reset', '')}</div>`;
}
function methodologyPage() {
  return heading('methodology', 'Transparent assumptions make better research.', button('Export scenario', 'export-scenario', '', 'download')) + `<div class="info-banner">${icon('info')}<div>This is a simulation research tool. Sample regional values are illustrative, not current grid measurements or AWS specifications. Outcomes depend on your inputs; carbon reductions are not guaranteed.</div></div><div class="methodology-grid"><section class="panel"><h2>The execution model</h2><p>Each task reserves CPU cores and RAM on a single host. It runs without preemption or migration. The scheduler finds the earliest interval with sufficient resources, then considers response time and your configured deadline policy.</p><div class="formula">execution seconds = total MI / (MIPS per core × cores)<br>response seconds = wait + execution + latency_ms / 1000</div><p>Latency is one configured round-trip estimate per data center. Origin is a descriptive label; geographic latency is not inferred from it. Deadline is measured from task arrival. Network transfer, disk I/O, failures, boot delays, and embodied emissions are excluded.</p></section><section class="panel"><h2>Energy, carbon & cost</h2><p>Enabled hosts stay powered on throughout the observation window. CPU utilization determines dynamic power. PUE accounts for modeled facility overhead.</p><div class="formula">power W = idle W + (max W − idle W) × CPU usage<br>energy kWh = power W × seconds × PUE / 3,600,000<br>carbon gCO₂e = energy kWh × intensity gCO₂e/kWh<br>cost USD = energy kWh × price USD/kWh</div><p>Calculations integrate at workload and profile boundaries. Carbon intensity already describes the electricity mix; renewable share is not applied as a second emissions discount.</p></section><section class="panel"><h2>Task estimates vs. facility totals</h2><p>Candidate task estimates allocate a core-proportional share of full host power. Task result energy uses that same allocation during execution inside the observation horizon.</p><p>Dashboard totals additionally include idle electricity for unreserved cores and hosts. Therefore, task estimates do not sum to facility totals. Queued tasks consume no task execution energy; powered-on hosts still consume idle energy.</p><h2 style="margin-top:22px">Renewable accounting</h2><p>Renewable energy utilization is estimated renewable kWh divided by total kWh. Renewable-rich task percentage counts completed tasks whose energy-weighted renewable share meets your configured threshold. It does not prove that any individual task ran exclusively on renewable electricity.</p></section><section class="panel"><h2>A fair comparison</h2><p>All strategies receive identical inputs and simulated time. Every submitted task contributes to the SLA denominator. Only tasks completed within both deadline and latency requirements count as compliant.</p><p>Response-time averages and P95 cover completed tasks only. Throughput is completed tasks divided by the full observation horizon. Tasks still executing or waiting at the horizon remain running or queued.</p><h2 style="margin-top:22px">Execution engines</h2><p>The hosted dashboard uses a deterministic browser reference model. The local Node API uses the same model and, after building the Java component, replays the carbon-aware execution plan in CloudSim Plus 8.5.1. Replay results are separate validation data; they do not replace reference-model metrics.</p><p>Prometheus, Grafana, Docker Compose, an EC2 deployment guide, and a JMeter plan are included in the source project. No AWS resources are provisioned by this dashboard.</p></section></div>`;
}
function renderTaskTable() {
  const root = $('#task-table'); if (!root) return;
  const useInputs = state.page === 'workloads' && state.dirty || !state.experiment;
  const all = useInputs ? state.scenario.tasks : state.experiment.results[state.algorithm].tasks;
  const search = state.search.toLowerCase();
  const rows = all.filter(t => `${t.id} ${t.centerName ?? ''} ${t.origin}`.toLowerCase().includes(search) && (state.status === 'all' || t.status === state.status));
  const pageSize = state.page === 'overview' ? 5 : 12;
  const maxPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1); state.taskPage = Math.min(state.taskPage, maxPage);
  const slice = rows.slice(state.taskPage * pageSize, (state.taskPage + 1) * pageSize);
  root.innerHTML = `<div class="table-toolbar"><input class="search-input" type="search" id="task-search" placeholder="Search tasks or regions…" aria-label="Search workloads" value="${esc(state.search)}">${!useInputs ? `<select class="filter" id="algorithm-filter" aria-label="Result strategy">${ALGORITHMS.map(key => `<option value="${key}" ${state.algorithm === key ? 'selected' : ''}>${LABELS[key]}</option>`).join('')}</select><select class="filter" id="status-filter" aria-label="Task status">${['all', 'completed', 'running', 'queued', 'rejected'].map(v => `<option value="${v}" ${state.status === v ? 'selected' : ''}>${v === 'all' ? 'All statuses' : v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select>` : '<span class="pill">Input dataset</span>'}<span class="right badge-count">${rows.length} tasks</span></div><div class="table-wrap"><table><thead><tr><th>Task ID</th>${useInputs ? '<th>Arrival</th><th>Total work</th><th>CPU / RAM</th><th>Deadline</th><th>Max. latency</th>' : '<th>Data center</th><th>Response</th><th>Carbon estimate</th><th>Status</th><th>SLA</th>'}<th></th></tr></thead><tbody>${slice.length ? slice.map(t => `<tr><td><span class="task-id">${esc(t.id)}</span></td>${useInputs ? `<td>${fmt(t.arrival, 0)} s</td><td>${fmt(t.length, 0)} MI</td><td>${t.cores} cores / ${t.ram} GB</td><td>${t.deadline} s</td><td>${t.maxLatency} ms</td>` : `<td>${esc(t.centerName ?? 'Unassigned')}</td><td>${t.status === 'completed' ? `${fmt(t.response)} s` : '—'}</td><td>${fmt(t.carbon, 3)} g</td><td><span class="pill ${t.status === 'completed' ? 'green' : t.status === 'rejected' ? 'red' : 'amber'}">${t.status}</span></td><td>${t.sla ? '✓ Met' : t.status === 'completed' ? 'Missed' : '—'}</td>`}<td><button class="text-link" data-action="task-detail" data-id="${esc(t.id)}" data-input="${useInputs ? 'true' : 'false'}" aria-label="Details for ${esc(t.id)}">Details ↗</button></td></tr>`).join('') : `<tr><td colspan="7"><div class="empty-state">No workloads match these filters.</div></td></tr>`}</tbody></table></div><div class="pagination"><span>${rows.length ? state.taskPage * pageSize + 1 : 0}–${Math.min(rows.length, (state.taskPage + 1) * pageSize)} of ${rows.length} workloads</span><div>${button('Previous', 'previous-tasks', 'small', '', state.taskPage === 0 ? 'disabled' : '')}${button('Next', 'next-tasks', 'small', '', state.taskPage >= maxPage ? 'disabled' : '')}</div></div>`;
}
async function run() {
  if (state.busy) return;
  const errors = validateScenario(state.scenario); if (errors.length) return toast(errors.slice(0, 3).join(' '), true);
  state.busy = true; render();
  try {
    const input = clone(state.scenario); let result;
    if (state.api) {
      const response = await fetch('/api/experiments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(90000) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Local API request failed.'); result = body;
    } else result = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('Simulation timed out. Try a smaller workload.')); }, 90000);
      worker.onmessage = ({ data }) => { clearTimeout(timer); worker.terminate(); data.error ? reject(new Error(data.error)) : resolve(data.result); };
      worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message || 'Could not start simulation worker.')); };
      worker.postMessage(input);
    });
    state.experiment = result; state.history = [result, ...state.history].slice(0, 8); state.dirty = JSON.stringify(state.scenario) !== JSON.stringify(input); state.taskPage = 0; state.status = 'all'; persist(); if (result.cloudsimError) toast('Reference comparison complete. CloudSim replay failed; see the experiment JSON for details.', true); else toast('Experiment complete. All three strategies are ready to compare.');
  } catch (error) { toast(error.message, true); }
  finally { state.busy = false; render(); }
}
function showDialog(title, body, footer = '') {
  const dialog = $('#dialog');
  dialog.innerHTML = `<div class="dialog-header"><h2 id="dialog-title">${esc(title)}</h2><button class="icon-button" data-action="close-dialog" aria-label="Close dialog">${icon('close', 14)}</button></div>${body}${footer ? `<div class="dialog-footer">${footer}</div>` : ''}`;
  dialog.showModal();
}
function centerDialog(id) {
  const existing = state.scenario.centers.find(c => c.id === id);
  const c = existing ?? { id: '', name: '', region: '', country: '', hosts: 2, cores: 8, ram: 32, mips: 1000, idleWatts: 40, maxWatts: 240, pue: 1.2, carbon: 300, renewable: 50, price: .12, latency: 100, enabled: true };
  showDialog(existing ? `Edit ${c.name}` : 'Add a data center', `<form id="center-form" data-id="${esc(id ?? '')}"><div class="dialog-body"><p>Set the capacity and energy assumptions for this simulated location.</p><div class="form-grid">${field('Name', 'name', c.name, 'text', 'maxlength="100"')}${field('Region label', 'region', c.region, 'text', 'maxlength="100"', 'For example: ap-south-1')}${field('Country', 'country', c.country, 'text', 'maxlength="100"')}${field('Hosts', 'hosts', c.hosts, 'number', 'min="1" max="16" step="1"')}${field('CPU cores per host', 'cores', c.cores, 'number', 'min="1" max="64" step="1"')}${field('RAM per host (GB)', 'ram', c.ram, 'number', 'min="1" max="1024" step="any"')}${field('MIPS per core', 'mips', c.mips, 'number', 'min="1" max="100000" step="any"')}${field('Network latency (ms)', 'latency', c.latency, 'number', 'min="0" max="2000" step="any"')}${field('Idle power per host (W)', 'idleWatts', c.idleWatts, 'number', 'min="0" max="5000" step="any"')}${field('Maximum power per host (W)', 'maxWatts', c.maxWatts, 'number', 'min="1" max="10000" step="any"')}${field('Carbon intensity (gCO₂e/kWh)', 'carbon', c.carbon, 'number', 'min="0" max="2000" step="any"')}${field('Renewable energy share (%)', 'renewable', c.renewable, 'number', 'min="0" max="100" step="any"')}${field('Electricity price (USD/kWh)', 'price', c.price, 'number', 'min="0" max="10" step="any"')}${field('PUE', 'pue', c.pue, 'number', 'min="1" max="3" step="any"', 'Facility energy / IT equipment energy')}</div><div class="form-error" id="center-error" role="alert"></div></div><div class="dialog-footer">${button('Cancel', 'close-dialog')}<button class="button primary" type="submit">Save data center</button></div></form>`);
}
function download(name, content, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function downloadExperiment(exp) { download(`verdant-${exp.id}.json`, JSON.stringify(exp, null, 2), 'application/json'); }
function requestImport(kind) { const input = $('#file-input'); input.dataset.kind = kind; input.accept = kind === 'experiment' ? '.json' : '.csv'; input.value = ''; input.click(); }
function exportDialog() {
  if (!state.experiment) return;
  showDialog('Export your experiment', `<div class="dialog-body"><p>Keep the results and the inputs behind them. Each format uses the currently viewed experiment.</p><div style="display:grid;gap:12px">${button('Full experiment · JSON', 'export-full', '', 'download')}${button('Strategy comparison · CSV', 'export-summary', '', 'download')}${button('Task results · all strategies · CSV', 'export-results', '', 'download')}</div></div>`, button('Done', 'close-dialog'));
}
function confirmAction(title, description, action) { showDialog(title, `<div class="dialog-body"><p>${description}</p></div>`, button('Cancel', 'close-dialog') + button('Confirm', action, 'danger')); }
document.addEventListener('click', event => {
  const el = event.target.closest('[data-action]'); if (!el || el.disabled) return;
  const action = el.dataset.action;
  if (action === 'navigate') { state.page = el.dataset.page; state.taskPage = 0; $('#sidebar').classList.remove('open'); location.hash = state.page; render(); $('#main').focus({ preventScroll: true }); window.scrollTo({ top: 0 }); if (state.page === 'scheduler') updateWeights(); }
  else if (action === 'menu') $('#sidebar').classList.toggle('open');
  else if (action === 'run') run();
  else if (action === 'close-dialog') $('#dialog').close();
  else if (action === 'chart') { state.chart = el.dataset.metric; render(); }
  else if (action === 'map') { state.mapCenter = state.mapCenter === el.dataset.id ? null : el.dataset.id; render(); }
  else if (action === 'add-center') { if (state.scenario.centers.length >= 12) toast('A scenario supports up to 12 data centers.', true); else centerDialog(); }
  else if (action === 'edit-center') centerDialog(el.dataset.id);
  else if (action === 'remove-center') {
    const c = state.scenario.centers.find(c => c.id === el.dataset.id);
    if (c.enabled && state.scenario.centers.filter(d => d.enabled).length === 1) return toast('Keep at least one data center enabled.', true);
    confirmAction('Remove data center?', `Remove ${esc(c.name)} and its energy profile from the current scenario? Saved experiments will remain available.`, `confirm-remove-${c.id}`);
  }
  else if (action.startsWith('confirm-remove-')) { const id = action.slice(15); state.scenario.centers = state.scenario.centers.filter(c => c.id !== id); state.scenario.profiles = state.scenario.profiles.filter(p => p.centerId !== id); $('#dialog').close(); markDirty('Data center removed.'); }
  else if (action === 'template-centers') download('data-centers-template.csv', toCSV(defaults().centers, ['id', 'name', 'region', 'country', 'hosts', 'cores', 'ram', 'mips', 'idleWatts', 'maxWatts', 'pue', 'carbon', 'renewable', 'price', 'latency', 'enabled']));
  else if (action === 'template-tasks') download('workloads-template.csv', toCSV(generateTasks({ ...defaults().settings, count: 5 }), ['id', 'arrival', 'length', 'cores', 'ram', 'deadline', 'maxLatency', 'origin']));
  else if (action === 'template-profiles') download('energy-profiles-template.csv', toCSV(state.scenario.centers.slice(0, 2).flatMap(c => [{ centerId: c.id, time: 0, carbon: c.carbon, renewable: c.renewable, price: c.price }, { centerId: c.id, time: 300, carbon: Math.round(c.carbon * .8), renewable: Math.min(100, c.renewable + 10), price: c.price }])));
  else if (action === 'import-centers') requestImport('centers');
  else if (action === 'import-tasks') requestImport('tasks');
  else if (action === 'import-profiles') requestImport('profiles');
  else if (action === 'import-experiment') requestImport('experiment');
  else if (action === 'clear-profiles') { state.scenario.profiles = []; markDirty('Energy profiles cleared.'); }
  else if (action === 'export-input-tasks') download('workload-inputs.csv', toCSV(state.scenario.tasks));
  else if (action === 'generate') {
    const form = $('#generator-form'); if (!form.reportValidity()) return;
    const values = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, Number(v)]));
    const next = clone(state.scenario); Object.assign(next.settings, values); next.tasks = generateTasks(next.settings);
    const errors = validateScenario(next); if (errors.length) return toast(errors[0], true);
    state.scenario = next; state.taskPage = 0; state.search = ''; state.status = 'all'; markDirty(`${next.tasks.length} reproducible workloads generated. Run to update results.`);
  }
  else if (action === 'previous-tasks' || action === 'next-tasks') { state.taskPage += action === 'next-tasks' ? 1 : -1; renderTaskTable(); }
  else if (action === 'task-detail') {
    const task = (el.dataset.input === 'true' ? state.scenario.tasks : state.experiment.results[state.algorithm].tasks).find(t => t.id === el.dataset.id);
    const pairs = [['Origin label', task.origin], ['Arrival', `${fmt(task.arrival)} s`], ['Processing requirement', `${fmt(task.length, 0)} total MI`], ['Resources', `${task.cores} cores · ${task.ram} GB RAM`], ['Deadline after arrival', `${task.deadline} s`], ['Maximum latency', `${task.maxLatency} ms`], ...(task.status ? [['Status', task.status], ['Assigned data center', task.centerName ?? 'Unassigned'], ['Execution host', task.hostId ?? '—'], ['Planned start / finish', task.start !== undefined ? `${fmt(task.start)} / ${fmt(task.end)} s` : '—'], ['Waiting time', task.waiting !== undefined ? `${fmt(task.waiting)} s` : '—'], ['Estimated response', task.response !== undefined ? `${fmt(task.response)} s` : '—'], ['Task energy in horizon', `${fmt(task.energy, 6)} kWh`], ['Task carbon estimate', `${fmt(task.carbon, 4)} gCO₂e`], ['Task electricity cost', money(task.cost)], ['Energy-weighted renewables', task.renewableShare !== undefined ? `${fmt(task.renewableShare)}%` : '—']] : [])];
    showDialog(task.id, `<div class="dialog-body">${task.reason ? `<div class="info-banner">${esc(task.reason)}${task.deadlineFallback ? ' No placement could meet the deadline; queue policy applied.' : ''}</div>` : ''}<table><tbody>${pairs.map(([label, value]) => `<tr><td>${esc(label)}</td><td><strong>${esc(value)}</strong></td></tr>`).join('')}</tbody></table></div>`, button('Close', 'close-dialog'));
  }
  else if (action === 'export') exportDialog();
  else if (action === 'export-full') downloadExperiment(state.experiment);
  else if (action === 'export-summary') download('strategy-comparison.csv', toCSV(ALGORITHMS.map(key => ({ strategy: LABELS[key], ...state.experiment.results[key].metrics }))));
  else if (action === 'export-results') download('task-results.csv', toCSV(ALGORITHMS.flatMap(key => state.experiment.results[key].tasks.map(t => ({ strategy: LABELS[key], ...t }))), ['strategy', 'id', 'centerId', 'hostId', 'status', 'arrival', 'start', 'end', 'waiting', 'response', 'energy', 'carbon', 'cost', 'renewableShare', 'sla', 'reason']));
  else if (action === 'export-scenario') download('verdant-scenario.json', JSON.stringify(state.scenario, null, 2), 'application/json');
  else if (action === 'export-experiment') downloadExperiment(state.history.find(exp => exp.id === el.dataset.id));
  else if (action === 'view-experiment') { state.experiment = state.history.find(exp => exp.id === el.dataset.id); state.dirty = JSON.stringify(state.experiment.scenario) !== JSON.stringify(state.scenario); state.page = 'overview'; location.hash = 'overview'; render(); }
  else if (action === 'restore-experiment') { state.scenario = clone(state.history.find(exp => exp.id === el.dataset.id).scenario); markDirty('Inputs restored. Run an experiment to compare them again.'); }
  else if (action === 'clear-history') confirmAction('Clear saved experiments?', 'Remove experiment history from this browser? Export any results you want to keep first.', 'confirm-clear-history');
  else if (action === 'confirm-clear-history') { state.history = []; state.experiment = null; $('#dialog').close(); persist(); render(); toast('History cleared. Your current input configuration is preserved.'); }
  else if (action === 'reset') confirmAction('Restore sample inputs?', 'Replace your current data centers, workloads, and settings with the sample scenario? Saved experiments will remain available.', 'confirm-reset');
  else if (action === 'confirm-reset') { state.scenario = defaults(); state.scenario.tasks = generateTasks(state.scenario.settings); $('#dialog').close(); markDirty('Sample scenario restored.'); }
});
document.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.map-point')) { event.preventDefault(); event.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
document.addEventListener('input', event => {
  if (event.target.id === 'task-search') { const caret = event.target.selectionStart; state.search = event.target.value; state.taskPage = 0; renderTaskTable(); const el = $('#task-search'); el.focus(); try { el.setSelectionRange(caret, caret); } catch {} }
  if (['carbonWeight', 'costWeight', 'responseWeight'].includes(event.target.id)) updateWeights();
});
function updateWeights() {
  const bar = $('#weight-bar'); if (!bar) return;
  const values = ['carbonWeight', 'costWeight', 'responseWeight'].map(k => { const n = Number($(`#${k}`).value); $(`#value-${k}`).textContent = n; return n; });
  const sum = values.reduce((a, b) => a + b, 0) || 1;
  bar.innerHTML = values.map((v, i) => `<span style="width:${v / sum * 100}%;background:${['#277c59', '#b59a69', '#9aa7b5'][i]}"></span>`).join('');
}
document.addEventListener('change', event => {
  if (event.target.id === 'algorithm-filter') { state.algorithm = event.target.value; state.taskPage = 0; renderTaskTable(); }
  if (event.target.id === 'status-filter') { state.status = event.target.value; state.taskPage = 0; renderTaskTable(); }
  if (event.target.dataset.centerToggle) {
    const c = state.scenario.centers.find(c => c.id === event.target.dataset.centerToggle);
    if (!event.target.checked && state.scenario.centers.filter(c => c.enabled).length === 1) { event.target.checked = true; return toast('Keep at least one data center enabled.', true); }
    c.enabled = event.target.checked; markDirty('Data center selection updated.');
  }
});
document.addEventListener('submit', event => {
  if (event.target.id === 'generator-form') { event.preventDefault(); return; }
  if (event.target.id === 'center-form') {
    event.preventDefault(); const form = event.target, oldId = form.dataset.id;
    const previous = state.scenario.centers.find(c => c.id === oldId);
    const data = Object.fromEntries(new FormData(form));
    for (const key of Object.keys(data)) if (!['name', 'region', 'country'].includes(key)) data[key] = Number(data[key]);
    const c = { ...data, id: previous?.id ?? `dc-${Date.now().toString(36)}`, enabled: previous?.enabled ?? true };
    const next = clone(state.scenario); if (previous) next.centers = next.centers.map(v => v.id === oldId ? c : v); else next.centers.push(c);
    const errors = validateScenario(next); if (errors.length) { $('#center-error').textContent = errors.slice(0, 5).join('\n'); return; }
    state.scenario = next; $('#dialog').close(); markDirty('Data center saved. Run an experiment to see its impact.');
  }
  if (event.target.id === 'scheduler-form') {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.target)); const next = clone(state.scenario);
    for (const [key, value] of Object.entries(data)) { if (key === 'experimentName') next.name = value.trim(); else next.settings[key] = key === 'policy' ? value : Number(value); }
    const errors = validateScenario(next); if (errors.length) { $('#scheduler-error').textContent = errors.slice(0, 3).join('\n'); return; }
    state.scenario = next; markDirty('Scheduler settings saved.'); updateWeights();
  }
});
$('#file-input').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 5e6) throw new Error('Use a file smaller than 5 MB.');
    const text = await file.text(), kind = event.target.dataset.kind;
    if (kind === 'experiment') {
      const data = JSON.parse(text), scenario = data.scenario ?? data;
      const errors = validateScenario(scenario); if (errors.length) throw new Error(errors.slice(0, 3).join(' '));
      state.scenario = clone(scenario); markDirty('Scenario imported. Run to calculate verified results.'); return;
    }
    const rows = parseCSV(text), next = clone(state.scenario);
    const numeric = kind === 'centers' ? ['hosts', 'cores', 'ram', 'mips', 'idleWatts', 'maxWatts', 'pue', 'carbon', 'renewable', 'price', 'latency'] : kind === 'tasks' ? ['arrival', 'length', 'cores', 'ram', 'deadline', 'maxLatency'] : ['time', 'carbon', 'renewable', 'price'];
    const required = kind === 'centers' ? ['id', 'name', 'region', 'country', ...numeric, 'enabled'] : kind === 'tasks' ? ['id', ...numeric, 'origin'] : ['centerId', ...numeric];
    if (required.some(k => !(k in rows[0]))) throw new Error(`Required headers: ${required.join(', ')}. Download the template.`);
    const converted = rows.map((r, i) => {
      const out = Object.fromEntries(required.map(key => [key, r[key]]));
      for (const key of numeric) { if (!r[key]) throw new Error(`Row ${i + 2}: ${key} is empty.`); out[key] = Number(r[key]); }
      if (kind === 'centers') { if (!['true', 'false'].includes(r.enabled.toLowerCase())) throw new Error(`Row ${i + 2}: enabled must be true or false.`); out.enabled = r.enabled.toLowerCase() === 'true'; }
      return out;
    });
    next[kind] = converted;
    if (kind === 'centers') next.profiles = next.profiles.filter(p => converted.some(c => c.id === p.centerId));
    if (kind === 'tasks') next.settings.count = converted.length;
    const errors = validateScenario(next); if (errors.length) throw new Error(errors.slice(0, 4).join(' '));
    state.scenario = next; state.search = ''; state.status = 'all'; state.taskPage = 0; markDirty(`${rows.length} ${kind === 'profiles' ? 'energy observations' : kind} imported. Run to update results.`);
  } catch (error) { toast(`Import failed: ${error.message}`, true); }
});
window.addEventListener('hashchange', () => { const page = location.hash.slice(1); if (pages[page] && page !== state.page) { state.page = page; render(); updateWeights(); } });
const initialPage = location.hash.slice(1); if (pages[initialPage]) state.page = initialPage;
render(); updateWeights();
try { const r = await fetch('/api/health', { signal: AbortSignal.timeout(1200) }); if (r.ok && r.headers.get('content-type')?.includes('application/json')) state.api = (await r.json()).service === 'verdant'; } catch {}
if (!state.experiment) run();
