import { isRecord } from '../../protocol/src/index.js';

interface SetupOptions {
  enabled: boolean;
  trusted: boolean;
  version: string;
  remoteName: string | undefined;
}

interface SetupHost {
  status(): Promise<unknown>;
  installedVersion(): Promise<string | undefined>;
  install(): Promise<void>;
}

type SetupResult = 'skipped' | 'ready' | 'installed' | 'reload-required';

function versionParts(version: unknown): number[] {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid Router version');
  const parts = version.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Invalid Router version');
  return parts;
}

export function versionAtLeast(version: unknown, minimum: unknown): boolean {
  const installed = versionParts(version);
  const expected = versionParts(minimum);
  for (let index = 0; index < expected.length; index++) {
    if (installed[index] !== expected[index]) return installed[index]! > expected[index]!;
  }
  return true;
}

export function routerVersionFromList(value: unknown): string | undefined {
  if (typeof value !== 'string') throw new Error('Workspace extension inventory is unavailable');
  const lines = value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  // The CLI prefixes remote inventories with a localized location header.
  if (lines[0] && /[:：]$/.test(lines[0])) lines.shift();
  const versions = lines.flatMap(line => {
    const match = /^([\w-]+\.[\w.-]+)@(\d+\.\d+\.\d+(?:[-+][\w.+-]+)?)$/.exec(line);
    if (!match) throw new Error('Malformed workspace extension inventory');
    return match[1]!.toLowerCase() === 'buckanovnikita.opencode-notify-router' ? [match[2]!] : [];
  });
  return newestVersion(versions);
}

export function newestVersion(versions: unknown[]): string | undefined {
  let newest: string | undefined;
  for (const version of versions) {
    versionParts(version);
    if (newest === undefined || versionAtLeast(version, newest)) newest = String(version);
  }
  return newest;
}

function current(value: unknown, options: SetupOptions): boolean {
  if (value === undefined) return false;
  if (!isRecord(value)) throw new Error('Invalid Router status');
  const upToDate = versionAtLeast(value.version, options.version);
  // remoteName describes the window on BOTH hosts; extensionKind identifies the host.
  if (value.host !== (options.remoteName ? 'workspace' : 'ui')) throw new Error('Router is running on the wrong extension host. Remove any remote.extensionKind override.');
  return upToDate;
}

/** Serialize setup within a window; VS Code owns VSIX transfer and host placement. */
export function createRouterSetup(host: SetupHost): (options: SetupOptions) => Promise<SetupResult> {
  let pending: Promise<SetupResult> | undefined;
  async function install(options: SetupOptions): Promise<SetupResult> {
    versionParts(options.version);
    if (current(await host.status(), options)) return 'ready';
    const installed = await host.installedVersion();
    if (installed !== undefined && versionAtLeast(installed, options.version)) return 'reload-required';
    await host.install();
    return current(await host.status(), options) ? 'installed' : 'reload-required';
  }
  return options => {
    if (!options.enabled || !options.trusted) return Promise.resolve('skipped');
    pending ??= install(options).finally(() => { pending = undefined; });
    return pending;
  };
}
