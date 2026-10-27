import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connect } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWindowsNotifications, type HelperError, type LaunchHelper } from '../src/windows.js';

const notification = { version: 1 as const, id: 'test', event: 'complete' as const, sessionId: 's', project: 'demo', directory: '/demo', title: 'Title', message: 'Body', occurredAt: 1 };
async function fixture(t: { after(fn: () => void | Promise<void>): void }, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'toast-'));
  const pipeName = join(directory, 'callback.sock');
  const calls: { args: string[]; finish: (error: HelperError | null) => void }[] = [];
  const launch: LaunchHelper = (_path, args, finish) => { calls.push({ args, finish }); return { kill() {} }; };
  const adapter = createWindowsNotifications('helper.exe', () => {}, { pipeName, launch, ...overrides });
  t.after(async () => { adapter.dispose(); await rm(directory, { recursive: true, force: true }); });
  const send = async (id: string, action: string, fragments = false) => {
    const bytes = Buffer.from(`action=${action};notificationId=${id};pipe=${pipeName};version=0.7.0;`, 'utf16le');
    await new Promise<void>((resolve, reject) => {
      const socket = connect(pipeName);
      socket.on('error', reject);
      socket.on('close', () => resolve());
      socket.on('connect', async () => {
        if (fragments) { for (const byte of bytes) { socket.write(Buffer.from([byte])); await new Promise(resolve => setImmediate(resolve)); } socket.end(); }
        else socket.end(bytes);
      });
    });
  };
  const notify = async (click: () => void) => {
    const before = calls.length;
    const result = adapter.notify(notification, false, click);
    while (calls.length === before) await new Promise(resolve => setImmediate(resolve));
    return { result, id: calls.at(-1)!.args[calls.at(-1)!.args.indexOf('-id') + 1]! };
  };
  return { adapter, calls, send, notify };
}

test('banner timeout retains late fragmented UTF-16 Notification Center activation and deduplicates', async t => {
  const f = await fixture(t); let clicks = 0;
  const { result, id } = await f.notify(() => clicks++);
  await f.send(id, 'timedout', true); await result;
  await f.send(id, 'clicked', true); await f.send(id, 'clicked');
  assert.equal(clicks, 1);
});

test('simultaneous callbacks stay with their originating toast', async t => {
  const f = await fixture(t); const clicks: string[] = [];
  const a = await f.notify(() => clicks.push('a'));
  const secondResult = f.adapter.notify(notification, true, () => clicks.push('b'));
  while (f.calls.length < 2) await new Promise(resolve => setImmediate(resolve));
  const b = f.calls[1]!.args[f.calls[1]!.args.indexOf('-id') + 1]!;
  await f.send(b, 'clicked'); await f.send(a.id, 'clicked');
  await Promise.all([a.result, secondResult]); assert.deepEqual(clicks, ['b', 'a']);
});

test('missing helper, failure status and deadline reject instead of claiming delivery', async t => {
  const f = await fixture(t, { confirmationTimeoutMs: 20 });
  const a = await f.notify(assert.fail); const rejected = assert.rejects(a.result, /missing/);
  f.calls[0]!.finish(Object.assign(new Error('missing'), { code: 'ENOENT' })); await rejected;
  const b = f.adapter.notify(notification, false, assert.fail);
  while (f.calls.length < 2) await new Promise(resolve => setImmediate(resolve));
  f.calls[1]!.finish(Object.assign(new Error('failed'), { code: -1 })); await assert.rejects(b, /failed/);
  const c = f.adapter.notify(notification, false, assert.fail);
  await assert.rejects(c, /confirmation/);
});

test('benign SnoreToast exit status is accepted and callback targets are bounded', async t => {
  const f = await fixture(t, { maxTargets: 1 }); let clicks = 0;
  const a = await f.notify(() => clicks++);
  f.calls[0]!.finish(Object.assign(new Error('timed out'), { code: 3 })); await f.send(a.id, 'timedout'); await a.result;
  const result = f.adapter.notify(notification, false, () => clicks++);
  while (f.calls.length < 2) await new Promise(resolve => setImmediate(resolve));
  await f.send(a.id, 'clicked'); assert.equal(clicks, 0);
  f.calls[1]!.finish(Object.assign(new Error('dismissed'), { code: 2 }));
  const nextId = f.calls[1]!.args[f.calls[1]!.args.indexOf('-id') + 1]!;
  await f.send(nextId, 'dismissed'); await result;
});

test('expired targets and failed delivery cannot activate an app fallback again', async t => {
  const f = await fixture(t, { retentionMs: 20 }); let clicks = 0;
  const a = await f.notify(() => clicks++);
  f.calls[0]!.finish(null); await f.send(a.id, 'timedout'); await a.result;
  await new Promise(resolve => setTimeout(resolve, 30));
  await f.send(a.id, 'clicked'); assert.equal(clicks, 0);
  const result = f.adapter.notify(notification, false, () => clicks++);
  while (f.calls.length < 2) await new Promise(resolve => setImmediate(resolve));
  const id = f.calls[1]!.args[f.calls[1]!.args.indexOf('-id') + 1]!;
  const rejected = assert.rejects(result, /missing/);
  f.calls[1]!.finish(Object.assign(new Error('missing'), { code: 'ENOENT' })); await rejected;
  await f.send(id, 'clicked'); assert.equal(clicks, 0);
});

test('pending capacity and disposal reject bounded work', async t => {
  const f = await fixture(t, { maxTargets: 1 });
  const a = await f.notify(assert.fail);
  await assert.rejects(f.adapter.notify(notification, false, assert.fail), /capacity/);
  const rejected = assert.rejects(a.result, /disposed/); f.adapter.dispose(); await rejected;
  await assert.rejects(f.adapter.notify(notification, false, assert.fail), /disposed/);
});

test('only a complete valid connection frame activates', async t => {
  const f = await fixture(t); let clicks = 0;
  const a = await f.notify(() => clicks++);
  const socket = connect(f.calls[0]!.args[f.calls[0]!.args.indexOf('-pipeName') + 1]!);
  await new Promise<void>(resolve => socket.once('connect', resolve));
  socket.write(Buffer.from(`action=clicked;notificationId=${a.id};pipe=${f.calls[0]!.args[f.calls[0]!.args.indexOf('-pipeName') + 1]};version=0.7.0;`, 'utf16le'));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(clicks, 0);
  const closed = new Promise<void>(resolve => socket.once('close', () => resolve()));
  socket.end(Buffer.from('action=clicked;', 'utf16le')); await closed;
  assert.equal(clicks, 0); // Duplicate fields are ambiguous and rejected.
  await f.send(a.id, 'buttonClicked;button=Open OpenCode', true);
  await a.result; assert.equal(clicks, 1);
});

test('real helper stderr with exit zero rejects disabled-notification false confirmation', { skip: process.platform === 'win32' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'toast-helper-'));
  const helper = join(directory, 'helper');
  await writeFile(helper, `#!${process.execPath}\nprocess.stderr.write('Notifications are disabled');\n`, { mode: 0o700 });
  const adapter = createWindowsNotifications(helper, () => {}, { pipeName: join(directory, 'callback.sock') });
  t.after(async () => { adapter.dispose(); await rm(directory, { recursive: true, force: true }); });
  await assert.rejects(adapter.notify(notification, false, assert.fail), /helper reported an error/);
});

test('helper exit zero without a matching callback rejects unconfirmed native delivery', async t => {
  const f = await fixture(t, { callbackGraceMs: 10 });
  const a = await f.notify(assert.fail);
  const rejected = assert.rejects(a.result, /without.*callback|confirmation/);
  f.calls[0]!.finish(null);
  await rejected;
});

test('all benign exit statuses require and allow a real matching callback', async t => {
  const f = await fixture(t, { callbackGraceMs: 100 });
  for (const code of [0, 1, 2, 3, 4, 5]) {
    const a = await f.notify(() => {});
    f.calls.at(-1)!.finish(code === 0 ? null : Object.assign(new Error('benign native lifecycle exit'), { code }));
    await f.send(a.id, 'timedout', true); await a.result;
  }
});

test('helper error callback rejects promptly instead of awaiting process deadline', async t => {
  const f = await fixture(t);
  const a = await f.notify(assert.fail);
  const rejected = assert.rejects(a.result, /callback failure/);
  await f.send(a.id, 'error'); await rejected;
});
