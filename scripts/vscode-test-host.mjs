import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function resolveTestAppRoot(executable, platform = process.platform, override = process.env.VSCODE_TEST_APP_ROOT) {
  if (override) return override;
  const root = dirname(executable);
  const conventional = join(root, platform === 'darwin' ? '../Resources/app' : 'resources/app');
  try { await readFile(join(conventional, 'package.json')); return conventional; }
  catch (error) { if (platform !== 'win32' || error.code !== 'ENOENT') throw error; }
  // Current Windows archives keep immutable resources under a build directory.
  // Do not guess between pending builds in an installed editor.
  const candidates = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9]{10}$/.test(entry.name)) continue;
    const candidate = join(root, entry.name, 'resources', 'app');
    try {
      if (JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8')).name === 'Code') candidates.push(candidate);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (candidates.length !== 1) throw new Error('Set VSCODE_TEST_APP_ROOT for an ambiguous or missing Windows installation');
  return candidates[0];
}
