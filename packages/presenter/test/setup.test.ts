import assert from "node:assert/strict";
import test from "node:test";
import { createRouterSetup, routerVersionFromList, newestVersion } from "../src/setup.js";

const options = { enabled: true, trusted: true, version: "0.2.0", remoteName: "ssh-remote" };

void test("first connection installs Router and later connections reuse it", async () => {
  let installed = false;
  const setup = createRouterSetup({
    installedVersion: () => Promise.resolve(undefined),
    status: () => Promise.resolve(installed ? { version: "0.2.0", host: "workspace" } : undefined),
    install: () => {
      assert.equal(installed, false);
      installed = true;
      return Promise.resolve();
    },
  });
  assert.equal(await setup(options), "installed");
  assert.equal(installed, true);
  assert.equal(await setup(options), "ready");
  return Promise.resolve();
});

void test("disabled setup and untrusted workspaces perform no host operations", async () => {
  const unexpected = (): Promise<never> => {
    return Promise.reject(new Error("Unexpected host access"));
  };
  const setup = createRouterSetup({ status: unexpected, installedVersion: unexpected, install: unexpected });
  assert.equal(await setup({ ...options, enabled: false }), "skipped");
  assert.equal(await setup({ ...options, trusted: false }), "skipped");
});

void test("matching or newer Router is preserved using numeric version ordering", async () => {
  for (const version of ["0.2.0", "0.10.0", "1.0.0"]) {
    const setup = createRouterSetup({
      installedVersion: () => Promise.resolve(undefined),
      status: () => Promise.resolve({ version, host: "workspace" }),
      install: () => {
        return Promise.reject(new Error("Unnecessary install or downgrade"));
      },
    });
    assert.equal(await setup(options), "ready");
  }
  return Promise.resolve();
});

void test("an active older Router requests reload after installing the update", async () => {
  let installs = 0;
  const setup = createRouterSetup({
    installedVersion: () => Promise.resolve(undefined),
    status: () => Promise.resolve({ version: "0.1.0", host: "workspace" }),
    install: () => {
      installs++;
      return Promise.resolve();
    },
  });
  assert.equal(await setup(options), "reload-required");
  assert.equal(installs, 1);
  return Promise.resolve();
});

void test("a Router forced onto the local host in a remote window reports a placement error", async () => {
  const setup = createRouterSetup({
    installedVersion: () => Promise.resolve(undefined),
    status: () => Promise.resolve({ version: "0.2.0", host: "ui" }),
    install: () => {
      return Promise.reject(new Error("Reinstalling cannot fix a host override"));
    },
  });
  await assert.rejects(setup(options), /wrong extension host/);
  return Promise.resolve();
});

void test("installation failures propagate and a later invocation can retry", async () => {
  let failed = false;
  const setup = createRouterSetup({
    installedVersion: () => Promise.resolve(undefined),
    status: () => Promise.resolve(undefined),
    install: () => {
      if (!failed) {
        failed = true;
        return Promise.reject(new Error("disk full"));
      }
      return Promise.resolve();
    },
  });
  await assert.rejects(setup(options), /disk full/);
  assert.equal(await setup(options), "reload-required");
  return Promise.resolve();
});

void test("concurrent requests share one installation", async () => {
  let installs = 0;
  const setup = createRouterSetup({
    installedVersion: () => Promise.resolve(undefined),
    status: () => Promise.resolve(undefined),
    install: () => {
      installs++;
      return Promise.resolve();
    },
  });
  assert.deepEqual(await Promise.all([setup(options), setup(options)]), ["reload-required", "reload-required"]);
  assert.equal(installs, 1);
  return Promise.resolve();
});

void test("malformed status is reported instead of silently replacing an unknown version", async () => {
  const setup = createRouterSetup({
    installedVersion: () => Promise.resolve(undefined),
    status: () => Promise.resolve({ version: "nonsense" }),
    install: () => {
      return Promise.reject(new Error("Must not replace unknown version"));
    },
  });
  await assert.rejects(setup({ ...options, remoteName: undefined }), /version/);
  return Promise.resolve();
});

void test("a disabled newer Router is preserved even when its status command is absent", async () => {
  const setup = createRouterSetup({
    status: () => Promise.resolve(undefined),
    installedVersion: () => Promise.resolve("0.3.0"),
    install: () => {
      return Promise.reject(new Error("Would downgrade disabled Router"));
    },
  });
  assert.equal(await setup(options), "reload-required");
  return Promise.resolve();
});

void test("a newer installed Router waiting for reload is not replaced using the old active version", async () => {
  const setup = createRouterSetup({
    status: () => Promise.resolve({ version: "0.1.0", host: "workspace" }),
    installedVersion: () => Promise.resolve("0.3.0"),
    install: () => {
      return Promise.reject(new Error("Would downgrade pending Router"));
    },
  });
  assert.equal(await setup(options), "reload-required");
  return Promise.resolve();
});

void test("remote CLI inventory accepts localized headers and validates target versions", () => {
  assert.equal(
    routerVersionFromList("Установлены на SSH:\nother.extension@1.0.0\nbuckanovnikita.opencode-notify-router@0.10.0"),
    "0.10.0",
  );
  assert.equal(routerVersionFromList("Extensions installed on server:\nother.extension@1.0.0"), undefined);
  assert.equal(routerVersionFromList(""), undefined);
  assert.throws(() => routerVersionFromList(undefined), /inventory/);
  assert.throws(() => routerVersionFromList("unexpected response"), /inventory/);
  assert.throws(() => routerVersionFromList("buckanovnikita.opencode-notify-router@nonsense"), /version|inventory/);
  assert.equal(newestVersion(["0.2.0", "0.10.0", "0.3.0"]), "0.10.0");
});

void test("unavailable installed inventory cannot authorize a replacement", async () => {
  const setup = createRouterSetup({
    status: () => Promise.resolve(undefined),
    installedVersion: () => {
      return Promise.reject(new Error("Unknown installed inventory"));
    },
    install: () => {
      return Promise.reject(new Error("Unsafe installation"));
    },
  });
  await assert.rejects(setup(options), /Unknown installed inventory/);
  return Promise.resolve();
});
