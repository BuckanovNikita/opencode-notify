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
