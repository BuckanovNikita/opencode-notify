import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SourceRegistry, type ProcessIdentity } from '../src/sources.js';

const source = { version: 1 as const, instanceId: 'instance-a', pid: 30, parentPid: 20, startedAt: 3000, directory: '/same' };
const shell = { pid: 10, parentPid: 1, startedAt: 1000 };
const processes = () => new Map<number, ProcessIdentity>([[10, shell], [20, { pid: 20, parentPid: 10, startedAt: 2000 }], [30, { pid: 30, parentPid: 20, startedAt: 3000 }]]);

test('manual node/npm ancestry binds exact object and survives source exit until terminal closes', async () => {
  const rows = processes();
  const registry = new SourceRegistry<object>(async pid => rows.get(pid));
  const terminal = {};
  await registry.observe(terminal, 10);
  await registry.register(source);
  rows.delete(30); rows.delete(20);
  assert.deepEqual(registry.resolve({ instanceId: source.instanceId }), { kind: 'exact', terminal });
  registry.close(terminal);
  assert.deepEqual(registry.resolve({ instanceId: source.instanceId }), { kind: 'unavailable' });
  await registry.observe({}, 10);
  await registry.register(source);
  assert.deepEqual(registry.resolve({ instanceId: source.instanceId }), { kind: 'unavailable' });
});

test('PID reuse, inconsistent parent and inspection failure never guess the only terminal', async () => {
  for (const variant of ['reuse', 'parent', 'failure']) {
    const rows = processes();
    const registry = new SourceRegistry<object>(async pid => {
      if (variant === 'failure') throw new Error('inspection denied');
      return rows.get(pid);
    });
    await registry.observe({}, 10);
    if (variant === 'reuse') rows.set(10, { ...shell, startedAt: 5000 });
    await registry.register({ ...source, ...(variant === 'parent' ? { parentPid: 99 } : {}) });
    assert.deepEqual(registry.resolve({ instanceId: source.instanceId }), { kind: 'unavailable' });
  }
});

test('same-directory all-node terminals remain distinct; ambiguous candidates are ancestry-related only', async () => {
  const rows = processes(); rows.set(11, { pid: 11, parentPid: 1, startedAt: 1000 });
  const registry = new SourceRegistry<object>(async pid => rows.get(pid));
  const first = {}; const second = {}; const unrelated = {};
  await registry.observe(first, 10); await registry.observe(second, 10); await registry.observe(unrelated, 11);
  await registry.register(source);
  assert.deepEqual(registry.resolve({ instanceId: source.instanceId }), { kind: 'ambiguous', terminals: [first, second] });
  await registry.register({ ...source, instanceId: 'instance-b', pid: 11, parentPid: 1, startedAt: 1000 });
  assert.deepEqual(registry.resolve({ instanceId: 'instance-b' }), { kind: 'exact', terminal: unrelated });
  assert.deepEqual(registry.resolve({}), { kind: 'unavailable' });
});

test('extension terminal IDs take precedence; repeated identities cannot replace bindings', async () => {
  const rows = processes();
  const registry = new SourceRegistry<object>(async pid => rows.get(pid));
  const terminal = {}; await registry.observe(terminal, 10, 'created-terminal');
  await registry.register({ ...source, terminalId: 'created-terminal' });
  await registry.register({ ...source, pid: 99, terminalId: 'other' });
  assert.deepEqual(registry.resolve({ instanceId: source.instanceId }), { kind: 'exact', terminal });
  registry.close(terminal);
  assert.deepEqual(registry.resolve({ terminalId: 'created-terminal' }), { kind: 'unavailable' });
});

test('real host process identity matches plugin startup metadata', async () => {
  const { inspectProcess } = await import('../src/sources.js');
  const identity = await inspectProcess(process.pid);
  assert.ok(identity);
  assert.equal(identity.pid, process.pid);
  assert.equal(identity.parentPid, process.ppid);
  assert.ok(Math.abs(identity.startedAt - (Date.now() - process.uptime() * 1000)) < 1500);
  const registry = new SourceRegistry<object>();
  const terminal = {};
  await registry.observe(terminal, process.pid);
  await registry.register({ ...source, pid: process.pid, parentPid: process.ppid, startedAt: Date.now() - process.uptime() * 1000 });
  assert.deepEqual(registry.resolve({ instanceId: source.instanceId }), { kind: 'exact', terminal });
});

test('terminal PID reuse inside registration clock tolerance is rejected', async () => {
  const rows = processes();
  const registry = new SourceRegistry<object>(async pid => rows.get(pid));
  await registry.observe({}, 10);
  rows.set(10, { ...shell, startedAt: 1100 });
  await registry.register(source);
  assert.deepEqual(registry.resolve({ instanceId: source.instanceId }), { kind: 'unavailable' });
});

test('closure during inspection cannot revive a terminal object', async () => {
  let resume: (() => void) | undefined;
  const registry = new SourceRegistry<object>(async pid => {
    await new Promise<void>(resolve => { resume = resolve; });
    return { pid, parentPid: 1, startedAt: 1000 };
  });
  const terminal = {};
  const observed = registry.observe(terminal, 10, 'created');
  registry.close(terminal); resume!(); await observed;
  assert.deepEqual(registry.resolve({ terminalId: 'created' }), { kind: 'unavailable' });
});

test('identical registration retries transient inspection failure without changing identity', async () => {
  const rows = processes(); let fail = false;
  const registry = new SourceRegistry<object>(async pid => { if (fail) throw new Error('temporary'); return rows.get(pid); });
  const terminal = {}; await registry.observe(terminal, 10);
  fail = true; await registry.register(source);
  assert.deepEqual(registry.resolve({ instanceId: source.instanceId }), { kind: 'unavailable' });
  fail = false; await registry.register(source);
  assert.deepEqual(registry.resolve({ instanceId: source.instanceId }), { kind: 'exact', terminal });
});

test('missing explicit terminal ID cannot fall through to another live ancestor terminal', async () => {
  const rows = processes(); const registry = new SourceRegistry<object>(async pid => rows.get(pid));
  await registry.observe({}, 10);
  await registry.register({ ...source, terminalId: 'closed-or-unknown' });
  assert.deepEqual(registry.resolve({ instanceId: source.instanceId }), { kind: 'unavailable' });
});

test('overlapping immutable source registrations preserve one exact terminal binding', async () => {
  const rows = processes();
  const registry = new SourceRegistry<object>(async pid => rows.get(pid));
  const terminal = {};
  await registry.observe(terminal, 10);
  await Promise.all([registry.register(source), registry.register(source), registry.register(source)]);
  assert.deepEqual(registry.resolve({ instanceId: source.instanceId }), { kind: 'exact', terminal });
});
