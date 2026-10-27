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

test('source registration requires authentication and validates before invoking callback', async t => {
  const received: unknown[] = [];
  const router = await startRouter({ deliver: async () => {}, register: async source => { received.push(source); }, log: () => {} });
  t.after(() => router.close());
  const url = new URL('/sources', router.url);
  const source = { version: 1, instanceId: 'instance-a', pid: 30, parentPid: 20, startedAt: 3000, directory: '/demo' };
  const headers = { Authorization: `Bearer ${router.token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify(source) })).status, 401);
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...source, pid: -1 }) })).status, 400);
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify(source) })).status, 202);
  assert.deepEqual(received, [source]);
});

test('registration failure remains nonfatal to notification forwarding', async t => {
  let deliveries = 0;
  const router = await startRouter({ deliver: async () => { deliveries++; }, register: async () => { throw new Error('inspection unavailable'); }, log: () => {} });
  t.after(() => router.close());
  const headers = { Authorization: `Bearer ${router.token}`, 'Content-Type': 'application/json' };
  const source = { version: 1, instanceId: 'instance-a', pid: 30, parentPid: 20, startedAt: 3000, directory: '/demo' };
  assert.equal((await fetch(new URL('/sources', router.url), { method: 'POST', headers, body: JSON.stringify(source) })).status, 503);
  await createTransport(router.url, router.token)(note);
  assert.equal(deliveries, 1);
});
