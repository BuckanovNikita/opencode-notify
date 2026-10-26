import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { MAX_BODY_BYTES, parseNotification, type Notification } from '../../protocol/src/index.js';

interface Options { deliver(notification: Notification): Promise<void>; log(message: string): void }

function authorized(header: string | undefined, token: string): boolean {
  const actual = Buffer.from(header || '');
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function startRouter(options: Options) {
  const token = randomBytes(32).toString('hex');
  const delivered = new Set<string>();
  const inFlight = new Map<string, Promise<void>>();
  let activeRequests = 0;
  const reply = (response: ServerResponse, status: number, message: string) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ message }));
  };

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    request.setTimeout(5000, () => request.destroy());
    if (!authorized(request.headers.authorization, token)) { reply(response, 401, 'Unauthorized'); request.resume(); return; }
    if (request.headers.origin) { reply(response, 403, 'Browser requests are not accepted'); request.resume(); return; }
    if (request.method !== 'POST' || request.url !== '/notify') { reply(response, 404, 'Not found'); request.resume(); return; }
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      reply(response, 415, 'Expected application/json'); request.resume(); return;
    }
    if (activeRequests >= 32) { reply(response, 429, 'Too many requests'); request.resume(); return; }
    activeRequests++;
    try {
      let body: string;
      try {
        body = await new Promise<string>((resolve, reject) => {
          const chunks: Buffer[] = []; let size = 0; let overflow = false;
          request.on('data', (chunk: Buffer) => {
            if (overflow) return;
            size += chunk.length;
            if (size > MAX_BODY_BYTES) { overflow = true; chunks.length = 0; reject(new RangeError('Payload too large')); }
            else chunks.push(chunk);
          });
          request.once('end', () => { if (!overflow) resolve(Buffer.concat(chunks).toString('utf8')); });
          request.once('error', reject);
        });
      } catch (error) {
        if (!response.destroyed) reply(response, error instanceof RangeError ? 413 : 400, 'Invalid request body');
        return;
      }
      let notification: Notification;
      try { notification = parseNotification(JSON.parse(body)); }
      catch { reply(response, 400, 'Invalid notification'); return; }
      if (delivered.has(notification.id)) { reply(response, 200, 'Already accepted'); return; }
      let delivery = inFlight.get(notification.id);
      if (!delivery) {
        delivery = options.deliver(notification);
        inFlight.set(notification.id, delivery);
      }
      try {
        await delivery;
        delivered.add(notification.id);
        if (delivered.size > 4096) delivered.delete(delivered.values().next().value!);
        reply(response, 202, 'Accepted');
      } catch {
        options.log('Delivery failed. Install/enable OpenCode Notify on the local VS Code host and check its output log.');
        reply(response, 503, 'Local presenter unavailable');
      } finally { inFlight.delete(notification.id); }
    } finally { activeRequests--; }
  }

  const server = createServer({ requestTimeout: 5000, headersTimeout: 5000, connectionsCheckingInterval: 1000 }, (request, response) => {
    void handle(request, response).catch(error => {
      options.log(`Router request failed: ${error instanceof Error ? error.message : String(error)}`);
      if (!response.headersSent && !response.destroyed) reply(response, 500, 'Internal notification error');
      else response.end();
    });
  });
  server.maxConnections = 64;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Loopback listener has no TCP address');
  server.on('error', error => options.log(`Router server error: ${error.message}`));
  return {
    url: `http://127.0.0.1:${address.port}/notify`, token,
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
