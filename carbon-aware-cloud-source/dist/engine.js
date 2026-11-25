export const ALGORITHMS = ['carbon', 'roundRobin', 'performance'];
export const LABELS = { carbon: 'Carbon-aware', roundRobin: 'Round-robin', performance: 'Performance-first' };
export const COLORS = { carbon: '#277c59', roundRobin: '#9aa7b5', performance: '#b59a69' };
export const clone = value => JSON.parse(JSON.stringify(value));

export function defaults() {
  return {
    name: 'Sustainable cloud · Sample scenario',
    centers: [
      { id: 'mumbai', name: 'Mumbai', region: 'ap-south-1', country: 'India', hosts: 2, cores: 8, ram: 32, mips: 1000, idleWatts: 45, maxWatts: 250, pue: 1.2, carbon: 650, renewable: 25, price: .105, latency: 24, enabled: true, x: 69, y: 54 },
      { id: 'frankfurt', name: 'Frankfurt', region: 'eu-central-1', country: 'Germany', hosts: 2, cores: 8, ram: 32, mips: 1200, idleWatts: 40, maxWatts: 240, pue: 1.15, carbon: 330, renewable: 58, price: .22, latency: 118, enabled: true, x: 49, y: 28 },
      { id: 'stockholm', name: 'Stockholm', region: 'eu-north-1', country: 'Sweden', hosts: 2, cores: 8, ram: 32, mips: 1000, idleWatts: 35, maxWatts: 220, pue: 1.1, carbon: 45, renewable: 92, price: .12, latency: 152, enabled: true, x: 52, y: 18 },
      { id: 'virginia', name: 'N. Virginia', region: 'us-east-1', country: 'United States', hosts: 2, cores: 8, ram: 32, mips: 1400, idleWatts: 50, maxWatts: 260, pue: 1.2, carbon: 370, renewable: 42, price: .095, latency: 208, enabled: true, x: 24, y: 35 }
    ],
    settings: { duration: 900, seed: 42, count: 144, carbonWeight: 65, costWeight: 15, responseWeight: 20, renewableThreshold: 70, policy: 'queue' },
    tasks: [], profiles: []
  };
}

function rng(seed) {
  let value = seed >>> 0;
  return () => { value += 0x6D2B79F5; let n = Math.imul(value ^ value >>> 15, 1 | value); n ^= n + Math.imul(n ^ n >>> 7, 61 | n); return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}

export function generateTasks(settings) {
  const random = rng(settings.seed);
  return Array.from({ length: settings.count }, (_, i) => {
    const cores = [1, 2, 2, 4][Math.floor(random() * 4)];
    return { id: `TASK-${String(i + 1).padStart(4, '0')}`, arrival: Math.round(random() * settings.duration * .7), length: Math.round(120000 + random() * 360000), cores, ram: cores * 2, deadline: Math.round(140 + random() * 200), maxLatency: random() < .15 ? 100 : 260, origin: 'Bengaluru' };
  }).sort((a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
}

export function validateScenario(scenario) {
  const errors = [];
  if (!scenario || !Array.isArray(scenario.centers) || !Array.isArray(scenario.tasks) || !scenario.settings || !Array.isArray(scenario.profiles ?? [])) return ['Invalid scenario structure.'];
  if (typeof scenario.name !== 'string' || !scenario.name.trim() || scenario.name.length > 150) errors.push('Experiment name is required (150 characters maximum).');
  if ([...scenario.centers, ...scenario.tasks, ...(scenario.profiles ?? [])].some(row => !row || typeof row !== 'object' || Array.isArray(row))) return ['Every data center, workload, and profile row must be an object.'];
  const number = (obj, key, min, max, label, integer = false) => {
    if (typeof obj[key] !== 'number' || !Number.isFinite(obj[key]) || obj[key] < min || obj[key] > max || (integer && !Number.isInteger(obj[key]))) errors.push(`${label}: ${key} must be ${integer ? 'an integer ' : ''}between ${min} and ${max}.`);
  };
  const st = scenario.settings;
  number(st, 'duration', 10, 86400, 'Experiment'); number(st, 'seed', 0, 2147483647, 'Experiment', true); number(st, 'count', 1, 1000, 'Experiment', true);
  for (const key of ['carbonWeight', 'costWeight', 'responseWeight', 'renewableThreshold']) number(st, key, 0, 100, 'Experiment');
  if (!(st.carbonWeight + st.costWeight + st.responseWeight > 0)) errors.push('At least one scheduler weight must be greater than zero.');
  if (!['queue', 'reject'].includes(st.policy)) errors.push('Unknown scheduling policy.');
  if (scenario.centers.length > 12 || !scenario.centers.some(c => c.enabled)) errors.push('Enable between 1 and 12 data centers.');
  const dcIds = new Set();
  scenario.centers.forEach(c => {
    if (typeof c.id !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(c.id) || dcIds.has(c.id)) errors.push('Data center IDs must be unique, short letters/numbers/hyphens.');
    dcIds.add(c.id);
    for (const key of ['name', 'region', 'country']) if (typeof c[key] !== 'string' || !c[key].trim() || c[key].length > 100) errors.push(`Data center ${key} is required (100 characters maximum).`);
    if (typeof c.enabled !== 'boolean') errors.push('Data center enabled must be true or false.');
    for (const [key, min, max, integer] of [['hosts', 1, 16, true], ['cores', 1, 64, true], ['ram', 1, 1024], ['mips', 1, 100000], ['idleWatts', 0, 5000], ['maxWatts', 1, 10000], ['pue', 1, 3], ['carbon', 0, 2000], ['renewable', 0, 100], ['price', 0, 10], ['latency', 0, 2000]]) number(c, key, min, max, c.name, integer);
    if (c.maxWatts < c.idleWatts) errors.push(`${c.name}: maximum power must be at least idle power.`);
  });
  if (scenario.tasks.length > 1000 || !scenario.tasks.length) errors.push('Provide between 1 and 1,000 workloads.');
  const ids = new Set();
  scenario.tasks.forEach(t => {
    if (typeof t.id !== 'string' || !t.id.trim() || t.id.length > 80 || ids.has(t.id)) errors.push('Task IDs must be present and unique (80 characters maximum).');
    ids.add(t.id);
    for (const [key, min, max, integer] of [['arrival', 0, 86400], ['length', 1, 1e10], ['cores', 1, 64, true], ['ram', .1, 1024], ['deadline', .001, 86400], ['maxLatency', 0, 2000]]) number(t, key, min, max, t.id, integer);
    if (typeof t.origin !== 'string' || !t.origin.trim() || t.origin.length > 100) errors.push(`${t.id}: origin is required.`);
    if (t.arrival >= st.duration) errors.push(`${t.id}: arrival must be before the simulation horizon.`);
  });
  if ((scenario.profiles ?? []).length > 2000) errors.push('Profiles are limited to 2,000 rows.');
  const profileKeys = new Set();
  (scenario.profiles ?? []).forEach(p => {
    if (!dcIds.has(p.centerId)) errors.push(`Unknown profile data center: ${p.centerId}.`);
    for (const [key, min, max] of [['time', 0, 86400], ['carbon', 0, 2000], ['renewable', 0, 100], ['price', 0, 10]]) number(p, key, min, max, 'Energy profile');
    const key = `${p.centerId}:${p.time}`;
    if (profileKeys.has(key)) errors.push('A data center cannot have two profile values at the same time.');
    profileKeys.add(key);
  });
  return [...new Set(errors)];
}

function conditions(dc, profiles, time) {
  let current = dc;
  for (const row of profiles) { if (row.time > time) break; current = row; }
  return current;
}

function integrate(dc, profiles, start, end, watts) {
  let energy = 0, carbon = 0, cost = 0, renewableEnergy = 0;
  const times = [start, ...profiles.filter(p => p.time > start && p.time < end).map(p => p.time), end];
  for (let i = 1; i < times.length; i++) {
    const kwh = Math.max(0, times[i] - times[i - 1]) * watts * dc.pue / 3600000;
    const c = conditions(dc, profiles, times[i - 1]);
    energy += kwh; carbon += kwh * c.carbon; cost += kwh * c.price; renewableEnergy += kwh * c.renewable / 100;
  }
  return { energy, carbon, cost, renewableEnergy };
}

function earliestSlot(host, task, duration) {
  const candidates = [...new Set([task.arrival, ...host.bookings.filter(b => b.end >= task.arrival).map(b => b.end)])].sort((a, b) => a - b);
  for (const start of candidates) {
    const end = start + duration;
    const overlapping = host.bookings.filter(b => b.start < end - 1e-8 && b.end > start + 1e-8);
    const points = [start, ...overlapping.filter(b => b.start > start).map(b => b.start)];
    if (points.every(time => {
      const active = overlapping.filter(b => b.start <= time + 1e-8 && b.end > time + 1e-8);
      return task.cores + active.reduce((sum, b) => sum + b.cores, 0) <= host.dc.cores && task.ram + active.reduce((sum, b) => sum + b.ram, 0) <= host.dc.ram + 1e-8;
    })) return start;
  }
  return Infinity;
}

export function runAlgorithm(scenario, algorithm) {
  const errors = validateScenario(scenario);
  if (errors.length) throw new Error(errors.slice(0, 8).join('\n'));
  if (!ALGORITHMS.includes(algorithm)) throw new Error('Unknown scheduling algorithm.');
  const { settings, tasks } = scenario;
  const centers = scenario.centers.filter(dc => dc.enabled).map(dc => ({ ...dc, profiles: (scenario.profiles ?? []).filter(p => p.centerId === dc.id).sort((a, b) => a.time - b.time) }));
  const hosts = centers.flatMap(dc => Array.from({ length: dc.hosts }, (_, i) => ({ id: `${dc.id}-${i}`, dc, bookings: [] })));
  const results = [];
  let roundRobinIndex = 0;
  for (const task of [...tasks].sort((a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id))) {
    const candidates = [];
    for (const host of hosts) {
      const dc = host.dc;
      if (task.cores > dc.cores || task.ram > dc.ram || dc.latency > task.maxLatency) continue;
      const duration = task.length / (dc.mips * task.cores);
      const start = earliestSlot(host, task, duration);
      const end = start + duration;
      const response = end - task.arrival + dc.latency / 1000;
      const watts = dc.maxWatts * task.cores / dc.cores;
      const footprint = integrate(dc, dc.profiles, start, end, watts);
      candidates.push({ host, dc, start, end, duration, response, ...footprint, meetsDeadline: response <= task.deadline + 1e-7 });
    }
    const compliant = candidates.filter(c => c.meetsDeadline);
    const available = compliant.length ? compliant : settings.policy === 'queue' ? candidates : [];
    if (!available.length) {
      results.push({ ...task, status: 'rejected', centerId: null, reason: candidates.length ? 'No placement can meet the deadline; rejection policy applied.' : 'No data center meets CPU, RAM, and latency limits.', sla: false, energy: 0, carbon: 0, cost: 0, renewableEnergy: 0 });
      continue;
    }
    let chosen;
    if (algorithm === 'roundRobin') {
      for (let offset = 0; offset < centers.length; offset++) {
        const index = (roundRobinIndex + offset) % centers.length;
        const options = available.filter(c => c.dc.id === centers[index].id).sort((a, b) => a.response - b.response);
        if (options.length) { chosen = options[0]; roundRobinIndex = (index + 1) % centers.length; break; }
      }
    } else if (algorithm === 'performance') chosen = available.reduce((best, c) => c.response < best.response ? c : best);
    else {
      const bounds = Object.fromEntries(['carbon', 'cost', 'response'].map(key => [key, [Math.min(...available.map(c => c[key])), Math.max(...available.map(c => c[key]))]]));
      const normalized = (c, key) => { const [min, max] = bounds[key]; return max - min < 1e-12 ? 0 : (c[key] - min) / (max - min); };
      for (const c of available) c.score = normalized(c, 'carbon') * settings.carbonWeight + normalized(c, 'cost') * settings.costWeight + normalized(c, 'response') * settings.responseWeight;
      chosen = available.reduce((best, c) => c.score < best.score - 1e-10 || (Math.abs(c.score - best.score) < 1e-10 && c.response < best.response) ? c : best);
    }
    const c = chosen;
    c.host.bookings.push({ start: c.start, end: c.end, cores: task.cores, ram: task.ram });
    const status = c.end + c.dc.latency / 1000 <= settings.duration ? 'completed' : c.start < settings.duration ? 'running' : 'queued';
    const taskEnergy = integrate(c.dc, c.dc.profiles, c.start, Math.min(c.end, settings.duration), c.dc.maxWatts * task.cores / c.dc.cores);
    results.push({ ...task, status, centerId: c.dc.id, centerName: c.dc.name, hostId: c.host.id, start: c.start, end: c.end, duration: c.duration, waiting: c.start - task.arrival, response: c.response, latency: c.dc.latency, sla: status === 'completed' && c.meetsDeadline, ...taskEnergy, renewableShare: taskEnergy.energy ? taskEnergy.renewableEnergy / taskEnergy.energy * 100 : 0, reason: algorithm === 'carbon' ? 'Lowest weighted carbon, cost, and response score among feasible placements.' : algorithm === 'performance' ? 'Earliest estimated response among feasible placements.' : 'Next feasible data center in round-robin order.', deadlineFallback: !c.meetsDeadline });
  }
  const bins = 24;
  const timeline = Array.from({ length: bins }, (_, i) => ({ time: (i + 1) * settings.duration / bins, carbon: 0, energy: 0, completed: 0 }));
  const dcStats = centers.map(dc => {
    const ownHosts = hosts.filter(h => h.dc.id === dc.id);
    const stat = { id: dc.id, name: dc.name, energy: 0, carbon: 0, cost: 0, renewableEnergy: 0, cpuSeconds: 0, ramSeconds: 0, assigned: results.filter(t => t.centerId === dc.id).length, completed: results.filter(t => t.centerId === dc.id && t.status === 'completed').length };
    for (const host of ownHosts) {
      for (let i = 0; i < bins; i++) {
        const start = i * settings.duration / bins, end = (i + 1) * settings.duration / bins;
        const idle = integrate(dc, dc.profiles, start, end, dc.idleWatts);
        for (const key of ['energy', 'carbon', 'cost', 'renewableEnergy']) stat[key] += idle[key];
        timeline[i].carbon += idle.carbon; timeline[i].energy += idle.energy;
        for (const b of host.bookings) {
          const from = Math.max(start, b.start), to = Math.min(end, b.end);
          if (to <= from) continue;
          const active = integrate(dc, dc.profiles, from, to, (dc.maxWatts - dc.idleWatts) * b.cores / dc.cores);
          for (const key of ['energy', 'carbon', 'cost', 'renewableEnergy']) stat[key] += active[key];
          timeline[i].carbon += active.carbon; timeline[i].energy += active.energy;
          stat.cpuSeconds += (to - from) * b.cores; stat.ramSeconds += (to - from) * b.ram;
        }
      }
    }
    stat.cpuUtilization = stat.cpuSeconds / (settings.duration * dc.hosts * dc.cores) * 100;
    stat.ramUtilization = stat.ramSeconds / (settings.duration * dc.hosts * dc.ram) * 100;
    stat.renewableShare = stat.energy ? stat.renewableEnergy / stat.energy * 100 : 0;
    return stat;
  });
  for (const t of results.filter(t => t.status === 'completed')) timeline[Math.min(bins - 1, Math.floor((t.end + t.latency / 1000) / settings.duration * bins))].completed++;
  const completed = results.filter(t => t.status === 'completed');
  const responses = completed.map(t => t.response).sort((a, b) => a - b);
  const sum = key => dcStats.reduce((value, dc) => value + dc[key], 0);
  const metrics = {
    energy: sum('energy'), carbon: sum('carbon'), cost: sum('cost'), renewableEnergy: sum('renewableEnergy'),
    renewableShare: sum('energy') ? sum('renewableEnergy') / sum('energy') * 100 : 0,
    renewableTasks: completed.length ? completed.filter(t => t.renewableShare >= settings.renewableThreshold).length / completed.length * 100 : 0,
    completed: completed.length, total: tasks.length, rejected: results.filter(t => t.status === 'rejected').length, running: results.filter(t => t.status === 'running').length, queued: results.filter(t => t.status === 'queued').length,
    sla: results.filter(t => t.sla).length / tasks.length * 100,
    response: responses.length ? responses.reduce((a, b) => a + b, 0) / responses.length : null,
    p95: responses.length ? responses[Math.ceil(responses.length * .95) - 1] : null,
    throughput: completed.length / settings.duration,
    cpu: sum('cpuSeconds') / (settings.duration * centers.reduce((n, dc) => n + dc.hosts * dc.cores, 0)) * 100,
    ram: sum('ramSeconds') / (settings.duration * centers.reduce((n, dc) => n + dc.hosts * dc.ram, 0)) * 100
  };
  return { algorithm, metrics, centers: dcStats, tasks: results, timeline };
}

export function runExperiment(scenario) {
  const errors = validateScenario(scenario);
  if (errors.length) throw new Error(errors.slice(0, 10).join('\n'));
  return { id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: scenario.name, createdAt: new Date().toISOString(), engine: 'Deterministic reference model', scenario: clone(scenario), results: Object.fromEntries(ALGORITHMS.map(algorithm => [algorithm, runAlgorithm(scenario, algorithm)])) };
}

export function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else if (!quoted && cell.length) throw new Error('Invalid quote in CSV field.'); else quoted = !quoted; }
    else if (!quoted && (ch === ',' || ch === '\n' || ch === '\r')) {
      row.push(cell); cell = '';
      if (ch !== ',') { if (row.some(v => v.trim())) rows.push(row); row = []; if (ch === '\r' && text[i + 1] === '\n') i++; }
    } else cell += ch;
  }
  if (quoted) throw new Error('Unclosed quotation mark in CSV.');
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  if (rows.length < 2) throw new Error('CSV needs a header and at least one data row.');
  const headers = rows.shift().map(h => h.trim());
  if (new Set(headers).size !== headers.length || headers.some(h => !h)) throw new Error('CSV headers must be present and unique.');
  return rows.map((r, i) => { if (r.length !== headers.length) throw new Error(`CSV row ${i + 2} has ${r.length} fields; expected ${headers.length}.`); return Object.fromEntries(headers.map((h, j) => [h, r[j].trim()])); });
}

export function toCSV(rows, keys = Object.keys(rows[0] ?? {})) {
  const cell = value => { const v = String(value ?? ''); const safe = /^[=+@\-\t\r]/.test(v) ? `'${v}` : v; return `"${safe.replaceAll('"', '""')}"`; };
  return [keys.map(cell).join(','), ...rows.map(row => keys.map(k => cell(row[k])).join(','))].join('\r\n');
}
