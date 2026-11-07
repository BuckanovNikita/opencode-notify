import assert from "node:assert/strict";
import { test } from "node:test";
import { createV2Controller } from "../src/v2.js";
import { defaultConfig } from "../src/config.js";
import type { Notification } from "../../protocol/src/index.js";

function harness(options = {}) {
  const sent: Notification[] = [];
  let now = 1000;
  let serial = 0;
  const controller = createV2Controller({
    config: { ...defaultConfig, ...options },
    directory: "/work/demo",
    instanceId: "instance",
    terminalId: "terminal",
    now: () => now,
    send: (n) => {
      sent.push(n);
      return Promise.resolve();
    },
    session: (id) => Promise.resolve({ id, title: "V2 task" }),
    log: () => {
      /* Intentionally inert test double. */
    },
  });
  const event = (type: string, data: Record<string, unknown> = {}, id = `event-${String(++serial)}`) =>
    controller.event({ id, created: now, type, data: { sessionID: "s", ...data } });
  return {
    sent,
    event,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

void test("v2 completes once per execution, preserving source and title", async () => {
  const h = harness();
  await h.event("session.execution.started", {}, "start");
  await h.event("session.execution.started", {}, "start");
  await h.event("session.execution.succeeded", {}, "success");
  await h.event("session.execution.succeeded", {}, "success");
  await h.event("session.execution.succeeded");
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0]?.event, "complete");
  assert.equal(h.sent[0].sessionTitle, "V2 task");
  assert.equal(h.sent[0].terminalId, "terminal");
  await h.event("session.execution.started");
  await h.event("session.execution.succeeded");
  assert.equal(h.sent.length, 2);
});

for (const outcome of ["failed", "interrupted"])
  void test(`v2 ${outcome} suppresses late success`, async () => {
    const h = harness();
    await h.event("session.execution.started");
    await h.event(`session.execution.${outcome}`, { error: { message: "failure" }, reason: "user" });
    await h.event(`session.execution.${outcome}`);
    await h.event("session.execution.succeeded");
    assert.deepEqual(
      h.sent.map((n) => n.event),
      outcome === "failed" ? ["error"] : [],
    );
  });

for (const kind of ["permission", "question"])
  void test(`v2 ${kind} lifecycle suppresses completion while pending`, async () => {
    const h = harness();
    await h.event("session.execution.started");
    const type = kind === "permission" ? "permission.asked" : "form.created";
    const data =
      kind === "permission"
        ? { id: "request" }
        : { form: { id: "request", sessionID: "s", metadata: { kind: "question" } } };
    await h.event(type, data);
    await h.event(type, data);
    await h.event("session.execution.succeeded");
    assert.deepEqual(
      h.sent.map((n) => n.event),
      [kind],
    );
    await h.event(
      kind === "permission" ? "permission.replied" : "form.replied",
      kind === "permission" ? { requestID: "request" } : { id: "request" },
    );
    assert.equal(h.sent.length, 1, "reply alone is not completion evidence");
    await h.event("session.execution.succeeded");
    assert.equal(h.sent.length, 2);
  });

void test("v2 ignores unrelated/global forms and success without a start", async () => {
  const h = harness();
  await h.event("session.execution.succeeded");
  await h.event("form.created", { form: { id: "other", sessionID: "global", metadata: { kind: "question" } } });
  await h.event("form.created", { form: { id: "auth", sessionID: "s", metadata: { kind: "authentication" } } });
  assert.equal(h.sent.length, 0);
});

void test("v2 duration, child settings, metadata updates and deletion", async () => {
  const h = harness({ minDurationMs: 50, events: { ...defaultConfig.events, subagent_complete: true } });
  await h.event("session.created", { parentID: "parent", title: "Child" });
  await h.event("session.execution.started");
  h.advance(20);
  await h.event("session.execution.succeeded");
  assert.equal(h.sent.length, 0);
  await h.event("session.renamed", { title: "Renamed child" });
  await h.event("session.execution.started");
  h.advance(100);
  await h.event("session.execution.succeeded");
  assert.equal(h.sent[0]?.event, "subagent_complete");
  assert.equal(h.sent[0].sessionTitle, "Renamed child");
  await h.event("session.deleted");
  await h.event("session.execution.succeeded");
  assert.equal(h.sent.length, 1);
});

void test("v2 metadata failures do not prevent notifications", async () => {
  const sent: Notification[] = [];
  const logs: string[] = [];
  const h = createV2Controller({
    config: defaultConfig,
    directory: "/demo",
    instanceId: "i",
    now: () => 1000,
    session: () => {
      return Promise.reject(new Error("Unavailable"));
    },
    send: (n) => {
      sent.push(n);
      return Promise.resolve();
    },
    log: (m) => logs.push(m),
  });
  await h.event({ type: "permission.asked", data: { sessionID: "s", id: "p" }, id: "e" });
  assert.equal(sent[0]?.event, "permission");
  assert.match(present(logs[0]), /metadata unavailable/);
  return Promise.resolve();
});

void test("v2 rename on an attached child session retains fetched parent identity", async () => {
  const sent: Notification[] = [];
  const h = createV2Controller({
    config: defaultConfig,
    directory: "/demo",
    instanceId: "i",
    now: () => 1000,
    session: (id) => Promise.resolve({ id, title: "Old title", parentID: "parent" }),
    send: (n) => {
      sent.push(n);
      return Promise.resolve();
    },
    log: () => assert.fail("Unexpected call"),
  });
  await h.event({ id: "rename", type: "session.renamed", data: { sessionID: "s", title: "New title" } });
  await h.event({ id: "start", type: "session.execution.started", data: { sessionID: "s" } });
  await h.event({ id: "end", type: "session.execution.succeeded", data: { sessionID: "s" } });
  assert.equal(sent.length, 0, "child completions remain disabled");
  return Promise.resolve();
});

function present<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined);
  return value;
}
