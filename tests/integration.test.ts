import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createController } from '../packages/plugin/src/controller.js';
import { createTransport } from '../packages/plugin/src/transport.js';
import { defaultConfig, parseConfig, loadConfig } from '../packages/plugin/src/config.js';
import { startRouter } from '../packages/router/src/server.js';
import { createPresenter } from '../packages/presenter/src/policy.js';
import { installPlugin, OWNED_PLUGIN_MARKER } from '../packages/router/src/install.js';
import type { Notification } from '../packages/protocol/src/index.js';
import { OpenCodeNotify } from '../packages/plugin/src/index.js';

test('plugin event -> authenticated HTTP -> presenter preserves session context', async t => {
  const displayed: Notification[] = [];
  const presenter = createPresenter({ options: () => ({ enabled: true, mode: 'app', focused: true, sound: false, events: {} }),
    app: n => { displayed.push(n); }, system: async () => { assert.fail('unexpected native call'); }, log: assert.fail });
  const router = await startRouter({ deliver: presenter.deliver, log: assert.fail });
  t.after(() => router.close());
  const controller = createController({ config: defaultConfig, directory: '/work/demo', instanceId: 'integration',
    terminalId: 'terminal-1', now: () => 1000, session: async id => ({ id, title: 'Review migration' }),
    send: createTransport(router.url, router.token), log: assert.fail });
  await controller.event({ type: 'question.asked', properties: { sessionID: 'session-1', id: 'question-1' } });
  assert.equal(displayed[0]?.event, 'question');
  assert.equal(displayed[0]?.terminalId, 'terminal-1');
  assert.equal(displayed[0]?.message, 'Question needs your answer · Review migration');
});

test('plugin installer preserves existing files unless replacement is explicit', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'opencode-notify-install-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, 'bundle.js'); const destination = join(dir, 'plugins', 'opencode-notify.js');
  await writeFile(source, `${OWNED_PLUGIN_MARKER}\nexport function Plugin() {}`);
  assert.equal(await installPlugin(source, destination), 'installed');
  assert.equal(await installPlugin(source, destination), 'unchanged');
  await writeFile(destination, '// personal changes');
  assert.equal(await installPlugin(source, destination), 'conflict');
  assert.equal(await readFile(destination, 'utf8'), '// personal changes');
  assert.equal(await installPlugin(source, destination, true), 'installed');
});

test('configuration rejects invalid settings and preserves unrelated defaults', async t => {
  assert.equal(parseConfig({ events: { question: false } }).events.complete, true);
  assert.equal(parseConfig({ events: { subagent_complete: true } }).events.subagent_complete, true);
  assert.throws(() => parseConfig({ minDurationMs: -1 }));
  assert.throws(() => parseConfig({ events: { typo: true } }));
  assert.throws(() => parseConfig({ display: ['app'] }));
  const dir = await mkdtemp(join(tmpdir(), 'opencode-notify-config-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.deepEqual(await loadConfig(dir), defaultConfig);
  await writeFile(join(dir, 'opencode-notify.json'), '{ malformed');
  await assert.rejects(loadConfig(dir));
});

test('the v1 SDK receives the metadata timeout in its single options object', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'opencode-notify-sdk-'));
  const previousConfig = process.env.XDG_CONFIG_HOME;
  const previousUrl = process.env.OPENCODE_NOTIFY_URL;
  process.env.XDG_CONFIG_HOME = dir;
  delete process.env.OPENCODE_NOTIFY_URL;
  t.after(async () => {
    if (previousConfig === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = previousConfig;
    if (previousUrl === undefined) delete process.env.OPENCODE_NOTIFY_URL; else process.env.OPENCODE_NOTIFY_URL = previousUrl;
    await rm(dir, { recursive: true, force: true });
  });
  let received: unknown;
  const hooks = await OpenCodeNotify({ directory: dir, client: {
    session: { get: async options => { received = options; return { data: { id: 's1', title: 'SDK check' } }; } },
    app: { log: async () => {} },
  } });
  assert.ok(hooks.event);
  await hooks.event({ event: { type: 'question.asked', properties: { sessionID: 's1', id: 'q1' } } });
  assert.ok(typeof received === 'object' && received !== null && 'signal' in received && received.signal instanceof AbortSignal);
});
