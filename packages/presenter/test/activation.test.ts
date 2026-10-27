import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createActivationTargets } from '../src/activation.js';
import type { Notification } from '../../protocol/src/index.js';

const note: Notification = { version: 1, id: 'n', event: 'complete', sessionId: 's', project: 'p', directory: '/project', title: 'Done', message: 'Complete', occurredAt: 1, terminalId: 'terminal', instanceId: 'instance', sessionTitle: 'Session' };

test('opaque activation foregrounds origin and passes the complete notification contract', async () => {
  const calls: unknown[] = [];
  const targets = createActivationTargets({ foreground: async () => { calls.push('foreground'); return true; }, focus: async value => { calls.push(value); },
    uri: async id => `uri:${id}`, open: async uri => { calls.push(uri); return true; } });
  const id = targets.register(note);
  assert.notEqual(id, note.id); await targets.activate(id);
  assert.deepEqual(calls, ['foreground', note]);
  await targets.activate('caller-supplied'); assert.equal(calls.length, 2);
  await targets.activate(id); assert.equal(calls.length, 4); // Native timeout/dismiss does not consume the target.
});

test('origin-generated URI resumes the exact target and bounded targets expire or close', async () => {
  let now = 10; const calls: unknown[] = [];
  const targets = createActivationTargets({ foreground: async () => false, focus: async value => { calls.push(value); }, uri: async id => `origin:${id}`,
    open: async uri => { calls.push(uri); return true; }, now: () => now, limit: 2, lifetime: 100 });
  const id = targets.register(note); await targets.activate(id);
  assert.deepEqual(calls, [`origin:${id}`]);
  await targets.resume(id); assert.deepEqual(calls, [`origin:${id}`, note]);
  targets.register({ ...note, id: 'n2' }); targets.register({ ...note, id: 'n3' });
  await targets.resume(id); assert.equal(calls.length, 2);
  const recent = targets.register({ ...note, id: 'n4' }); now = 111;
  await targets.activate(recent); assert.equal(calls.length, 2);
  const closed = targets.register(note); targets.dispose(); await targets.activate(closed); await targets.resume(closed);
  assert.equal(calls.length, 2);
});

test('foreground command must focus the current window or activation falls back to origin URI', async () => {
  const { createForegroundWindow } = await import('../src/activation.js');
  let focused = false; const calls: string[] = [];
  const foreground = createForegroundWindow({ focused: () => focused, commands: async () => ['workbench.action.focusWindow', 'workbench.action.switchWindow'],
    execute: async command => { calls.push(command); }, log: () => {} });
  assert.equal(await foreground(), false); // Resolved command alone does not establish foreground ownership.
  assert.deepEqual(calls, ['workbench.action.focusWindow']);
  const targets = createActivationTargets({ foreground, focus: async () => { calls.push('terminal'); }, uri: async id => `origin:${id}`,
    open: async uri => { calls.push(uri); return true; } });
  const id = targets.register(note); await targets.activate(id);
  assert.equal(calls.at(-1), `origin:${id}`); assert.ok(!calls.includes('terminal'));
  focused = true; const before = calls.length; assert.equal(await foreground(), true); assert.equal(calls.length, before);
  const absent = createForegroundWindow({ focused: () => false, commands: async () => ['workbench.action.switchWindow'],
    execute: async () => { throw new Error('unrelated window command must not run'); }, log: () => {} });
  assert.equal(await absent(), false);
  focused = false;
  const successful = createForegroundWindow({ focused: () => focused, commands: async () => ['workbench.action.focusWindow'],
    execute: async () => { focused = true; }, log: () => {} });
  assert.equal(await successful(), true);
});

test('foreground command waits for the asynchronous window focus state before URI fallback', async () => {
  const { createForegroundWindow } = await import('../src/activation.js');
  let focused = false;
  const foreground = createForegroundWindow({
    focused: () => focused,
    commands: async () => ['workbench.action.focusWindow'],
    execute: async () => { setTimeout(() => { focused = true; }, 25); },
    log: assert.fail,
  });
  assert.equal(await foreground(), true);
});
