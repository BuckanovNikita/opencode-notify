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
