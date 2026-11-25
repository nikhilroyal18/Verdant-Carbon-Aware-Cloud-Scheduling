import { mkdir, writeFile } from 'node:fs/promises';
const datasource = { type: 'prometheus', uid: 'verdant-prometheus' };
const panels = [
  ['Modeled carbon emissions', 'verdant_simulated_carbon_grams', 'suffix:gCO₂e'],
  ['Modeled energy consumption', 'verdant_simulated_energy_kwh', 'kwatth'],
  ['Modeled electricity cost', 'verdant_simulated_electricity_cost_usd', 'currencyUSD'],
  ['Modeled SLA compliance', 'verdant_simulated_sla_percent', 'percent'],
  ['Modeled average response time', 'verdant_simulated_response_seconds', 's'],
  ['Modeled renewable energy share', 'verdant_simulated_renewable_energy_percent', 'percent'],
  ['Modeled throughput', 'verdant_simulated_throughput_tasks_per_second', 'suffix:tasks/s'],
  ['Modeled regional CPU utilization', 'verdant_simulated_region_cpu_percent', 'percent'],
  ['API requests per second', 'rate(verdant_api_requests_total[1m])', 'reqps'],
  ['API experiments completed', 'verdant_experiments_total', 'short'],
  ['API errors', 'verdant_api_errors_total', 'short'],
  ['Mean API experiment duration', 'rate(verdant_experiment_duration_seconds_sum[5m]) / rate(verdant_experiments_total[5m])', 's']
].map(([title, expr, unit], index) => ({
  id: index + 1, title, type: 'timeseries', datasource,
  gridPos: { x: index % 2 * 12, y: Math.floor(index / 2) * 8, w: 12, h: 8 },
  targets: [{ expr, refId: 'A', legendFormat: index === 7 ? '{{region}}' : index < 7 ? '{{strategy}}' : title }],
  fieldConfig: { defaults: { unit, color: { mode: 'palette-classic' }, custom: { lineWidth: 2, fillOpacity: 8 } }, overrides: [] },
  options: { legend: { displayMode: 'list', placement: 'bottom' }, tooltip: { mode: 'multi' } }
}));
await mkdir('monitoring/grafana/dashboards', { recursive: true });
await writeFile('monitoring/grafana/dashboards/verdant.json', JSON.stringify({
  uid: 'verdant-lab', title: 'Verdant · Scheduling & API monitoring', schemaVersion: 39, version: 1,
  tags: ['carbon-aware', 'simulation'], timezone: 'browser', refresh: '5s', time: { from: 'now-30m', to: 'now' },
  description: 'Modeled experiment outcomes are latest-run gauges; their graph timestamps are scrape time, not simulated time. API metrics are actual service measurements.',
  panels
}, null, 2));
