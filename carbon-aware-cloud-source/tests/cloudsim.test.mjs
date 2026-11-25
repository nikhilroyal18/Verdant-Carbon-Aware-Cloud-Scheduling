import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { defaults, generateTasks, runExperiment } from '../dist/engine.js';
const jar = 'cloudsim/target/cloudsim-replay.jar';

test('CloudSim Plus replays the sample placement plan and returns actual execution data', { skip: !existsSync(jar) }, async () => {
  const s = defaults(); s.tasks = generateTasks(s.settings); const exp = runExperiment(s);
  const result = await new Promise((resolve, reject) => {
    const p = spawn('java', ['-jar', jar], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = ''; const timer = setTimeout(() => { p.kill(); reject(new Error('Replay timeout')); }, 30000);
    p.stdout.on('data', chunk => out += chunk); p.stderr.on('data', chunk => err += chunk);
    p.on('error', reject); p.on('close', code => { clearTimeout(timer); if (code !== 0) reject(new Error(err)); else { try { resolve(JSON.parse(out)); } catch (e) { reject(e); } } });
    p.stdin.end(JSON.stringify({ scenario: s, plan: exp.results.carbon.tasks }));
  });
  assert.equal(result.engine, 'CloudSim Plus 8.5.1');
  assert.equal(result.submitted, 144); assert.equal(result.completed, exp.results.carbon.metrics.completed);
  assert.ok(result.meanFinishDeviationSeconds < 1, 'Sample replay should remain within one second mean deviation');
  assert.ok(result.tasks.some(t => t.actualFinish > t.actualStart));
  assert.ok(result.tasks.filter(t => t.completedWithinHorizon).every(t => t.actualFinish <= s.settings.duration));
});
