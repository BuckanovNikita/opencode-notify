import { randomUUID } from 'node:crypto';
import { cleanText, isRecord } from '../../protocol/src/index.js';
import { loadConfig } from './config.js';
import { createController, type SessionInfo } from './controller.js';
import { createSourceTransport, createTransport } from './transport.js';

// Structural types keep the bundle compatible with the v1 plugin ABI without a runtime SDK.
interface Context {
  directory: string;
  client: {
    session: { get(input: { path: { id: string }; signal: AbortSignal }): Promise<unknown> };
    app: { log(input: { body: { service: string; level: string; message: string } }): Promise<unknown> };
  };
}

// Exactly one function export: older v1 loaders invoke every exported value.
export async function OpenCodeNotify({ directory, client }: Context) {
  const log = (message: string) => {
    void client.app.log({ body: { service: 'opencode-notify', level: 'warn', message } }).catch(() => {
      // Do not write to stdout: it belongs to OpenCode's TUI/protocol.
      process.stderr.write(`[opencode-notify] ${message}\n`);
    });
  };
  try {
    const config = await loadConfig();
    if (!config.enabled) return {};
    const instanceId = randomUUID();
    const terminalId = process.env.OPENCODE_NOTIFY_TERMINAL_ID;
    try {
      await createSourceTransport(process.env.OPENCODE_NOTIFY_URL, process.env.OPENCODE_NOTIFY_TOKEN)({
        version: 1, instanceId, pid: process.pid, parentPid: process.ppid,
        startedAt: Date.now() - process.uptime() * 1000, directory: cleanText(directory, 4096),
        ...(terminalId ? { terminalId } : {}),
      });
    } catch (error) {
      log(`Source registration failed; notifications remain enabled: ${error instanceof Error ? error.message : String(error)}`);
    }
    const controller = createController({
      config, directory, instanceId, now: Date.now,
      ...(terminalId ? { terminalId } : {}),
      send: createTransport(process.env.OPENCODE_NOTIFY_URL, process.env.OPENCODE_NOTIFY_TOKEN), log,
      session: async id => {
        const response = await client.session.get({ path: { id }, signal: AbortSignal.timeout(1500) });
        if (!isRecord(response) || !isRecord(response.data)) return undefined;
        const data = response.data;
        const result: SessionInfo = { id,
          ...(typeof data.title === 'string' ? { title: data.title } : {}),
          ...(typeof data.parentID === 'string' ? { parentID: data.parentID } : {}) };
        return result;
      },
    });
    return { event: async ({ event }: { event: unknown }) => {
      try { await controller.event(event); }
      catch (error) { log(`Event processing failed: ${error instanceof Error ? error.message : String(error)}`); }
    } };
  } catch (error) {
    log(`Plugin disabled: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}
