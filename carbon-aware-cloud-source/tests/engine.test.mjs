import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, generateTasks, runAlgorithm, runExperiment, validateScenario, parseCSV, toCSV, ALGORITHMS } from '../dist/engine.js';

function fixture() {
  const s = defaults();
  s.centers = [{ ...s.centers[0], id: 'one', name: 'One', hosts: 1, cores: 2, ram: 4, mips: 1000, idleWatts: 100, maxWatts: 200, pue: 1, carbon: 500, renewable: 40, price: .2, latency: 0 }];
  s.settings = { ...s.settings, duration: 100, count: 1, policy: 'queue' };
  s.tasks = [{ id: 't1', arrival: 0, length: 20000, cores: 2, ram: 4, deadline: 100, maxLatency: 100, origin: 'Test' }];
  return s;
}
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('analytical fixture: execution, idle energy, emissions, price, and PUE', () => {
  const s = fixture(), r = runAlgorithm(s, 'carbon');
  near(r.tasks[0].duration, 10); near(r.tasks[0].response, 10);
  // 10 s at 200 W, 90 s at 100 W = 11,000 joules.
  near(r.metrics.energy, 11000 / 3600000);
  near(r.metrics.carbon, 11000 / 3600000 * 500);
  near(r.metrics.cost, 11000 / 3600000 * .2);
  near(r.metrics.renewableShare, 40); near(r.metrics.cpu, 10); near(r.metrics.ram, 10);
  assert.equal(r.metrics.sla, 100); near(r.metrics.throughput, .01);
  s.centers[0].pue = 1.5; near(runAlgorithm(s, 'carbon').metrics.energy, r.metrics.energy * 1.5);
});
test('same seed generates identical inputs and repeatable strategy outputs', () => {
  const a = defaults(), b = defaults(); a.tasks = generateTasks(a.settings); b.tasks = generateTasks(b.settings);
  assert.deepEqual(a.tasks, b.tasks);
  assert.deepEqual(runExperiment(a).results, runExperiment(b).results);
  b.settings.seed++; assert.notDeepEqual(a.tasks, generateTasks(b.settings));
});
test('all strategies obey CPU, RAM, and hard network limits', () => {
  const s = defaults(); s.tasks = generateTasks(s.settings);
  for (const key of ALGORITHMS) {
    const r = runAlgorithm(s, key);
    for (const dc of s.centers) {
      const tasks = r.tasks.filter(t => t.centerId === dc.id);
      for (const task of tasks) {
        assert.ok(task.start >= task.arrival); assert.ok(task.latency <= task.maxLatency);
        const active = tasks.filter(t => t.hostId === task.hostId && t.start <= task.start + 1e-8 && t.end > task.start + 1e-8);
        assert.ok(active.reduce((n, t) => n + t.cores, 0) <= dc.cores);
        assert.ok(active.reduce((n, t) => n + t.ram, 0) <= dc.ram + 1e-8);
      }
    }
    near(r.timeline.at(-1).carbon + r.timeline.slice(0, -1).reduce((n, b) => n + b.carbon, 0), r.metrics.carbon);
    assert.equal(r.metrics.completed + r.metrics.rejected + r.metrics.queued + r.metrics.running, s.tasks.length);
    assert.ok(r.metrics.cpu <= 100 + 1e-8); assert.ok(r.metrics.ram <= 100 + 1e-8);
  }
});
test('memory reservations delay tasks even when CPU is free', () => {
  const s = fixture(); s.tasks[0].cores = 1;
  s.tasks.push({ ...s.tasks[0], id: 't2' });
  const r = runAlgorithm(s, 'carbon');
  near(r.tasks[0].duration, 20); near(r.tasks[1].start, 20);
});
test('no suitable resources or excessive latency cause explicit rejection', () => {
  const s = fixture(); s.tasks[0].ram = 8;
  let r = runAlgorithm(s, 'carbon'); assert.equal(r.tasks[0].status, 'rejected'); assert.equal(r.metrics.response, null); assert.equal(r.metrics.sla, 0);
  near(r.metrics.energy, 100 * 100 / 3600000);
  s.tasks[0].ram = 4; s.centers[0].latency = 101; assert.equal(runAlgorithm(s, 'carbon').tasks[0].status, 'rejected');
});
test('queue policy records misses; reject policy rejects impossible deadlines', () => {
  const s = fixture(); s.tasks[0].deadline = 5;
  let r = runAlgorithm(s, 'carbon'); assert.equal(r.tasks[0].status, 'completed'); assert.equal(r.tasks[0].sla, false); assert.equal(r.tasks[0].deadlineFallback, true);
  s.settings.policy = 'reject'; r = runAlgorithm(s, 'carbon'); assert.equal(r.tasks[0].status, 'rejected');
});
test('finite horizon clips energy and separates running and queued tasks', () => {
  const s = fixture(); s.tasks[0].length = 300000; s.tasks.push({ ...s.tasks[0], id: 't2' });
  const r = runAlgorithm(s, 'carbon');
  assert.equal(r.tasks[0].status, 'running'); assert.equal(r.tasks[1].status, 'queued');
  assert.equal(r.metrics.completed, 0); assert.equal(r.metrics.sla, 0); assert.equal(r.tasks[1].energy, 0);
  near(r.metrics.energy, 200 * 100 / 3600000);
});
test('piecewise energy profiles integrate at boundaries without double discounting carbon', () => {
  const s = fixture(); s.tasks[0].length = 200000;
  s.profiles = [{ centerId: 'one', time: 50, carbon: 100, renewable: 80, price: .1 }];
  const r = runAlgorithm(s, 'carbon');
  near(r.metrics.carbon, 200 * 50 / 3600000 * (500 + 100));
  near(r.metrics.renewableShare, 60); near(r.metrics.cost, 200 * 50 / 3600000 * .3);
});
test('carbon-only objective chooses cleaner feasible DC; performance chooses faster one', () => {
  const s = fixture(); s.centers.push({ ...s.centers[0], id: 'two', name: 'Two', mips: 2000, carbon: 1000 });
  s.settings.carbonWeight = 100; s.settings.costWeight = 0; s.settings.responseWeight = 0;
  // Cleaner DC must have lower task emissions even after considering runtime.
  s.centers[0].carbon = 100;
  assert.equal(runAlgorithm(s, 'carbon').tasks[0].centerId, 'one');
  assert.equal(runAlgorithm(s, 'performance').tasks[0].centerId, 'two');
});
test('validation catches bad configurations and repeated profile times', () => {
  const s = fixture(); s.centers[0].maxWatts = 20; s.settings.carbonWeight = s.settings.costWeight = s.settings.responseWeight = 0;
  assert.ok(validateScenario(s).some(e => e.includes('maximum power')));
  assert.ok(validateScenario(s).some(e => e.includes('weight')));
  assert.throws(() => runAlgorithm(s, 'carbon'));
});
test('CSV round-trips quoted commas and newlines and blocks spreadsheet formulas', () => {
  const rows = [{ id: 'task,one', origin: 'a "quoted"\nplace', count: 5 }];
  assert.deepEqual(parseCSV(toCSV(rows)), [{ ...rows[0], count: '5' }]);
  assert.ok(toCSV([{ id: '=HYPERLINK("x")' }]).includes("'=HYPERLINK"));
  assert.throws(() => parseCSV('a,b\n1')); assert.throws(() => parseCSV('a\n"unclosed')); assert.throws(() => parseCSV('a,a\n1,2'));
});
