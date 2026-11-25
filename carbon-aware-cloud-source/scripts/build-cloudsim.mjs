import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = '3.9.11';
const toolsDir = resolve(root, '.tools');
const home = resolve(toolsDir, `apache-maven-${version}`);
const executable = resolve(home, 'bin', process.platform === 'win32' ? 'mvn.cmd' : 'mvn');
const execute = (command, args, options = {}) => new Promise((resolveCommand, reject) => {
  const p = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
  p.on('error', reject); p.on('close', code => code === 0 ? resolveCommand() : reject(new Error(`Command exited with ${code}`)));
});
if (!existsSync(executable)) {
  await mkdir(toolsDir, { recursive: true });
  const url = `https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/${version}/apache-maven-${version}-bin.zip`;
  console.log(`Downloading Maven ${version} into project-local .tools/…`);
  const [archive, checksum] = await Promise.all([fetch(url), fetch(`${url}.sha512`)]);
  if (!archive.ok || !checksum.ok) throw new Error('Could not download Maven or its checksum.');
  const data = Buffer.from(await archive.arrayBuffer());
  const expected = (await checksum.text()).trim().split(/\s+/)[0];
  if (createHash('sha512').update(data).digest('hex') !== expected) throw new Error('Maven checksum verification failed.');
  const path = resolve(toolsDir, 'maven.zip'); await writeFile(path, data);
  if (process.platform === 'win32') {
    const quote = v => "'" + v.replaceAll("'", "''") + "'";
    await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath ${quote(path)} -DestinationPath ${quote(toolsDir)} -Force`]);
  } else await execute('unzip', ['-q', '-o', path, '-d', toolsDir]);
}
// cmd.exe requires an extra surrounding quote for a batch-file path containing spaces.
if (process.platform === 'win32') await execute('cmd.exe', ['/d', '/s', '/c', `""${executable}" -B -f cloudsim/pom.xml package -DskipTests"`], { windowsVerbatimArguments: true });
else await execute(executable, ['-B', '-f', 'cloudsim/pom.xml', 'package', '-DskipTests']);
console.log('CloudSim replay built: cloudsim/target/cloudsim-replay.jar');
