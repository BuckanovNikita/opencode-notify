import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseNotification, MAX_BODY_BYTES } from '../src/index.js';

export const example = {
  version: 1, id: 'instance:session:1', event: 'complete', sessionId: 'ses_1',
  project: 'my-project', directory: '/work/my-project', title: 'OpenCode · my-project',
  message: 'Completed: fix tests', occurredAt: 1234,
};

test('wire contract accepts each supported event and optional routing hints', () => {
  for (const event of ['complete', 'question', 'permission', 'error', 'subagent_complete']) {
    assert.equal(parseNotification({ ...example, event, display: 'system', terminalId: 't1' }).event, event);
  }
  assert.equal(MAX_BODY_BYTES, 65_536);
});

test('wire contract rejects malformed, oversized and future-version messages', () => {
  for (const input of [null, [], {}, { ...example, version: 2 }, { ...example, event: 'shell' },
    { ...example, message: 'x'.repeat(8193) }, { ...example, title: '\x1b]9;escape' },
    { ...example, occurredAt: Number.NaN }, { ...example, sessionId: '' },
    { ...example, display: 'execute' }, { ...example, display: ['app'] }, { ...example, terminalId: 3 }]) {
    assert.throws(() => parseNotification(input));
  }
});

test('wire parser copies supported data and strips unexpected properties', () => {
  const parsed = parseNotification({ ...example, command: 'do not execute', token: 'secret' });
  assert.deepEqual(parsed, example);
});

test('optional source identity and both mode survive notification validation', () => {
  assert.deepEqual(parseNotification({ ...example, instanceId: 'instance', sessionTitle: 'Work', display: 'both' }),
    { ...example, instanceId: 'instance', sessionTitle: 'Work', display: 'both' });
});

test('source registration is bounded, strips unknown data and validates process identity', async () => {
  const protocol = await import('../src/index.js');
  assert.equal(typeof protocol.parseSourceRegistration, 'function');
  const source = { version: 1, instanceId: 'i', pid: 120, parentPid: 12, startedAt: 1000,
    directory: '/same/project', terminalId: 'created' };
  assert.deepEqual(protocol.parseSourceRegistration({ ...source, command: 'forbidden' }), source);
  for (const invalid of [{ pid: 0 }, { pid: 1.5 }, { parentPid: -1 }, { startedAt: NaN },
    { instanceId: '' }, { directory: 'x'.repeat(4097) }, { version: 2 }]) {
    assert.throws(() => protocol.parseSourceRegistration({ ...source, ...invalid }));
  }
});

test('relay and activation contracts contain only opaque validated targets', async () => {
  const protocol = await import('../src/index.js');
  assert.equal(typeof protocol.parseRelay, 'function');
  const relay = { version: 1, notification: example, origin: { peerId: 'source', targetId: 'random' } };
  assert.deepEqual(protocol.parseRelay({ ...relay, url: 'http://remote' }), relay);
  assert.deepEqual(protocol.parseActivation({ version: 1, targetId: 'random', command: 'anything' }),
    { version: 1, targetId: 'random' });
  assert.throws(() => protocol.parseRelay({ ...relay, origin: { peerId: '', targetId: 't' } }));
  assert.throws(() => protocol.parseActivation({ version: 1, targetId: '' }));
});

test('focus target accepts legacy presenter hints without inventing a source', async () => {
  const protocol = await import('../src/index.js');
  assert.equal(typeof protocol.parseFocusTarget, 'function');
  const target = protocol.parseFocusTarget({ terminalId: 'created', directory: '/project' });
  assert.equal(target.terminalId, 'created'); assert.equal(target.directory, '/project');
  assert.equal(target.instanceId, undefined);
  assert.equal(protocol.parseFocusTarget({ directory: '/project' }).terminalId, undefined);
  assert.equal(protocol.parseFocusTarget({ ...example, instanceId: 'registered' }).instanceId, 'registered');
  assert.throws(() => protocol.parseFocusTarget({ terminalId: '\u001b' }));
  assert.throws(() => protocol.parseFocusTarget({ version: 2, terminalId: 'created' }));
});
