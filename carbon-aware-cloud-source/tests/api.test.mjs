import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { defaults, generateTasks } from '../dist/engine.js';

test('HTTP API, static files, validation, and Prometheus metrics', async () => {
  const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: '3091', CLOUDSIM_REPLAY: 'false' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  try {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Server readiness timeout')), 10000); child.on('error', reject); child.stdout.once('data', () => { clearTimeout(timer); resolve(); }); });
    const base = 'http://127.0.0.1:3091';
    assert.equal((await (await fetch(`${base}/api/health`)).json()).service, 'verdant');
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(`${base}/not-found`)).status, 404);
    assert.equal((await fetch(`${base}/api/experiments`)).status, 405);
    const bad = await fetch(`${base}/api/experiments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(bad.status, 400);
    const s = defaults(); s.settings.count = 10; s.tasks = generateTasks(s.settings);
    const response = await fetch(`${base}/api/experiments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
    assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.results.carbon.metrics.total, 10);
    const metrics = await (await fetch(`${base}/metrics`)).text();
    assert.match(metrics, /verdant_experiments_total 1/); assert.match(metrics, /verdant_simulated_carbon_grams\{strategy="carbon"\}/);
    const traversal = await fetch(`${base}/%2e%2e%2fpackage.json`); assert.notEqual(traversal.status, 200);
  } finally { child.kill(); }
});
