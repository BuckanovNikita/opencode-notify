import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { parseNotification, type DisplayMode } from '../../protocol/src/index.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || !args.length) {
    process.stdout.write('Usage: opencode-notify [-d auto|app|system] [title] message\nRun inside a fresh VS Code terminal with OpenCode Notify Router.\n');
    return;
  }
  let display: DisplayMode = 'auto';
  if (args[0] === '-d' || args[0] === '--display') {
    args.shift(); const mode = args.shift();
    if (mode !== 'auto' && mode !== 'app' && mode !== 'system') throw new Error('Invalid display mode');
    display = mode;
  }
  if (args.length < 1 || args.length > 2) throw new Error('Expected a message, or title and message');
  const url = process.env.OPENCODE_NOTIFY_URL;
  const token = process.env.OPENCODE_NOTIFY_TOKEN;
  if (!url || !token) throw new Error('Open a fresh VS Code terminal with the Router enabled');
  const target = new URL(url);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.pathname !== '/notify' ||
      target.username || target.password || target.search || target.hash) throw new Error('Invalid router endpoint');
  const note = parseNotification({ version: 1, id: randomUUID(), event: 'complete', sessionId: 'external',
    project: basename(process.cwd()) || 'workspace', directory: process.cwd(), title: args.length === 2 ? args[0] : 'OpenCode Notify',
    message: args.at(-1), occurredAt: Date.now(), display });
  const response = await fetch(target, { method: 'POST', headers: {
    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
  }, body: JSON.stringify(note), signal: AbortSignal.timeout(2500), redirect: 'error' });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`Router returned HTTP ${response.status}`);
}

void main().catch(error => { process.stderr.write(`opencode-notify: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
