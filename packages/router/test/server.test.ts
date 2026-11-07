import assert from "node:assert/strict";
import { test } from "node:test";
import { startRouter } from "../src/server.js";
import { createTransport } from "../../plugin/src/transport.js";
import type { Notification } from "../../protocol/src/index.js";

const note: Notification = {
  version: 1,
  id: "test:1",
  event: "question",
  sessionId: "s1",
  project: "demo",
  directory: "/demo",
  title: "OpenCode",
  message: "Answer needed",
  occurredAt: 1000,
};

void test("real HTTP authenticates, validates, deduplicates, and forwards notifications", async (t) => {
  const received: Notification[] = [];
  const router = await startRouter({
    deliver: (n) => {
      received.push(n);
      return Promise.resolve();
    },
    log: () => {
      /* Intentionally inert test double. */
    },
  });
  t.after(() => router.close());
  assert.equal((await fetch(router.url, { method: "POST", body: JSON.stringify(note) })).status, 401);
  const send = createTransport(router.url, router.token);
  await send(note);
  await send(note);
  assert.deepEqual(received, [note]);
  const headers = { Authorization: `Bearer ${router.token}`, "Content-Type": "application/json" };
  assert.equal((await fetch(router.url, { method: "POST", headers, body: "{" })).status, 400);
  assert.equal(
    (await fetch(router.url, { method: "POST", headers, body: JSON.stringify({ ...note, version: 2 }) })).status,
    400,
  );
  assert.equal((await fetch(router.url, { method: "POST", headers, body: "x".repeat(70_000) })).status, 413);
  assert.equal(
    (
      await fetch(router.url, {
        method: "POST",
        headers: { ...headers, Origin: "https://example.com" },
        body: JSON.stringify(note),
      })
    ).status,
    403,
  );
  return Promise.resolve();
});

void test("a failed presenter remains retryable and concurrent duplicates deliver once", async (t) => {
  let calls = 0;
  let fail = true;
  const router = await startRouter({
    deliver: async () => {
      calls++;
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      if (fail) throw new Error("presenter missing");
    },
    log: () => {
      /* Intentionally inert test double. */
    },
  });
  t.after(() => router.close());
  const send = createTransport(router.url, router.token);
  await assert.rejects(send(note), /503/);
  fail = false;
  await Promise.all([send(note), send(note)]);
  assert.equal(calls, 2);
});

void test("transport refuses non-loopback endpoints before sending credentials", async () => {
  let fetched = false;
  const fakeFetch: typeof fetch = () => {
    fetched = true;
    return Promise.resolve(new Response());
  };
  await assert.rejects(createTransport("https://example.com/notify", "secret", fakeFetch)(note), /loopback/);
  assert.equal(fetched, false);
});

void test("source registration requires authentication and validates before invoking callback", async (t) => {
  const received: unknown[] = [];
  const router = await startRouter({
    deliver: () => {
      /* Intentionally inert test double. */ return Promise.resolve();
    },
    register: (source) => {
      received.push(source);
      return Promise.resolve();
    },
    log: () => {
      /* Intentionally inert test double. */
    },
  });
  t.after(() => router.close());
  const url = new URL("/sources", router.url);
  const source = { version: 1, instanceId: "instance-a", pid: 30, parentPid: 20, startedAt: 3000, directory: "/demo" };
  const headers = { Authorization: `Bearer ${router.token}`, "Content-Type": "application/json" };
  assert.equal((await fetch(url, { method: "POST", body: JSON.stringify(source) })).status, 401);
  assert.equal(
    (await fetch(url, { method: "POST", headers, body: JSON.stringify({ ...source, pid: -1 }) })).status,
    400,
  );
  assert.equal((await fetch(url, { method: "POST", headers, body: JSON.stringify(source) })).status, 202);
  assert.deepEqual(received, [source]);
  return Promise.resolve();
});

void test("registration failure remains nonfatal to notification forwarding", async (t) => {
  let deliveries = 0;
  const router = await startRouter({
    deliver: () => {
      deliveries++;
      return Promise.resolve();
    },
    register: () => {
      return Promise.reject(new Error("inspection unavailable"));
    },
    log: () => {
      /* Intentionally inert test double. */
    },
  });
  t.after(() => router.close());
  const headers = { Authorization: `Bearer ${router.token}`, "Content-Type": "application/json" };
  const source = { version: 1, instanceId: "instance-a", pid: 30, parentPid: 20, startedAt: 3000, directory: "/demo" };
  assert.equal(
    (await fetch(new URL("/sources", router.url), { method: "POST", headers, body: JSON.stringify(source) })).status,
    503,
  );
  await createTransport(router.url, router.token)(note);
  assert.equal(deliveries, 1);
  return Promise.resolve();
});
