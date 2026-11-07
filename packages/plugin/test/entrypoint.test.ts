import assert from "node:assert/strict";
import { test } from "node:test";
import * as entry from "../src/index.js";

void test("one default definition exposes both public OpenCode entrypoints", () => {
  assert.deepEqual(Object.keys(entry), ["default"]);
  const definition = (entry as unknown as { default: { id: string; server: unknown; setup: unknown } }).default;
  assert.equal(definition.id, "opencode-notify");
  assert.equal(typeof definition.server, "function");
  assert.equal(typeof definition.setup, "function");
});

void test("v2 subscribes, registers source, delivers authenticated events and aborts on unload", async (t) => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const { startRouter } = await import("../../router/src/server.js");
  const plugin = (
    entry as unknown as { default: { setup: (ctx: unknown) => Promise<undefined | (() => Promise<void>)> } }
  ).default;
  const received: unknown[] = [];
  const sources: unknown[] = [];
  const router = await startRouter({
    deliver: (n) => {
      received.push(n);
      return Promise.resolve();
    },
    register: (s) => {
      sources.push(s);
      return Promise.resolve();
    },
    log: () => assert.fail("Unexpected call"),
  });
  const dir = await mkdtemp(path.join(tmpdir(), "notify-v2-entry-"));
  const previous = { ...process.env };
  Object.assign(process.env, {
    XDG_CONFIG_HOME: dir,
    OPENCODE_NOTIFY_URL: router.url,
    OPENCODE_NOTIFY_TOKEN: router.token,
  });
  t.after(async () => {
    for (const key of ["XDG_CONFIG_HOME", "OPENCODE_NOTIFY_URL", "OPENCODE_NOTIFY_TOKEN"]) {
      if (previous[key] === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = previous[key];
    }
    await router.close();
    await rm(dir, { recursive: true, force: true });
  });
  let signal: AbortSignal | undefined;
  let closed = false;
  let metadataInput: unknown;
  let delivered!: () => void;
  const finished = new Promise<void>((resolve) => {
    delivered = resolve;
  });
  const dispose = await plugin.setup({
    location: { directory: dir },
    session: {
      get: (input: unknown) => {
        metadataInput = input;
        return Promise.resolve({ title: "V2 entry" });
      },
    },
    event: {
      subscribe: (input: { signal: AbortSignal }) => {
        signal = input.signal;
        return (async function* () {
          try {
            yield { id: "start", type: "session.execution.started", data: { sessionID: "s" } };
            yield { id: "done", type: "session.execution.succeeded", data: { sessionID: "s" } };
            delivered();
            await new Promise<void>((resolve) => {
              input.signal.addEventListener(
                "abort",
                () => {
                  resolve();
                },
                { once: true },
              );
            });
          } finally {
            closed = true;
          }
        })();
      },
    },
  });
  assert.ok(dispose);
  await finished;
  assert.equal(received.length, 1);
  assert.equal(sources.length, 1);
  assert.equal((received[0] as { sessionTitle: string }).sessionTitle, "V2 entry");
  assert.deepEqual(metadataInput, { sessionID: "s" });
  await dispose();
  assert.equal(signal?.aborted, true);
  assert.equal(closed, true);
  return Promise.resolve();
});

void test("v2 contains synchronous subscription failures without a rejected background task", async (t) => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const dir = await mkdtemp(path.join(tmpdir(), "notify-v2-failure-"));
  const previousConfig = process.env.XDG_CONFIG_HOME;
  const previousUrl = process.env.OPENCODE_NOTIFY_URL;
  process.env.XDG_CONFIG_HOME = dir;
  delete process.env.OPENCODE_NOTIFY_URL;
  t.after(async () => {
    if (previousConfig === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previousConfig;
    if (previousUrl === undefined) delete process.env.OPENCODE_NOTIFY_URL;
    else process.env.OPENCODE_NOTIFY_URL = previousUrl;
    await rm(dir, { recursive: true, force: true });
  });
  const plugin = (
    entry as unknown as { default: { setup: (ctx: unknown) => Promise<undefined | (() => Promise<void>)> } }
  ).default;
  const dispose = await plugin.setup({
    location: { directory: "/demo" },
    session: { get: () => Promise.resolve({}) },
    event: {
      subscribe: () => {
        throw new Error("Subscription fixture failure");
      },
    },
  });
  assert.ok(dispose);
  await dispose();
  return Promise.resolve();
});
