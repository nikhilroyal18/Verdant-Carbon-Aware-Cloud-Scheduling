import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { runExperiment, validateScenario, ALGORITHMS } from './dist/engine.js';

const root = dirname(fileURLToPath(import.meta.url));
const publicRoot = resolve(root, 'dist');
const jar = resolve(root, 'cloudsim/target/cloudsim-replay.jar');
const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
const stats = { experiments: 0, errors: 0, requests: 0, seconds: 0, latest: null };
let active = 0;
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.csv': 'text/csv' };

function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
function readJSON(req) {
  return new Promise((resolveBody, reject) => {
    let body = '', bytes = 0;
    req.on('data', chunk => { bytes += chunk.length; if (bytes > 5_000_000) { reject(Object.assign(new Error('Request exceeds 5 MB.'), { status: 413 })); req.resume(); } else body += chunk; });
    req.on('end', () => { try { resolveBody(JSON.parse(body)); } catch { reject(Object.assign(new Error('Invalid JSON request body.'), { status: 400 })); } });
    req.on('error', reject);
  });
}
function replay(experiment) {
  return new Promise((resolveReplay, reject) => {
    const child = spawn('java', ['-jar', jar], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = ''; let settled = false;
    const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timeout); error ? reject(error) : resolveReplay(result); };
    const timeout = setTimeout(() => { child.kill(); finish(new Error('CloudSim replay exceeded 45 seconds.')); }, 45000);
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 4e6) { child.kill(); finish(new Error('CloudSim output limit exceeded.')); } });
    child.stderr.on('data', chunk => { if (stderr.length < 12000) stderr += chunk; });
    child.on('error', error => finish(error));
    child.stdin.on('error', error => finish(error));
    child.on('close', code => {
      if (code !== 0) return finish(new Error(`CloudSim replay exited with code ${code}. ${stderr.slice(-1000)}`));
      try { finish(null, JSON.parse(stdout)); } catch { finish(new Error('CloudSim returned invalid JSON.')); }
    });
    child.stdin.end(JSON.stringify({ scenario: experiment.scenario, plan: experiment.results.carbon.tasks }));
  });
}
function metrics() {
  const lines = [
    '# HELP verdant_experiments_total Successfully computed scheduling comparisons.', '# TYPE verdant_experiments_total counter', `verdant_experiments_total ${stats.experiments}`,
    '# HELP verdant_api_requests_total HTTP requests handled.', '# TYPE verdant_api_requests_total counter', `verdant_api_requests_total ${stats.requests}`,
    '# HELP verdant_api_errors_total API or execution errors.', '# TYPE verdant_api_errors_total counter', `verdant_api_errors_total ${stats.errors}`,
    '# HELP verdant_experiment_duration_seconds_sum Total experiment API processing time.', '# TYPE verdant_experiment_duration_seconds_sum counter', `verdant_experiment_duration_seconds_sum ${stats.seconds}`,
    '# HELP verdant_experiments_active Concurrent experiment requests.', '# TYPE verdant_experiments_active gauge', `verdant_experiments_active ${active}`
  ];
  if (stats.latest) {
    const fields = { carbon_grams: 'carbon', energy_kwh: 'energy', electricity_cost_usd: 'cost', sla_percent: 'sla', response_seconds: 'response', p95_response_seconds: 'p95', cpu_percent: 'cpu', ram_percent: 'ram', renewable_energy_percent: 'renewableShare', renewable_tasks_percent: 'renewableTasks', completed_tasks: 'completed', throughput_tasks_per_second: 'throughput' };
    for (const [metric, key] of Object.entries(fields)) {
      lines.push(`# HELP verdant_simulated_${metric} Latest experiment modeled ${metric}.`, `# TYPE verdant_simulated_${metric} gauge`);
      for (const algorithm of ALGORITHMS) { const value = stats.latest.results[algorithm].metrics[key]; if (value !== null) lines.push(`verdant_simulated_${metric}{strategy="${algorithm}"} ${value}`); }
    }
    lines.push('# HELP verdant_simulated_region_cpu_percent Latest carbon-aware regional CPU utilization.', '# TYPE verdant_simulated_region_cpu_percent gauge');
    for (const dc of stats.latest.results.carbon.centers) lines.push(`verdant_simulated_region_cpu_percent{region="${dc.id}"} ${dc.cpuUtilization}`);
  }
  return lines.join('\n') + '\n';
}
export const server = http.createServer(async (req, res) => {
  stats.requests++;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/health' && req.method === 'GET') return json(res, 200, { service: 'verdant', status: 'ok', engine: 'reference', cloudsim: existsSync(jar) ? 'available' : 'not-built' });
    if (url.pathname === '/metrics' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' }); return res.end(metrics()); }
    if (url.pathname === '/api/experiments') {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'Use POST to run an experiment.' }); }
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Content-Type must be application/json.' });
      if (active >= 2) { res.setHeader('Retry-After', '2'); return json(res, 429, { error: 'Two experiments are already running. Try again shortly.' }); }
      const scenario = await readJSON(req); const errors = validateScenario(scenario);
      if (errors.length) { stats.errors++; return json(res, 400, { error: errors.slice(0, 8).join('\n') }); }
      active++; const started = performance.now();
      try {
        const result = runExperiment(scenario);
        if (existsSync(jar) && process.env.CLOUDSIM_REPLAY !== 'false') {
          try { result.cloudsim = await replay(result); result.engine = 'Reference model + CloudSim Plus execution replay'; }
          catch (error) { result.cloudsimError = error.message; stats.errors++; }
        }
        stats.experiments++; stats.latest = result; json(res, 200, result);
      } finally { active--; stats.seconds += (performance.now() - started) / 1000; }
      return;
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Unknown API endpoint.' });
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Method not allowed.' });
    const path = resolve(publicRoot, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(publicRoot + sep)) return json(res, 403, { error: 'Forbidden.' });
    try {
      if (!(await stat(path)).isFile()) throw new Error('Not a file');
      const body = await readFile(path); res.writeHead(200, { 'Content-Type': `${types[extname(path)] || 'application/octet-stream'}; charset=utf-8` }); res.end(req.method === 'HEAD' ? undefined : body);
    } catch { json(res, 404, { error: 'File not found.' }); }
  } catch (error) { stats.errors++; json(res, error.status || 400, { error: error.message }); }
});
server.requestTimeout = 100000;
server.listen(port, host, () => console.log(`Verdant ready at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}\nCloudSim replay: ${existsSync(jar) ? 'available' : 'run npm run build:cloudsim to enable'}`));
