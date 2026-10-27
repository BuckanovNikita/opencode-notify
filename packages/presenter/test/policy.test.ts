import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPresenter, type PresenterOptions } from '../src/policy.js';
import type { Notification } from '../../protocol/src/index.js';

const note: Notification = { version: 1, id: 'test:1', event: 'complete', sessionId: 's1',
  project: 'demo', directory: '/demo', title: 'OpenCode', message: 'Done', occurredAt: 1000 };

function harness(config: Partial<PresenterOptions> = {}) {
  const channels: string[] = [];
  const logs: string[] = [];
  const options: PresenterOptions = { mode: 'auto', focused: true, sound: true, enabled: true,
    events: {}, ...config };
  const presenter = createPresenter({ options: () => options, app: () => { channels.push('app'); },
    system: async () => { channels.push('system'); }, log: m => logs.push(m) });
  return { presenter, channels, logs, options };
}

test('auto follows local window focus; explicit preferences override hints', async () => {
  const h = harness(); await h.presenter.deliver(note);
  h.options.focused = false; await h.presenter.deliver({ ...note, id: '2' });
  h.options.mode = 'app'; await h.presenter.deliver({ ...note, id: '3', display: 'system' });
  h.options.mode = 'system'; await h.presenter.deliver({ ...note, id: '4', display: 'app' });
  assert.deepEqual(h.channels, ['app', 'system', 'app', 'system']);
});

test('duplicates and disabled events do not display', async () => {
  const h = harness(); await h.presenter.deliver(note); await h.presenter.deliver(note);
  h.options.events.question = false;
  await h.presenter.deliver({ ...note, id: 'q1', event: 'question' });
  assert.deepEqual(h.channels, ['app']);
});

test('native failure logs and falls back to app without rejecting the event', async () => {
  let app = 0; const logs: string[] = [];
  const presenter = createPresenter({
    options: () => ({ mode: 'system', focused: false, sound: false, enabled: true, events: {} }),
    app: () => { app++; }, system: async () => { throw new Error('no notification service'); }, log: m => logs.push(m),
  });
  await presenter.deliver(note);
  assert.equal(app, 1); assert.equal(logs.length, 1);
});

test('malformed command payload never reaches a native notification process', async () => {
  const h = harness({ mode: 'system' });
  await assert.rejects(h.presenter.deliver({ ...note, title: '\x00bad' }));
  assert.deepEqual(h.channels, []);
});

test('both emits native once and an app alert only in a focused window', async () => {
  const h = harness({ mode: 'both' });
  await h.presenter.deliver(note); await h.presenter.deliver(note);
  assert.deepEqual(h.channels, ['app', 'system']);
  h.options.focused = false;
  await h.presenter.deliver({ ...note, id: '2' });
  assert.deepEqual(h.channels, ['app', 'system', 'system']);
});

test('both forwards focused app delivery and never duplicates accepted alert on native failure', async () => {
  let app = 0; let relay = 0;
  const presenter = createPresenter({ options: () => ({ mode: 'both', enabled: true, trusted: true, focused: false, sound: true, events: {} }),
    app: () => { app++; }, relay: async () => { relay++; return true; }, system: async () => { throw new Error('failed'); }, log: () => {} });
  await presenter.deliver(note);
  assert.equal(relay, 1); assert.equal(app, 0);
});

test('relay receipt rechecks focus, trust, settings and deduplicates without native delivery', () => {
  const h = harness({ mode: 'both', focused: false });
  const value = { version: 1 as const, notification: note, origin: { peerId: 'p', targetId: 't' } };
  assert.equal(h.presenter.receive(value), false);
  h.options.focused = true; h.options.enabled = false; assert.equal(h.presenter.receive(value), false);
  h.options.enabled = true; h.options.trusted = false; assert.equal(h.presenter.receive(value), false);
  h.options.trusted = true; assert.equal(h.presenter.receive(value), true); assert.equal(h.presenter.receive(value), true);
  assert.deepEqual(h.channels, ['app']);
});

test('labels identify project/session and attention events use warning or error severity', async () => {
  const { notificationLabel, notificationSeverity } = await import('../src/policy.js');
  assert.match(notificationLabel({ ...note, title: 'OpenCode · demo', event: 'question', sessionTitle: 'Review changes' }), /demo.*Question.*Review changes/u);
  assert.equal(notificationSeverity({ ...note, event: 'question' }), 'warning');
  assert.equal(notificationSeverity({ ...note, event: 'permission' }), 'warning');
  assert.equal(notificationSeverity({ ...note, event: 'error' }), 'error');
  assert.equal(notificationSeverity(note), 'info');
});

test('native delivery starts while focused-peer discovery is still pending', async () => {
  let finish: (value: boolean) => void = () => {}; let native = 0;
  const pending = new Promise<boolean>(resolve => { finish = resolve; });
  const presenter = createPresenter({ options: () => ({ mode: 'both', enabled: true, focused: false, sound: false, events: {} }),
    app: () => {}, relay: () => pending, system: async () => { native++; }, log: () => {} });
  const delivery = presenter.deliver(note);
  await Promise.resolve(); assert.equal(native, 1);
  finish(false); await delivery;
});

test('native failure after settings disablement does not show a new app fallback', async () => {
  const options: PresenterOptions = { mode: 'system', enabled: true, focused: false, sound: false, events: {} };
  let app = 0;
  const presenter = createPresenter({ options: () => options, app: () => { app++; },
    system: async () => { options.enabled = false; throw new Error('unavailable'); }, log: () => {} });
  await presenter.deliver(note); assert.equal(app, 0);
});

test('failed local app presentation still emits the native notification in both mode', async () => {
  let native = 0;
  const presenter = createPresenter({ options: () => ({ mode: 'both', enabled: true, focused: true, sound: false, events: {} }),
    app: () => { throw new Error('app UI unavailable'); }, system: async () => { native++; }, log: () => {} });
  await presenter.deliver(note); assert.equal(native, 1);
});

test('plugin privacy preferences remain hidden in app and native labels while routing retains context', async () => {
  const { createController } = await import('../../plugin/src/controller.js');
  const { defaultConfig } = await import('../../plugin/src/config.js');
  const { notificationLabel } = await import('../src/policy.js');
  for (const showProjectName of [false, true]) for (const showSessionTitle of [false, true]) {
    const labels: string[] = []; const contexts: Notification[] = [];
    const presenter = createPresenter({ options: () => ({ mode: 'both', enabled: true, focused: true, sound: false, events: {} }),
      app: value => { labels.push(notificationLabel(value)); contexts.push(value); },
      system: async value => { labels.push(notificationLabel(value)); contexts.push(value); }, log: () => {} });
    const controller = createController({ config: { ...defaultConfig, showProjectName, showSessionTitle }, directory: '/private/secret-project',
      instanceId: 'instance', now: () => 1000, session: async id => ({ id, title: 'Confidential session' }),
      send: value => presenter.deliver(value), log: () => {} });
    await controller.event({ type: 'question.asked', properties: { sessionID: 'private-session-id', id: 'q1' } });
    assert.equal(labels.length, 2);
    for (const label of labels) {
      assert.equal(label.includes('secret-project'), showProjectName);
      assert.equal(label.includes('Confidential session'), showSessionTitle);
      assert.ok(!label.includes('private-session-id')); assert.ok(!label.includes('/private/'));
      assert.match(label, /OpenCode.*Question/u);
    }
    assert.equal(contexts[0]?.project, 'secret-project'); assert.equal(contexts[0]?.sessionId, 'private-session-id');
  }
});
