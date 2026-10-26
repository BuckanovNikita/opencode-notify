import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startRouter } from '../src/server.js';
import { createTransport } from '../../plugin/src/transport.js';
import type { Notification } from '../../protocol/src/index.js';

const note: Notification = { version: 1, id: 'test:1', event: 'question', sessionId: 's1',
  project: 'demo', directory: '/demo', title: 'OpenCode', message: 'Answer needed', occurredAt: 1000 };

test('real HTTP authenticates, validates, deduplicates, and forwards notifications', async t => {
  const received: Notification[] = [];
  const router = await startRouter({ deliver: async n => { received.push(n); }, log: () => {} });
  t.after(() => router.close());
  assert.equal((await fetch(router.url, { method: 'POST', body: JSON.stringify(note) })).status, 401);
  const send = createTransport(router.url, router.token);
  await send(note); await send(note);
  assert.deepEqual(received, [note]);
  const headers = { Authorization: `Bearer ${router.token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(router.url, { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await fetch(router.url, { method: 'POST', headers, body: JSON.stringify({ ...note, version: 2 }) })).status, 400);
  assert.equal((await fetch(router.url, { method: 'POST', headers, body: 'x'.repeat(70_000) })).status, 413);
  assert.equal((await fetch(router.url, { method: 'POST', headers: { ...headers, Origin: 'https://example.com' }, body: JSON.stringify(note) })).status, 403);
});

test('a failed presenter remains retryable and concurrent duplicates deliver once', async t => {
  let calls = 0;
  let fail = true;
  const router = await startRouter({ deliver: async () => {
    calls++; await new Promise(resolve => setTimeout(resolve, 20));
    if (fail) throw new Error('presenter missing');
  }, log: () => {} });
  t.after(() => router.close());
  const send = createTransport(router.url, router.token);
  await assert.rejects(send(note), /503/);
  fail = false;
  await Promise.all([send(note), send(note)]);
  assert.equal(calls, 2);
});

test('transport refuses non-loopback endpoints before sending credentials', async () => {
  let fetched = false;
  const fakeFetch: typeof fetch = async () => { fetched = true; return new Response(); };
  await assert.rejects(createTransport('https://example.com/notify', 'secret', fakeFetch)(note), /loopback/);
  assert.equal(fetched, false);
});
