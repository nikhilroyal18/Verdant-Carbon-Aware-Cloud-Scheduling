import { mkdir, writeFile } from 'node:fs/promises';
import { defaults, generateTasks, toCSV } from '../dist/engine.js';
const s = defaults(); s.tasks = generateTasks(s.settings);
await mkdir('samples', { recursive: true });
await writeFile('samples/scenario.json', JSON.stringify(s, null, 2));
await writeFile('samples/data-centers.csv', toCSV(s.centers, ['id', 'name', 'region', 'country', 'hosts', 'cores', 'ram', 'mips', 'idleWatts', 'maxWatts', 'pue', 'carbon', 'renewable', 'price', 'latency', 'enabled']));
await writeFile('samples/workloads.csv', toCSV(s.tasks));
await writeFile('samples/energy-profiles.csv', toCSV(s.centers.flatMap(c => [ { centerId: c.id, time: 0, carbon: c.carbon, renewable: c.renewable, price: c.price }, { centerId: c.id, time: 450, carbon: c.carbon * .8, renewable: Math.min(100, c.renewable + 10), price: c.price * .9 } ])));
console.log('Generated reproducible sample files in samples/.');
