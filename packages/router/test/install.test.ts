import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installPlugin, OWNED_PLUGIN_MARKER } from '../src/install.js';

test('concurrent first installs preserve the complete bundle without rejecting', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'opencode-notify-concurrent-install-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, 'source.js'); const destination = join(dir, 'plugins', 'notify.js');
  const bundle = `${OWNED_PLUGIN_MARKER}\n${'// plugin\n'.repeat(1000)}`;
  await writeFile(source, bundle);
  const results = await Promise.all(Array.from({ length: 8 }, () => installPlugin(source, destination)));
  assert.ok(results.includes('installed'));
  assert.equal(results.filter(result => result === 'installed').length, 1);
  assert.equal(await readFile(destination, 'utf8'), bundle);
});

test('automatic installation preserves edits even with the managed marker', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'opencode-notify-preserve-install-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, 'source.js'); const destination = join(dir, 'notify.js');
  await writeFile(source, `${OWNED_PLUGIN_MARKER}\n// new bundle`);
  const edited = `${OWNED_PLUGIN_MARKER}\n// personal edits`;
  await writeFile(destination, edited);
  assert.equal(await installPlugin(source, destination), 'conflict');
  assert.equal(await readFile(destination, 'utf8'), edited);
});
