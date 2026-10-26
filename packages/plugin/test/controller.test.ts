import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createController } from '../src/controller.js';
import { defaultConfig } from '../src/config.js';
import type { Notification } from '../../protocol/src/index.js';

function harness(options = {}) {
  const sent: Notification[] = [];
  let now = 1000;
  const controller = createController({
    config: { ...defaultConfig, ...options }, directory: '/work/demo', instanceId: 'instance',
    now: () => now, send: async event => { sent.push(event); },
    session: async id => ({ id, title: 'Fix tests' }), log: () => {},
  });
  const event = (type: string, properties: Record<string, unknown>) => controller.event({ type, properties });
  const busy = () => event('session.status', { sessionID: 's1', status: { type: 'busy' } });
  const idle = () => event('session.status', { sessionID: 's1', status: { type: 'idle' } });
  const success = (id = 'm1') => event('message.updated', { info: {
    id, sessionID: 's1', role: 'assistant', finish: 'stop', time: { created: 1001, completed: now },
  } });
  return { sent, event, busy, idle, success, controller, advance: (ms: number) => { now += ms; } };
}

test('successful run emits once despite both idle events and repeated busy updates', async () => {
  const h = harness({ minDurationMs: 100 });
  await h.busy(); h.advance(150); await h.busy(); await h.success();
  await Promise.all([h.idle(), h.event('session.idle', { sessionID: 's1' })]);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0]?.event, 'complete');
});

test('idle alone, tool continuations, and cancellation before error are not completions', async () => {
  const h = harness();
  await h.idle(); await h.busy(); await h.idle();
  await h.event('session.error', { sessionID: 's1', error: { name: 'MessageAbortedError' } });
  assert.equal(h.sent.length, 0);
});

test('final assistant update after idle still completes the active run', async () => {
  const h = harness(); await h.busy(); await h.idle(); await h.success();
  assert.equal(h.sent.length, 1);
});

test('questions and permissions bypass duration thresholds and duplicate events', async () => {
  const h = harness({ minDurationMs: 60_000 }); await h.busy();
  const p = { sessionID: 's1', id: 'q1', tool: { callID: 'call1' } };
  await h.event('question.asked', p); await h.event('question.asked', p);
  await h.event('permission.updated', { sessionID: 's1', id: 'p1' });
  await h.event('permission.asked', { sessionID: 's1', id: 'p1' });
  await h.idle();
  assert.deepEqual(h.sent.map(n => n.event), ['question', 'permission']);
});

test('child completions are off by default; child requests for input still alert', async () => {
  const h = harness();
  await h.event('session.created', { info: { id: 's1', parentID: 'parent', title: 'Child' } });
  await h.busy(); await h.success(); await h.idle();
  await h.event('question.asked', { sessionID: 's1', id: 'q1' });
  assert.deepEqual(h.sent.map(n => n.event), ['question']);
});

test('errors notify once and block a later success/idle completion', async () => {
  const h = harness(); await h.busy();
  const error = { sessionID: 's1', error: { name: 'APIError', data: { message: 'failure' } } };
  await h.event('session.error', error); await h.event('session.error', error);
  await h.success(); await h.idle();
  assert.deepEqual(h.sent.map(n => n.event), ['error']);
});

test('independent sessions and subsequent turns are not deduplicated together', async () => {
  const h = harness(); await h.busy(); await h.success(); await h.idle();
  h.advance(100); await h.busy();
  await h.event('message.updated', { info: { id: 'm2', sessionID: 's1', role: 'assistant',
    finish: 'stop', time: { created: 1101, completed: 1200 } } });
  await h.idle();
  assert.equal(h.sent.length, 2);
  assert.notEqual(h.sent[0]?.id, h.sent[1]?.id);
});

test('stale successful messages and unfinished tool calls cannot complete a new run', async () => {
  const h = harness(); await h.busy(); await h.success(); await h.idle();
  h.advance(500); await h.busy(); await h.success('old-message');
  await h.event('message.updated', { info: { id: 'tools', sessionID: 's1', role: 'assistant',
    finish: 'tool-calls', time: { created: 1501, completed: 1550 } } });
  await h.idle();
  assert.equal(h.sent.length, 1);
});

test('multiple pending requests must all resolve before completion', async () => {
  const h = harness(); await h.busy();
  await h.event('question.asked', { sessionID: 's1', id: 'q1' });
  await h.event('permission.updated', { sessionID: 's1', id: 'p1' });
  await h.event('permission.replied', { sessionID: 's1', permissionID: 'p1' });
  await h.success(); await h.idle();
  assert.equal(h.sent.length, 2);
  await h.event('question.replied', { sessionID: 's1', requestID: 'q1' });
  await h.idle();
  assert.equal(h.sent[2]?.event, 'complete');
});

test('a resumed child is classified using SDK metadata and supports opt-in completion', async () => {
  for (const enabled of [false, true]) {
    const sent: Notification[] = [];
    const controller = createController({ config: { ...defaultConfig,
      events: { ...defaultConfig.events, subagent_complete: enabled } },
      directory: '/demo', instanceId: 'test', now: () => 1000,
      session: async id => ({ id, parentID: 'parent', title: 'Resumed child' }),
      send: async n => { sent.push(n); }, log: assert.fail });
    await controller.event({ type: 'session.status', properties: { sessionID: 'child', status: { type: 'busy' } } });
    await controller.event({ type: 'message.updated', properties: { info: { id: 'm1', sessionID: 'child',
      role: 'assistant', finish: 'stop', time: { created: 1000, completed: 1001 } } } });
    await controller.event({ type: 'session.idle', properties: { sessionID: 'child' } });
    assert.deepEqual(sent.map(n => n.event), enabled ? ['subagent_complete'] : []);
  }
});

test('a disconnected router logs failure without rejecting an OpenCode hook', async () => {
  const logs: string[] = [];
  const controller = createController({ config: defaultConfig, directory: '/demo', instanceId: 'test',
    now: () => 1000, session: async id => ({ id }), send: async () => { throw new Error('offline'); }, log: m => logs.push(m) });
  await controller.event({ type: 'question.asked', properties: { sessionID: 's1', id: 'q1' } });
  assert.equal(logs.length, 1); assert.match(logs[0]!, /offline/);
});

test('current user-message identity tolerates event delivery clock skew', async () => {
  const h = harness();
  await h.event('message.updated', { info: { id: 'user-current', sessionID: 's1', role: 'user' } });
  await h.busy();
  await h.event('message.updated', { info: { id: 'answer-current', sessionID: 's1', role: 'assistant',
    parentID: 'user-current', finish: 'stop', time: { created: 999, completed: 1000 } } });
  await h.idle();
  assert.equal(h.sent.length, 1);
  await h.event('message.updated', { info: { id: 'user-next', sessionID: 's1', role: 'user' } });
  await h.busy();
  await h.event('message.updated', { info: { id: 'old-answer', sessionID: 's1', role: 'assistant',
    parentID: 'user-current', finish: 'stop', time: { created: 2000, completed: 2001 } } });
  await h.idle();
  assert.equal(h.sent.length, 1, 'Wrong parent must not complete the new turn');
});

test('a queued prompt invalidates the previous successful assistant before cancellation', async () => {
  const h = harness();
  await h.event('message.updated', { info: { id: 'u1', sessionID: 's1', role: 'user' } });
  await h.busy();
  await h.event('message.updated', { info: { id: 'a1', parentID: 'u1', sessionID: 's1', role: 'assistant',
    finish: 'stop', time: { created: 1001, completed: 1002 } } });
  await h.event('message.updated', { info: { id: 'u2', sessionID: 's1', role: 'user' } });
  await h.busy(); await h.idle();
  await h.event('session.error', { sessionID: 's1', error: { name: 'MessageAbortedError' } });
  assert.deepEqual(h.sent, []);
});

test('a late assistant error invalidates completion and notifies without session.error', async () => {
  const h = harness(); await h.busy(); await h.success();
  await h.event('message.updated', { info: { id: 'm1', sessionID: 's1', role: 'assistant',
    finish: 'stop', time: { created: 1001, completed: 1002 }, error: { name: 'StructuredOutputError' } } });
  await h.idle();
  await h.event('session.error', { sessionID: 's1', error: { name: 'StructuredOutputError' } });
  assert.deepEqual(h.sent.map(n => n.event), ['error']);
});

test('compaction summary messages are not successful task completion evidence', async () => {
  const h = harness(); await h.busy();
  await h.event('message.updated', { info: { id: 'summary', sessionID: 's1', role: 'assistant', summary: true,
    finish: 'stop', time: { created: 1001, completed: 1002 } } });
  await h.idle();
  assert.deepEqual(h.sent, []);
});

test('a terminal structured result overrides tool-calls and unknown model finishes', async () => {
  for (const finish of ['tool-calls', 'unknown']) {
    const h = harness(); await h.busy();
    await h.event('message.updated', { info: { id: 'structured', sessionID: 's1', role: 'assistant',
      structured: { answer: 'OK' }, finish, time: { created: 1001, completed: 1002 } } });
    await h.idle();
    assert.deepEqual(h.sent.map(n => n.event), ['complete'], finish);
  }
});
