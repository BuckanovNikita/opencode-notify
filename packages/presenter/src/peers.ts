import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, readdir, unlink, utimes, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { createServer } from 'node:http';
import { isRecord, MAX_BODY_BYTES, parseActivation, parseRelay, type Relay } from '../../protocol/src/index.js';

interface PeerRecord { id: string; port: number; token: string }
interface PeerAdapters {
  directory: string;
  available(): boolean;
  receive(value: Relay): boolean;
  activate(targetId: string): Promise<boolean | void>;
  log(message: string): void;
}

/** VS Code profile paths are User/profiles/<id>/globalStorage; default is User/globalStorage. */
export function sharedPeerDirectory(globalStoragePath: string): string {
  const storage = dirname(globalStoragePath);
  if (basename(storage) !== 'globalStorage') throw new Error('Unsupported VS Code global storage layout');
  let user = dirname(storage);
  if (basename(dirname(user)) === 'profiles') user = dirname(dirname(user));
  return join(user, 'globalStorage', 'opencode-notify-peers');
}

export async function createPeers(adapters: PeerAdapters) {
  const id = randomUUID();
  const token = randomBytes(32).toString('hex');
  const filename = join(adapters.directory, `${id}.json`);
  let closed = false;
  let activeRequests = 0;
  const server = createServer((request, response) => {
    const reply = (status: number, value = {}) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)); };
    request.setTimeout(5000, () => request.destroy());
    const actual = Buffer.from(request.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (closed || actual.length !== expected.length || !timingSafeEqual(actual, expected)) { request.resume(); reply(401); return; }
    if (request.headers.origin) { request.resume(); reply(403); return; }
    if (request.method === 'GET' && request.url === '/status') { reply(200, { available: adapters.available() }); return; }
    if (request.method !== 'POST' || !['/relay', '/activate'].includes(request.url ?? '')) { request.resume(); reply(404); return; }
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) { request.resume(); reply(415); return; }
    if (activeRequests >= 32) { request.resume(); reply(429); return; }
    activeRequests++;
    response.once('close', () => { activeRequests--; });
    const chunks: Buffer[] = []; let size = 0; let excessive = false;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        if (!excessive) { excessive = true; reply(413); }
        return;
      }
      chunks.push(chunk);
    });
    request.on('error', error => adapters.log(`Peer request failed: ${error.message}`));
    request.on('end', () => {
      if (excessive) return;
      let value: unknown;
      try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { reply(400); return; }
      if (request.url === '/relay') {
        let relay: Relay;
        try { relay = parseRelay(value); } catch { reply(400); return; }
        // The receiver owns the last focus/settings check. It never sends another relay.
        try { reply(adapters.available() && adapters.receive(relay) ? 200 : 409); }
        catch (error) { adapters.log(`Peer presentation failed: ${String(error)}`); reply(500); }
      } else {
        let targetId: string;
        try { targetId = parseActivation(value).targetId; } catch { reply(400); return; }
        void adapters.activate(targetId).then(result => reply(result === false ? 404 : 200), error => {
          adapters.log(`Origin activation failed: ${String(error)}`); reply(500);
        });
      }
    });
  });
  server.maxConnections = 64;
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.on('error', error => adapters.log(`Peer listener failed: ${error.message}`));
  try {
    await mkdir(adapters.directory, { recursive: true, mode: 0o700 });
    const metadata = await lstat(adapters.directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('Unsafe peer discovery directory');
    await chmod(adapters.directory, 0o700);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No peer loopback address');
    await writeFile(filename, JSON.stringify({ id, port: address.port, token }), { flag: 'wx', mode: 0o600 });
  } catch (error) { server.close(); throw error; }

  const heartbeat = setInterval(() => {
    const now = new Date();
    void utimes(filename, now, now).catch(error => { if (!closed) adapters.log(`Could not refresh peer record: ${String(error)}`); });
  }, 60_000);
  heartbeat.unref();

  async function records(): Promise<PeerRecord[]> {
    const entries = (await readdir(adapters.directory)).filter(name => /^[a-f0-9-]{36}\.json$/u.test(name)).slice(0, 256);
    const values = await Promise.all(entries.map(async name => {
      try {
        const path = join(adapters.directory, name);
        const metadata = await lstat(path);
        if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 1024 ||
            (process.platform !== 'win32' && ((metadata.mode & 0o077) !== 0 || metadata.uid !== process.getuid?.()))) return undefined;
        const value: unknown = JSON.parse(await readFile(path, 'utf8'));
        if (!isRecord(value) || `${String(value.id)}.json` !== name || typeof value.token !== 'string' ||
            !/^[a-f0-9]{64}$/u.test(value.token) || !Number.isInteger(value.port) || (value.port as number) < 1 || (value.port as number) > 65535) return undefined;
        const peer = { id: value.id as string, port: value.port as number, token: value.token };
        if (metadata.mtimeMs < Date.now() - 24 * 60 * 60 * 1000 && peer.id !== id) {
          try { const response = await send(peer, '/status'); await response.arrayBuffer(); }
          catch { await unlink(path); return undefined; }
        }
        return peer;
      } catch { return undefined; } // A window may close between directory enumeration and reading.
    }));
    return values.filter((value): value is PeerRecord => value !== undefined && value.id !== id);
  }
  async function send(peer: PeerRecord, path: string, value?: unknown, timeout = 750): Promise<Response> {
    return fetch(`http://127.0.0.1:${peer.port}${path}`, { method: value === undefined ? 'GET' : 'POST',
      headers: { authorization: `Bearer ${peer.token}`, 'content-type': 'application/json' },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }), redirect: 'error', signal: AbortSignal.timeout(timeout) });
  }
  return {
    id,
    async relay(value: Relay): Promise<boolean> {
      if (closed) return false;
      const deadline = Date.now() + 2500;
      const peers = (await records()).slice(0, 64);
      const candidates = await Promise.all(peers.map(async peer => {
        try {
          const status = await send(peer, '/status');
          const state: unknown = await status.json();
          return status.ok && isRecord(state) && state.available === true ? peer : undefined;
        } catch { return undefined; }
      }));
      for (const peer of candidates) {
        if (!peer || closed) continue;
        if (Date.now() >= deadline) return false;
        try {
          const response = await send(peer, '/relay', value, Math.max(1, Math.min(750, deadline - Date.now())));
          await response.arrayBuffer();
          if (response.ok) return true;
          if (response.status === 409) continue;
          // A handler failure or a lost response can follow an accepted UI effect.
          // Treat uncertain acceptance conservatively so native failure cannot duplicate it.
          adapters.log('Peer relay acceptance uncertain');
          return true;
        } catch { adapters.log('Peer relay acceptance uncertain'); return true; }
      }
      return false;
    },
    async activate(origin: Relay['origin']): Promise<boolean> {
      if (closed) return false;
      const peer = (await records()).find(value => value.id === origin.peerId);
      if (!peer) return false;
      try { const response = await send(peer, '/activate', { version: 1, targetId: origin.targetId }); await response.arrayBuffer(); return response.ok; }
      catch (error) { adapters.log(`Could not contact notification origin: ${String(error)}`); return false; }
    },
    async dispose(): Promise<void> {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
      try { await unlink(filename); } catch (error) {
        if (!isRecord(error) || error.code !== 'ENOENT') adapters.log(`Could not remove peer record: ${String(error)}`);
      }
    },
  };
}
