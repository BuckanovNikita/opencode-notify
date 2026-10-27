import { basename } from 'node:path';
import { cleanText, isRecord, type Notification, type NotificationKind } from '../../protocol/src/index.js';
import type { PluginConfig } from './config.js';

export interface SessionInfo { id: string; title?: string; parentID?: string }
interface Run {
  started: number;
  active: boolean;
  idle: boolean;
  success: boolean;
  failed: boolean;
  errorSent: boolean;
  pending: Set<string>;
  userId?: string;
}
interface Dependencies {
  config: PluginConfig;
  directory: string;
  instanceId: string;
  terminalId?: string;
  now(): number;
  send(notification: Notification): Promise<void>;
  session(id: string): Promise<SessionInfo | undefined>;
  log(message: string): void;
}

export function createController(deps: Dependencies) {
  const sessions = new Map<string, SessionInfo>();
  const runs = new Map<string, Run>();
  const seen = new Set<string>();
  let counter = 0;

  function remember(key: string): boolean {
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.size > 4096) seen.delete(seen.values().next().value!);
    return true;
  }

  function run(id: string): Run {
    let value = runs.get(id);
    if (!value) {
      value = { started: deps.now(), active: false, idle: false, success: false,
        failed: false, errorSent: false, pending: new Set() };
      runs.set(id, value);
    }
    return value;
  }

  async function notify(kind: NotificationKind, id: string): Promise<void> {
    if (!deps.config.enabled) return;
    let info = sessions.get(id);
    if (!info) {
      try { info = await deps.session(id); if (info) sessions.set(id, info); }
      catch { deps.log(`Session metadata unavailable for ${id}`); }
    }
    if (kind === 'complete' && info?.parentID) kind = 'subagent_complete';
    if (!deps.config.events[kind]) return;
    const project = cleanText(basename(deps.directory) || 'workspace', 512);
    const sessionTitle = deps.config.showSessionTitle ? cleanText(info?.title || id, 1024) : '';
    const labels: Record<NotificationKind, string> = {
      complete: 'Run completed', question: 'Question needs your answer',
      permission: 'Permission required', error: 'Agent error', subagent_complete: 'Subagent completed',
    };
    const notification: Notification = {
      version: 1, id: `${deps.instanceId}:${++counter}`, event: kind, sessionId: id, instanceId: deps.instanceId,
      project, directory: cleanText(deps.directory, 4096),
      title: deps.config.showProjectName ? `OpenCode · ${project}` : 'OpenCode',
      message: `${labels[kind]}${sessionTitle ? ` · ${sessionTitle}` : ''}`,
      occurredAt: deps.now(), display: deps.config.display,
      ...(deps.terminalId ? { terminalId: deps.terminalId } : {}),
      ...(sessionTitle ? { sessionTitle } : {}),
    };
    try { await deps.send(notification); }
    catch (error) { deps.log(`Notification delivery failed: ${error instanceof Error ? error.message : String(error)}`); }
  }

  async function finish(id: string, state: Run): Promise<void> {
    if (!state.active || !state.idle || !state.success || state.failed || state.pending.size > 0) return;
    // Consume the run before awaiting IO: OpenCode v1 does not await event hooks.
    state.active = false;
    if (deps.now() - state.started >= deps.config.minDurationMs) await notify('complete', id);
  }

  async function event(value: unknown): Promise<void> {
    if (!isRecord(value) || !isRecord(value.properties) || typeof value.type !== 'string') return;
    const p = value.properties;
    const info = isRecord(p.info) ? p.info : undefined;
    const id = typeof p.sessionID === 'string' ? p.sessionID :
      typeof info?.sessionID === 'string' ? info.sessionID :
      value.type.startsWith('session.') && typeof info?.id === 'string' ? info.id : undefined;
    if (!id) return;
    if (value.type === 'session.deleted') { runs.delete(id); sessions.delete(id); return; }
    if ((value.type === 'session.created' || value.type === 'session.updated') && info) {
      sessions.set(id, { id, ...(typeof info.title === 'string' ? { title: info.title } : {}),
        ...(typeof info.parentID === 'string' ? { parentID: info.parentID } : {}) });
      return;
    }
    const state = run(id);
    const status = isRecord(p.status) ? p.status.type : undefined;
    if (value.type === 'session.status' && (status === 'busy' || status === 'retry')) {
      if (!state.active) {
        state.started = deps.now(); state.active = true; state.success = false;
        state.failed = false; state.errorSent = false;
      }
      state.idle = false;
    } else if (value.type === 'session.idle' || (value.type === 'session.status' && status === 'idle')) {
      state.idle = true;
      await finish(id, state);
    } else if (value.type === 'message.updated' && info?.role === 'user' && typeof info.id === 'string') {
      if (state.userId !== info.id) {
        state.success = false;
        state.idle = false;
        if (state.active) state.started = deps.now();
      }
      state.userId = info.id;
    } else if (value.type === 'message.updated' && info?.role === 'assistant' && isRecord(info.time)) {
      const created = info.time.created;
      // Parent identity survives delayed event delivery and wall-clock adjustments.
      // Timestamp fallback covers sessions attached after their user message event.
      const current = state.userId ? info.parentID === state.userId : typeof created === 'number' && created >= state.started;
      if (current && info.error) {
        state.failed = true; state.active = false; state.success = false; state.pending.clear();
        const aborted = isRecord(info.error) && ['MessageAbortedError', 'AbortError'].includes(String(info.error.name));
        if (!aborted && !state.errorSent) { state.errorSent = true; await notify('error', id); }
      } else if (state.active && current && info.summary !== true &&
          typeof info.time.completed === 'number' && !info.error && typeof info.finish === 'string' &&
          (info.structured !== undefined || (info.finish !== 'tool-calls' && info.finish !== 'unknown')) && typeof info.id === 'string' &&
          remember(`${id}:assistant:${info.id}`)) {
        state.success = true;
        await finish(id, state);
      }
    } else if (value.type === 'question.asked' || value.type === 'permission.asked' || value.type === 'permission.updated') {
      const kind = value.type === 'question.asked' ? 'question' : 'permission';
      const request = typeof p.id === 'string' ? p.id : undefined;
      if (!request) return;
      const key = `${kind}:${request}`;
      state.pending.add(key);
      if (remember(`${id}:${key}`)) await notify(kind, id);
    } else if (['question.replied', 'question.rejected', 'permission.replied'].includes(value.type)) {
      const request = p.requestID ?? p.permissionID ?? p.id;
      if (typeof request === 'string') state.pending.delete(`${value.type.startsWith('question.') ? 'question' : 'permission'}:${request}`);
      // Wait for the run's own next idle/final-message signal, not a human reply.
    } else if (value.type === 'session.error') {
      state.failed = true; state.active = false; state.pending.clear();
      const aborted = isRecord(p.error) && ['MessageAbortedError', 'AbortError'].includes(String(p.error.name));
      if (!aborted && !state.errorSent) { state.errorSent = true; await notify('error', id); }
    }
  }
  return { event };
}
