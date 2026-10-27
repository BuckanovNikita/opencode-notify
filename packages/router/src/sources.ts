import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import type { SourceRegistration } from '../../protocol/src/index.js';

export interface ProcessIdentity { pid: number; parentPid: number; startedAt: number }
export type InspectProcess = (pid: number) => Promise<ProcessIdentity | undefined>;
const execute = promisify(execFile);

const sameProcess = (a: ProcessIdentity, b: ProcessIdentity) =>
  a.pid === b.pid && a.parentPid === b.parentPid && a.startedAt === b.startedAt;

let ticksPerSecond: Promise<number> | undefined;

export const inspectProcess: InspectProcess = async pid => {
  if (!Number.isSafeInteger(pid) || pid <= 0) return undefined;
  if (process.platform === 'linux') {
    ticksPerSecond ??= execute('getconf', ['CLK_TCK'], { timeout: 1000, maxBuffer: 128 }).then(({ stdout }) => {
      const ticks = Number(stdout.trim());
      if (!Number.isFinite(ticks) || ticks <= 0) throw new Error('Invalid process clock');
      return ticks;
    });
    const [stat, system, ticks] = await Promise.all([readFile(`/proc/${pid}/stat`, 'utf8'), readFile('/proc/stat', 'utf8'), ticksPerSecond]);
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    const boot = /^btime (\d+)$/m.exec(system);
    const parentPid = Number(fields[1]); const startedTicks = Number(fields[19]);
    if (!boot || !Number.isSafeInteger(parentPid) || !Number.isFinite(startedTicks)) return undefined;
    return { pid, parentPid, startedAt: Number(boot[1]) * 1000 + startedTicks * 1000 / ticks };
  }
  if (process.platform === 'win32') return (await windowsSnapshot()).get(pid);
  const { stdout } = await execute('ps', ['-p', String(pid), '-o', 'pid=', '-o', 'ppid=', '-o', 'lstart='],
    { timeout: 2000, maxBuffer: 8192, env: { ...process.env, LC_ALL: 'C' } });
  const row = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(stdout);
  if (!row || Number(row[1]) !== pid) return undefined;
  const startedAt = Date.parse(row[3]!);
  return Number.isFinite(startedAt) ? { pid, parentPid: Number(row[2]), startedAt } : undefined;
};

async function windowsSnapshot(): Promise<Map<number, ProcessIdentity>> {
  const script = "@(Get-CimInstance Win32_Process | ForEach-Object {[pscustomobject]@{pid=$_.ProcessId;parentPid=$_.ParentProcessId;startedAt=([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds()}})|ConvertTo-Json -Compress";
  const { stdout } = await execute('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    { timeout: 2000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) throw new Error('Invalid process snapshot');
  const rows = new Map<number, ProcessIdentity>();
  for (const value of parsed) {
    if (!value || typeof value !== 'object') continue;
    const row = value as Record<string, unknown>;
    if (typeof row.pid !== 'number' || !Number.isSafeInteger(row.pid) || row.pid <= 0 ||
        typeof row.parentPid !== 'number' || !Number.isSafeInteger(row.parentPid) || row.parentPid < 0 ||
        typeof row.startedAt !== 'number' || !Number.isFinite(row.startedAt)) continue;
    rows.set(row.pid, { pid: row.pid, parentPid: row.parentPid, startedAt: row.startedAt });
  }
  return rows;
}

type Resolution<T> = { kind: 'exact'; terminal: T } | { kind: 'ambiguous'; terminals: T[] } | { kind: 'unavailable' };
interface TerminalRecord { identity?: ProcessIdentity; terminalId?: string }
interface SourceBinding<T> { source: SourceRegistration; terminals: T[] }

/** Owns terminal objects, never terminal labels or directory-based guesses. */
export class SourceRegistry<T extends object> {
  private readonly terminals = new Map<T, TerminalRecord>();
  private readonly sources = new Map<string, SourceBinding<T>>();
  constructor(private readonly inspect: InspectProcess = inspectProcess) {}

  async observe(terminal: T, pid: number | undefined, terminalId?: string): Promise<void> {
    const record: TerminalRecord = terminalId ? { terminalId } : {};
    this.terminals.set(terminal, record);
    if (pid) {
      const identity = await this.read(pid);
      if (identity) record.identity = identity;
    }
  }

  close(terminal: T): void {
    this.terminals.delete(terminal);
  }

  async register(source: SourceRegistration): Promise<void> {
    // Preserve successful bindings (including closed objects); allow the same
    // immutable registration to retry a transient inspection failure.
    const existing = this.sources.get(source.instanceId);
    if (existing && (existing.terminals.length || existing.source.pid !== source.pid ||
        existing.source.parentPid !== source.parentPid || existing.source.startedAt !== source.startedAt ||
        existing.source.directory !== source.directory || existing.source.terminalId !== source.terminalId)) return;
    if (!existing && this.sources.size >= 4096) return;
    const binding: SourceBinding<T> = existing || { source, terminals: [] };
    this.sources.set(source.instanceId, binding);
    // One fresh Windows snapshot provides a bounded, consistent ancestry walk.
    let inspect = this.inspect;
    if (inspect === inspectProcess && process.platform === 'win32') {
      try { const rows = await windowsSnapshot(); inspect = async pid => rows.get(pid); } catch { return; }
    }
    const deadline = Date.now() + 2000;
    const identity = await this.read(source.pid, inspect);
    // Registration uses Date.now() - process.uptime(); tolerate its clock estimate
    // and POSIX lstart precision, but compare observed process identities exactly.
    if (!identity || identity.pid !== source.pid || identity.parentPid !== source.parentPid || Math.abs(identity.startedAt - source.startedAt) >= 1500) return;
    if (source.terminalId) {
      const exact = [...this.terminals].filter(([, value]) => value.terminalId === source.terminalId).map(([terminal]) => terminal);
      // An explicit extension terminal ID is authoritative. If it is absent,
      // it may belong to a closed terminal; never retarget it through ancestry.
      if (!binding.terminals.length) binding.terminals = exact;
      return;
    }
    const ancestors = new Map<number, ProcessIdentity>();
    let current: ProcessIdentity | undefined = identity;
    for (let depth = 0; current && depth < 64; depth++) {
      if (ancestors.has(current.pid)) return;
      ancestors.set(current.pid, current);
      if (current.parentPid <= 0) break;
      if (Date.now() >= deadline) return;
      const parent = await this.read(current.parentPid, inspect);
      if (parent && parent.startedAt > current.startedAt + 1500) return;
      current = parent;
    }
    const matches: T[] = [];
    for (const [terminal, record] of this.terminals) {
      if (!record.identity) continue;
      const ancestor = ancestors.get(record.identity.pid);
      if (ancestor && sameProcess(ancestor, record.identity)) matches.push(terminal);
    }
    // Overlapping retries may inspect in parallel, but commit one immutable binding.
    if (!binding.terminals.length) binding.terminals = matches;
  }

  resolve(value: { instanceId?: string; terminalId?: string }): Resolution<T> {
    if (value.instanceId) {
      const binding = this.sources.get(value.instanceId);
      if (binding) return this.selection(binding.terminals);
    }
    if (value.terminalId) {
      return this.selection([...this.terminals].filter(([, record]) => record.terminalId === value.terminalId).map(([terminal]) => terminal));
    }
    return { kind: 'unavailable' };
  }

  private selection(candidates: T[]): Resolution<T> {
    const open = candidates.filter(terminal => this.terminals.has(terminal));
    if (open.length === 1) return { kind: 'exact', terminal: open[0]! };
    return open.length ? { kind: 'ambiguous', terminals: open } : { kind: 'unavailable' };
  }

  private async read(pid: number, inspect = this.inspect): Promise<ProcessIdentity | undefined> {
    try { return await inspect(pid); } catch { return undefined; }
  }
}
