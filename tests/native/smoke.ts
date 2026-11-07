import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { startRouter } from "../../packages/router/src/server.js";
import type { Notification, SourceRegistration } from "../../packages/protocol/src/index.js";

const versions = process.argv.slice(2);
for (const version of versions.length > 0 ? versions : ["1.18.29", "1.19.5", "2.2.5"]) {
  await runSmoke(version);
}

async function runSmoke(version: string): Promise<void> {
  const v2 = version.startsWith("2.");
  const packageName = v2 ? "@opencode/cli" : "opencode-ai";
  const task = await mkdtemp(join(tmpdir(), `opencode-notify-${version}-`));
  const received: Notification[] = [];
  const sources: SourceRegistration[] = [];
  let requests = 0;
  const router = await startRouter({
    deliver: (notification) => {
      received.push(notification);
      return Promise.resolve();
    },
    register: (source) => {
      sources.push(source);
      return Promise.resolve();
    },
    log: console.error,
  });
  const model = createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { stream?: boolean };
      requests++;
      const base = { id: "chatcmpl-smoke", model: "stub", created: Math.floor(Date.now() / 1000) };
      if (body.stream) {
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        for (const chunk of [
          {
            ...base,
            object: "chat.completion.chunk",
            choices: [{ index: 0, delta: { role: "assistant", content: "OK" }, finish_reason: null }],
          },
          {
            ...base,
            object: "chat.completion.chunk",
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          },
        ])
          response.write(`data: ${JSON.stringify(chunk)}\n\n`);
        response.end("data: [DONE]\n\n");
      } else {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            ...base,
            object: "chat.completion",
            choices: [{ index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        );
      }
    })().catch((error: unknown) => {
      response.destroy(error instanceof Error ? error : new Error(String(error)));
    });
  });
  model.listen(0, "127.0.0.1");
  await once(model, "listening");
  const address = model.address();
  assert.ok(address && typeof address !== "string");
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const config = join(task, "config", "opencode");
    const workspace = join(task, "workspace");
    await mkdir(join(config, "plugins"), { recursive: true });
    await mkdir(workspace);
    await copyFile(resolve("dist/opencode-notify.js"), join(config, "plugins", "opencode-notify.js"));
    await writeFile(
      join(config, "opencode.json"),
      JSON.stringify(
        v2
          ? {
              model: "notify-test/stub",
              share: "disabled",
              update: "disable",
              providers: {
                "notify-test": {
                  package: "@opencode/ai/providers/openai-compatible",
                  name: "Notification smoke",
                  settings: {
                    baseURL: `http://127.0.0.1:${String(address.port)}/v1`,
                    apiKey: "local-test",
                    timeout: 5000,
                  },
                  models: {
                    stub: { name: "Stub", limit: { context: 32768, output: 1024 }, capabilities: { tools: false } },
                  },
                },
              },
            }
          : {
              model: "notify-test/stub",
              small_model: "notify-test/stub",
              share: "disabled",
              autoupdate: false,
              enabled_providers: ["notify-test"],
              provider: {
                "notify-test": {
                  npm: "@ai-sdk/openai-compatible",
                  name: "Notification smoke",
                  options: {
                    baseURL: `http://127.0.0.1:${String(address.port)}/v1`,
                    apiKey: "local-test",
                    timeout: 5000,
                  },
                  models: { stub: { name: "Stub", limit: { context: 32768, output: 1024 }, tool_call: false } },
                },
              },
            },
      ),
    );
    const inherited = Object.fromEntries(
      [
        "PATH",
        "HOME",
        "USERPROFILE",
        "SystemRoot",
        "WINDIR",
        "TEMP",
        "TMP",
        "TMPDIR",
        "LANG",
        "LC_ALL",
        "NODE_EXTRA_CA_CERTS",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "NO_PROXY",
      ].flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]])),
    );
    await writeFile(join(task, "models.json"), "{}");
    const env = {
      ...inherited,
      XDG_CONFIG_HOME: join(task, "config"),
      XDG_DATA_HOME: join(task, "data"),
      XDG_CACHE_HOME: join(task, "cache"),
      XDG_STATE_HOME: join(task, "state"),
      OPENCODE_TEST_HOME: task,
      OPENCODE_MODELS_PATH: join(task, "models.json"),
      OPENCODE_SERVER_PASSWORD: "notification-smoke-password",
      OPENCODE_NOTIFY_URL: router.url,
      OPENCODE_NOTIFY_TOKEN: router.token,
      OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
      OPENCODE_DISABLE_MODELS_FETCH: "1",
      OPENCODE_DISABLE_AUTOUPDATE: "1",
      OPENCODE_DISABLE_PROJECT_CONFIG: "1",
      OPENCODE_DISABLE_CLAUDE_CODE: "1",
      OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
      OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
    };
    let output = "";
    const server = spawn(
      "npm",
      [
        "exec",
        "--yes",
        `--package=${packageName}@${version}`,
        "--",
        "opencode",
        "serve",
        "--hostname",
        "127.0.0.1",
        "--port",
        "0",
      ],
      { cwd: workspace, env, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" },
    );
    child = server;
    const serverUrl = await new Promise<string>((resolveUrl, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`OpenCode startup timed out: ${output}`));
      }, 60_000);
      const onData = (chunk: Buffer) => {
        output += String(chunk);
        const match = /server listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(output);
        if (match?.[1]) {
          clearTimeout(timeout);
          resolveUrl(match[1]);
        }
      };
      server.stdout.on("data", onData);
      server.stderr.on("data", onData);
      server.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      server.once("exit", (code) => {
        clearTimeout(timeout);
        reject(new Error(`OpenCode exited ${String(code)}: ${output}`));
      });
    });
    const apiUrl = `${serverUrl}${v2 ? "/api" : ""}`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from("opencode:notification-smoke-password").toString("base64")}`,
    };
    const sessionResponse = await fetch(`${apiUrl}/session`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Notification smoke",
        ...(v2 ? { location: { directory: workspace }, model: { providerID: "notify-test", id: "stub" } } : {}),
      }),
      signal: AbortSignal.timeout(60_000),
    });
    assert.equal(sessionResponse.status, 200, output);
    const sessionBody = (await sessionResponse.json()) as { id?: string; data?: { id?: string } };
    const session = v2 ? sessionBody.data : sessionBody;
    assert.ok(session);
    assert.ok(typeof session.id === "string");
    const answer = await fetch(`${apiUrl}/session/${session.id}/${v2 ? "prompt" : "message"}`, {
      method: "POST",
      headers,
      body: JSON.stringify(
        v2
          ? { text: "Reply with OK" }
          : {
              model: { providerID: "notify-test", modelID: "stub" },
              parts: [{ type: "text", text: "Reply with OK" }],
            },
      ),
      signal: AbortSignal.timeout(60_000),
    });
    assert.equal(answer.status, 200, output);
    await answer.arrayBuffer();
    for (let attempt = 0; attempt < 600 && received.length === 0; attempt++)
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
    assert.ok(requests > 0, `Real OpenCode must call the local provider. OpenCode output:\n${output}`);
    assert.equal(received.length, 1, `Expected a completion notification. OpenCode output:\n${output}`);
    const notification = received[0];
    assert.ok(notification);
    assert.equal(notification.event, "complete");
    assert.equal(sources.length, 1, "Real OpenCode startup must register exactly one instance");
    assert.equal(notification.instanceId, sources[0]?.instanceId);
    assert.equal(notification.sessionTitle, "Notification smoke");
    console.log(
      `Real OpenCode ${packageName}@${version} server smoke passed: local provider -> native session events -> bundled plugin -> authenticated HTTP notification.`,
    );
  } finally {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
      else child.kill();
      await once(child, "exit");
    }
    await router.close();
    model.closeAllConnections();
    await new Promise<void>((resolve) => {
      model.close(() => {
        resolve();
      });
    });
    await rm(task, { recursive: true, force: true });
  }
}
