import { randomUUID } from "node:crypto";
import { cleanText, isRecord } from "../../protocol/src/index.js";
import { loadConfig } from "./config.js";
import { createController } from "./controller.js";
import { createV2Controller } from "./v2.js";
import type { NotificationDependencies, SessionInfo } from "./notifications.js";
import { createSourceTransport, createTransport } from "./transport.js";

// Structural public API subsets keep the installed bundle independent of either SDK.
interface V1Context {
  directory: string;
  client: {
    session: { get(input: { path: { id: string }; signal: AbortSignal }): Promise<unknown> };
    app: { log(input: { body: { service: string; level: string; message: string } }): Promise<unknown> };
  };
}
interface V2Context {
  location: { directory: string };
  session: { get(input: { sessionID: string }): Promise<unknown> };
  event: { subscribe(input: { signal: AbortSignal }): AsyncIterable<unknown> };
}
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const stderr = (message: string) => {
  process.stderr.write(`[opencode-notify] ${message}\n`);
};

function sessionInfo(id: string, response: unknown): SessionInfo | undefined {
  if (!isRecord(response) || !isRecord(response.data)) return undefined;
  const data = response.data;
  return {
    id,
    ...(typeof data.title === "string" ? { title: data.title } : {}),
    ...(typeof data.parentID === "string" ? { parentID: data.parentID } : {}),
  };
}

async function initialize(
  directory: string,
  session: NotificationDependencies["session"],
  log: (message: string) => void,
  signal?: AbortSignal,
): Promise<NotificationDependencies | undefined> {
  const config = await loadConfig();
  if (!config.enabled) return undefined;
  const instanceId = randomUUID();
  const terminalId = process.env.OPENCODE_NOTIFY_TERMINAL_ID;
  try {
    await createSourceTransport(
      process.env.OPENCODE_NOTIFY_URL,
      process.env.OPENCODE_NOTIFY_TOKEN,
    )({
      version: 1,
      instanceId,
      pid: process.pid,
      parentPid: process.ppid,
      startedAt: Date.now() - process.uptime() * 1000,
      directory: cleanText(directory, 4096),
      ...(terminalId ? { terminalId } : {}),
    });
  } catch (error) {
    log(`Source registration failed; notifications remain enabled: ${errorText(error)}`);
  }
  return {
    config,
    directory,
    instanceId,
    now: Date.now,
    session,
    log,
    ...(terminalId ? { terminalId } : {}),
    send: createTransport(process.env.OPENCODE_NOTIFY_URL, process.env.OPENCODE_NOTIFY_TOKEN, fetch, signal),
  };
}

async function server({ directory, client }: V1Context) {
  const log = (message: string) => {
    // Handle synchronous SDK failures as well as rejected log requests.
    void Promise.resolve()
      .then(() => client.app.log({ body: { service: "opencode-notify", level: "warn", message } }))
      .catch(() => {
        stderr(message);
      });
  };
  try {
    const deps = await initialize(
      directory,
      async (id) => sessionInfo(id, await client.session.get({ path: { id }, signal: AbortSignal.timeout(1500) })),
      log,
    );
    if (!deps) return {};
    const controller = createController(deps);
    return {
      event: async ({ event }: { event: unknown }) => {
        try {
          await controller.event(event);
        } catch (error) {
          log(`Event processing failed: ${errorText(error)}`);
        }
      },
    };
  } catch (error) {
    log(`Plugin disabled: ${errorText(error)}`);
    return {};
  }
}

async function setup(ctx: V2Context) {
  const abort = new AbortController();
  try {
    const deps = await initialize(
      ctx.location.directory,
      async (id) => {
        // The v2 plugin adapter does not forward request options to session.get.
        // Bound our wait and release its timer, even if the host never answers.
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return sessionInfo(id, {
            data: await Promise.race([
              ctx.session.get({ sessionID: id }),
              new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => {
                  reject(new Error("Session metadata timed out"));
                }, 1500);
              }),
            ]),
          });
        } finally {
          clearTimeout(timer);
        }
      },
      stderr,
      abort.signal,
    );
    if (!deps) return;
    const controller = createV2Controller(deps);
    const task = (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: abort.signal })) {
          if (abort.signal.aborted) break;
          try {
            await controller.event(event);
          } catch (error) {
            // Awaiting the handler allows disposal to abort the signal.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!abort.signal.aborted) stderr(`Event processing failed: ${errorText(error)}`);
          }
        }
      } catch (error) {
        if (!abort.signal.aborted) stderr(`Event subscription failed: ${errorText(error)}`);
      }
    })();
    return async () => {
      abort.abort();
      await task;
    };
  } catch (error) {
    abort.abort();
    stderr(`Plugin disabled: ${errorText(error)}`);
  }
}

// V1 >=1.18.29 calls server; v2 calls setup. No SDK import or other runtime exports.
export default { id: "opencode-notify", server, setup };
