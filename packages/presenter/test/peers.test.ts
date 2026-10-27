import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createPeers, sharedPeerDirectory } from '../src/peers.js';
import type { Relay } from '../../protocol/src/index.js';

const relay: Relay = { version: 1, notification: { version: 1, id: 'note', event: 'complete', sessionId: 's', project: 'p', directory: '/p', title: 'OpenCode', message: 'Done', occurredAt: 1 }, origin: { peerId: 'origin', targetId: 'opaque' } };

test('profile storage shares peers within one installation only', () => {
  assert.equal(sharedPeerDirectory('/data/User/globalStorage/publisher.extension'), '/data/User/globalStorage/opencode-notify-peers');
  assert.equal(sharedPeerDirectory('/data/User/profiles/abc/globalStorage/publisher.extension'), '/data/User/globalStorage/opencode-notify-peers');
  assert.notEqual(sharedPeerDirectory('/other/User/globalStorage/publisher.extension'), sharedPeerDirectory('/data/User/globalStorage/publisher.extension'));
});

test('real authenticated peers relay to focused enabled windows and route opaque activation', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'notify-peers-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let focused = true; let enabled = true; let received = 0; const targets: string[] = [];
  const origin = await createPeers({ directory, available: () => false, receive: () => false, activate: async id => { targets.push(id); }, log: () => {} });
  const receiver = await createPeers({ directory, available: () => focused && enabled, receive: () => { if (!focused || !enabled) return false; received++; return true; }, activate: async () => {}, log: () => {} });
  t.after(async () => { await origin.dispose(); await receiver.dispose(); });
  const value = { ...relay, origin: { peerId: origin.id, targetId: 'opaque' } };
  assert.equal(await origin.relay(value), true); assert.equal(received, 1);
  assert.equal(await receiver.activate(value.origin), true); assert.deepEqual(targets, ['opaque']);
  const files = await readdir(directory);
  const receiverRecord = JSON.parse(await readFile(join(directory, `${receiver.id}.json`), 'utf8')) as { port: number; token: string };
  assert.equal((await fetch(`http://127.0.0.1:${receiverRecord.port}/status`)).status, 401);
  assert.equal((await fetch(`http://127.0.0.1:${receiverRecord.port}/relay`, { method: 'POST', headers: { authorization: `Bearer ${receiverRecord.token}`, 'content-type': 'application/json' }, body: '{}' })).status, 400);
  assert.equal(files.length, 2);
  if (process.platform !== 'win32') assert.equal((await stat(join(directory, `${receiver.id}.json`))).mode & 0o777, 0o600);
  focused = false; assert.equal(await origin.relay(value), false); assert.equal(received, 1);
  focused = true; enabled = false; assert.equal(await origin.relay(value), false);
  await receiver.dispose(); assert.equal(await origin.relay(value), false);
  const reloaded = await createPeers({ directory, available: () => true, receive: () => true, activate: async () => {}, log: () => {} });
  t.after(() => reloaded.dispose());
  assert.notEqual(reloaded.id, receiver.id);
  assert.equal(await receiver.activate(value.origin), false);
});

test('receipt rechecks a focus race and oversized bodies are rejected', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'notify-peers-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let receive = 0;
  const peer = await createPeers({ directory, available: () => true, receive: () => { receive++; return false; }, activate: async () => {}, log: () => {} });
  t.after(() => peer.dispose());
  const record = JSON.parse(await readFile(join(directory, `${peer.id}.json`), 'utf8')) as { port: number; token: string };
  const post = (body: string) => fetch(`http://127.0.0.1:${record.port}/relay`, { method: 'POST', headers: { authorization: `Bearer ${record.token}`, 'content-type': 'application/json' }, body });
  assert.equal((await post(JSON.stringify(relay))).status, 409); assert.equal(receive, 1);
  assert.equal((await post('x'.repeat(70_000))).status, 413);
});

test('browser requests, wrong content types and unknown activation targets are rejected', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'notify-peers-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let activation = 0;
  const peer = await createPeers({ directory, available: () => true, receive: () => true,
    activate: async () => { activation++; return false; }, log: () => {} });
  t.after(() => peer.dispose());
  const record = JSON.parse(await readFile(join(directory, `${peer.id}.json`), 'utf8')) as { port: number; token: string };
  const url = `http://127.0.0.1:${record.port}`;
  const headers = { authorization: `Bearer ${record.token}` };
  assert.equal((await fetch(`${url}/status`, { headers: { ...headers, origin: 'http://localhost' } })).status, 403);
  assert.equal((await fetch(`${url}/activate`, { method: 'POST', headers, body: '{}' })).status, 415);
  assert.equal((await fetch(`${url}/activate`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ version: 1, targetId: 'not-owned' }) })).status, 404);
  assert.equal(activation, 1);
});

test('real peer delivery deduplicates across retries and never broadcasts from the receiver', async t => {
  const { createPresenter } = await import('../src/policy.js');
  const directory = await mkdtemp(join(tmpdir(), 'notify-peers-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const channels: string[] = [];
  const presenter = createPresenter({ options: () => ({ enabled: true, focused: true, trusted: true, mode: 'both', sound: false, events: {} }),
    app: () => { channels.push('app'); }, system: async () => { channels.push('system'); }, relay: async () => { channels.push('relay'); return true; }, log: () => {} });
  const origin = await createPeers({ directory, available: () => false, receive: () => false, activate: async () => {}, log: () => {} });
  const receiver = await createPeers({ directory, available: () => true, receive: value => presenter.receive(value), activate: async () => {}, log: () => {} });
  t.after(async () => { await origin.dispose(); await receiver.dispose(); });
  assert.equal(await origin.relay(relay), true); assert.equal(await origin.relay(relay), true);
  assert.deepEqual(channels, ['app']);
});

test('stale closed-window records are pruned while current records remain private', async t => {
  const { utimes, writeFile } = await import('node:fs/promises');
  const directory = await mkdtemp(join(tmpdir(), 'notify-peers-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const stale = '00000000-0000-0000-0000-000000000000.json';
  const path = join(directory, stale);
  await writeFile(path, JSON.stringify({ id: stale.slice(0, -5), token: 'a'.repeat(64), port: 1 }), { mode: 0o600 });
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000); await utimes(path, old, old);
  const peer = await createPeers({ directory, available: () => false, receive: () => false, activate: async () => {}, log: () => {} });
  t.after(() => peer.dispose());
  assert.equal(await peer.relay(relay), false);
  assert.deepEqual(await readdir(directory), [`${peer.id}.json`]);
});
