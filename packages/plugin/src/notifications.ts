import { basename } from 'node:path';
import { cleanText, type Notification, type NotificationKind } from '../../protocol/src/index.js';
import type { PluginConfig } from './config.js';

export interface SessionInfo { id: string; title?: string; parentID?: string }
export interface NotificationDependencies {
  config: PluginConfig;
  directory: string;
  instanceId: string;
  terminalId?: string;
  now(): number;
  send(notification: Notification): Promise<void>;
  session(id: string): Promise<SessionInfo | undefined>;
  log(message: string): void;
}

export function createNotificationSender(deps: NotificationDependencies) {
  const sessions = new Map<string, SessionInfo>();
  let counter = 0;
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

  return { notify, sessions };
}
