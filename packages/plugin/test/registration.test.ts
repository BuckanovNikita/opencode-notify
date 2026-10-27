import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenCodeNotify } from '../src/index.js';
import { parseNotification, parseSourceRegistration } from '../../protocol/src/index.js';

for (const sourceStatus of [200, 404]) {
  test(`startup registers identity; notifications survive source HTTP ${sourceStatus}`, async t => {
    const requests: { path: string | undefined; body: unknown }[] = [];
    const server = createServer(async (req, res) => {
      assert.equal(req.headers.authorization, 'Bearer test-secret');
      const chunks = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      requests.push({ path: req.url, body: JSON.parse(Buffer.concat(chunks).toString()) });
      res.writeHead(req.url === '/sources' ? sourceStatus : 200); res.end('{}');
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const addr = server.address(); assert.ok(addr && typeof addr !== 'string');
    const dir = await mkdtemp(join(tmpdir(), 'notify-registration-'));
    const keys = ['XDG_CONFIG_HOME', 'OPENCODE_NOTIFY_URL', 'OPENCODE_NOTIFY_TOKEN', 'OPENCODE_NOTIFY_TERMINAL_ID'];
    const previous = keys.map(key => process.env[key]);
    t.after(async () => {
      for (const [i, key] of keys.entries()) {
        if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i];
      }
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    });
    Object.assign(process.env, { XDG_CONFIG_HOME: dir, OPENCODE_NOTIFY_URL: `http://127.0.0.1:${addr.port}/notify`,
      OPENCODE_NOTIFY_TOKEN: 'test-secret', OPENCODE_NOTIFY_TERMINAL_ID: 'created-terminal' });
    const logs: string[] = [];
    const client = { session: { get: async () => ({ data: { title: 'Same project session' } }) },
      app: { log: async (input: { body: { message: string } }) => { logs.push(input.body.message); } } };
    const hooks = await OpenCodeNotify({ directory: '/same/project', client });
    assert.equal(requests[0]?.path, '/sources');
    const source = parseSourceRegistration(requests[0]?.body);
    assert.equal(source.pid, process.pid); assert.equal(source.parentPid, process.ppid);
    assert.ok(Math.abs(source.startedAt - (Date.now() - process.uptime() * 1000)) < 1000);
    assert.equal(source.terminalId, 'created-terminal');
    assert.ok(hooks.event);
    await hooks.event({ event: { type: 'question.asked', properties: { sessionID: 's', id: 'q' } } });
    assert.equal(requests[1]?.path, '/notify');
    const note = parseNotification(requests[1]?.body);
    assert.equal(note.instanceId, source.instanceId); assert.equal(note.sessionTitle, 'Same project session');
    assert.equal(logs.some(message => message.includes('Source registration failed')), sourceStatus !== 200);
    const second = await OpenCodeNotify({ directory: '/same/project', client });
    assert.ok(second.event);
    assert.notEqual(parseSourceRegistration(requests[2]?.body).instanceId, source.instanceId);
  });
}

test('source transport rejects non-loopback destinations before sending credentials', async () => {
  const { createSourceTransport } = await import('../src/transport.js');
  const source = { version: 1 as const, instanceId: 'i', pid: 10, parentPid: 1, startedAt: 1000, directory: '/project' };
  for (const url of ['https://127.0.0.1/notify', 'http://localhost/notify', 'http://127.0.0.1/other',
    'http://127.0.0.1/notify?redirect=1', 'http://user:secret@127.0.0.1/notify']) {
    let called = false;
    const transport = createSourceTransport(url, 'secret', async () => { called = true; return new Response(); });
    await assert.rejects(transport(source)); assert.equal(called, false);
  }
});

test('registration aborts an unresponsive router within the bounded startup budget', async t => {
  const { createSourceTransport } = await import('../src/transport.js');
  const server = createServer((_request, _response) => {});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const addr = server.address(); assert.ok(addr && typeof addr !== 'string');
  const start = Date.now();
  await assert.rejects(createSourceTransport(`http://127.0.0.1:${addr.port}/notify`, 'secret')({
    version: 1, instanceId: 'i', pid: 1, parentPid: 0, startedAt: 1000, directory: '/project',
  }), /timeout|abort/i);
  assert.ok(Date.now() - start < 3500, 'Registration must never stall plugin startup indefinitely');
});
