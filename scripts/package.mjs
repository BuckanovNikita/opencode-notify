import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
await mkdir('artifacts', { recursive: true });
const checksums = [];
// The local extension carries the exact workspace package built first here.
for (const name of ['router', 'presenter']) {
  const manifest = JSON.parse(await readFile(`packages/${name}/package.json`, 'utf8'));
  if (manifest.version !== version) throw new Error(`Version mismatch: ${name}`);
  if (name === 'presenter') execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['ci', '--omit=dev', '--ignore-scripts'], { cwd: resolve(root, 'packages', name), stdio: 'inherit', shell: process.platform === 'win32' });
  const filename = `${manifest.name}-${version}.vsix`;
  execFileSync(process.execPath, [resolve('node_modules/@vscode/vsce/vsce'), 'package', '--no-yarn',
    ...(name === 'router' ? ['--no-dependencies'] : []), '--out', resolve('artifacts', filename)],
  { cwd: resolve(root, 'packages', name), stdio: 'inherit' });
  checksums.push(`${createHash('sha256').update(await readFile(`artifacts/${filename}`)).digest('hex')}  ${filename}`);
  if (name === 'router') await copyFile(`artifacts/${filename}`, 'packages/presenter/dist/router.vsix');
}
await writeFile('artifacts/SHA256SUMS', `${checksums.join('\n')}\n`);
console.log('Both VSIX packages and SHA256SUMS are ready.');
