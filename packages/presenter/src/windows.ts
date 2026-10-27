import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, type Socket } from 'node:net';
import type { Notification } from '../../protocol/src/index.js';

export type HelperError = Error & { code?: string | number | null | undefined };
export type LaunchHelper = (path: string, args: string[], callback: (error: HelperError | null) => void) => { kill(): unknown };
interface WindowsOptions {
  pipeName?: string;
  launch?: LaunchHelper;
  confirmationTimeoutMs?: number;
  callbackGraceMs?: number;
  retentionMs?: number;
  maxTargets?: number;
}
interface Target {
  click: () => void;
  expires: number;
  finish: (error?: Error) => void;
  pending: boolean;
}

/** SnoreToast v0.7 writes one UTF-16LE formatAction record per connection.
 * writePipe's trailing WriteFile(nullptr, ...) is not a reliable NUL terminator:
 * buffer until EOF, including partial code units and multiple data events.
 */
export function createWindowsNotifications(helperPath: string, log: (message: string) => void, options: WindowsOptions = {}) {
  const pipeName = options.pipeName ?? `\\\\.\\pipe\\opencode-notify-${randomUUID()}`;
  const targets = new Map<string, Target>();
  const sockets = new Set<Socket>();
  const helpers = new Set<{ kill(): unknown }>();
  const maxTargets = options.maxTargets ?? 512;
  const retentionMs = options.retentionMs ?? 24 * 60 * 60 * 1000;
  const confirmationTimeoutMs = options.confirmationTimeoutMs ?? 70_000;
  let disposed = false;
  let listening: Promise<void> | undefined;
  const server = createServer(socket => {
    if (sockets.size >= 32) { socket.destroy(); return; }
    sockets.add(socket);
    let bytes = Buffer.alloc(0);
    socket.setTimeout(5_000, () => socket.destroy());
    socket.on('error', () => { log('Windows notification callback connection failed'); });
    socket.on('close', () => sockets.delete(socket));
    socket.on('data', (chunk: Buffer) => {
      if (bytes.length + chunk.length > 16_384) { socket.destroy(); return; }
      bytes = Buffer.concat([bytes, chunk]);
    });
    socket.on('end', () => {
      if (bytes.length % 2 !== 0) return;
      const record = bytes.toString('utf16le').replace(/\0+$/, '');
      const fields = new Map<string, string>();
      for (const field of record.split(';')) {
        if (!field) continue;
        const equal = field.indexOf('=');
        if (equal < 1 || fields.has(field.slice(0, equal))) return;
        fields.set(field.slice(0, equal), field.slice(equal + 1));
      }
      if (fields.get('pipe') !== pipeName || fields.get('version') !== '0.7.0') return;
      const id = fields.get('notificationId');
      if (!id) return;
      const target = targets.get(id);
      if (!target) return;
      if (target.expires <= Date.now()) { target.finish(new Error('Windows notification target expired')); targets.delete(id); return; }
      const action = fields.get('action');
      if (action === 'clicked' || (action === 'buttonClicked' && fields.get('button') === 'Open OpenCode')) {
        targets.delete(id); target.finish();
        try { target.click(); } catch { log('Windows notification activation failed'); }
      } else if (action === 'error') {
        target.finish(new Error('Windows notification helper reported callback failure'));
      } else if (action === 'timedout' || action === 'hidden' || action === 'dismissed') {
        // Banner lifecycle does not end Notification Center activation lifetime.
        target.finish();
      }
    });
  });
  server.on('error', () => {
    log('Windows notification callback server failed');
    for (const target of targets.values()) target.finish(new Error('Windows notification callback server failed'));
    targets.clear();
  });
  const ensureListening = () => listening ??= new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Windows notification callback server did not start')), 5_000);
    const onError = (error: Error) => { clearTimeout(timer); reject(error); };
    server.once('error', onError);
    server.listen(pipeName, () => { clearTimeout(timer); server.off('error', onError); server.unref(); resolve(); });
  });
  const launch: LaunchHelper = options.launch ?? ((path, args, callback) =>
    execFile(path, args, { windowsHide: true, timeout: confirmationTimeoutMs, maxBuffer: 64 * 1024 }, (error, _stdout, stderr) =>
      callback(error ?? (stderr.trim() ? new Error('Windows notification helper reported an error') : null))));

  return {
    async notify(notification: Notification, sound: boolean, onClick: () => void): Promise<void> {
      if (disposed) throw new Error('Windows notification adapter disposed');
      await ensureListening();
      if (disposed) throw new Error('Windows notification adapter disposed');
      for (const [id, target] of targets) if (target.expires <= Date.now()) {
        target.finish(new Error('Windows notification target expired')); targets.delete(id);
      }
      if (helpers.size >= 32) throw new Error('Windows notification helper capacity exceeded');
      while (targets.size >= maxTargets) {
        const oldest = [...targets].find(([, target]) => !target.pending);
        if (!oldest) throw new Error('Windows notification target capacity exceeded');
        targets.delete(oldest[0]);
      }
      const id = randomUUID();
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        let helper: { kill(): unknown } | undefined;
        const target: Target = { click: onClick, expires: Date.now() + retentionMs, pending: true,
          finish(error) {
            if (!target.pending) return;
            target.pending = false; clearTimeout(timer);
            if (error) { targets.delete(id); reject(error); } else resolve();
          } };
        targets.set(id, target);
        timer = setTimeout(() => { target.finish(new Error('Windows notification helper did not return confirmation')); helper?.kill(); if (helper) helpers.delete(helper); }, confirmationTimeoutMs);
        const args = ['-t', notification.title, '-m', notification.message.replace(/\x1b/g, ''), '-id', id,
          '-pipeName', pipeName, '-b', 'Open OpenCode', ...(sound ? ['-s', 'Notification.Default'] : ['-silent'])];
        try {
          let returned = false;
          helper = launch(helperPath, args, error => {
            returned = true;
            if (helper) helpers.delete(helper);
            // Upstream Actions enum: clicked=0, hidden=1, dismissed=2,
            // timedout=3, buttonClicked=4, textEntered=5; failure=-1.
            const code = error?.code;
            if (error && !(typeof code === 'number' && code >= 1 && code <= 5)) {
              log(`Windows notification helper failed (status ${code ?? 'unknown'})`);
              target.finish(error); return;
            }
            // A GUI helper can exit without displaying anything (and without an
            // attached console for stderr). Only a matching pipe event confirms
            // native delivery. Allow its connection EOF to race process exit.
            if (!target.pending) return;
            clearTimeout(timer);
            timer = setTimeout(() => target.finish(new Error(
              `Windows notification helper exited (status ${code ?? 0}) without a matching callback`)), options.callbackGraceMs ?? 1000);
          });
          if (!returned) helpers.add(helper);
        } catch (error) { target.finish(error instanceof Error ? error : new Error('Windows notification helper failed')); }
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const target of targets.values()) target.finish(new Error('Windows notification adapter disposed'));
      targets.clear();
      for (const helper of helpers) helper.kill();
      helpers.clear();
      for (const socket of sockets) socket.destroy();
      server.close();
    }
  };
}
