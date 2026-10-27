export const PROTOCOL_VERSION = 1;
export const MAX_BODY_BYTES = 65_536;
export const EVENT_KINDS = ['complete', 'question', 'permission', 'error', 'subagent_complete'] as const;
export type NotificationKind = (typeof EVENT_KINDS)[number];
export type DisplayMode = 'auto' | 'app' | 'system' | 'both';

export interface Notification {
  version: 1;
  id: string;
  event: NotificationKind;
  sessionId: string;
  project: string;
  directory: string;
  title: string;
  message: string;
  occurredAt: number;
  terminalId?: string;
  instanceId?: string;
  sessionTitle?: string;
  display?: DisplayMode;
}

export const COMMANDS = {
  deliver: 'opencodeNotify.deliver', focus: 'opencodeNotify.focus',
  install: 'opencodeNotify.installPlugin', start: 'opencodeNotify.start',
  test: 'opencodeNotify.test', log: 'opencodeNotify.showLog',
  status: 'opencodeNotify.routerStatus', setup: 'opencodeNotify.setup',
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, name: string, max: number, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value)) {
    throw new Error(`Invalid notification ${name}`);
  }
  return value;
}

export function parseNotification(value: unknown): Notification {
  if (!isRecord(value) || value.version !== PROTOCOL_VERSION) throw new Error('Unsupported notification protocol');
  if (!EVENT_KINDS.some(kind => kind === value.event)) throw new Error('Invalid notification event');
  if (typeof value.occurredAt !== 'number' || !Number.isFinite(value.occurredAt) || value.occurredAt < 0) {
    throw new Error('Invalid notification timestamp');
  }
  const result: Notification = {
    version: 1,
    id: text(value.id, 'id', 256),
    event: value.event as NotificationKind,
    sessionId: text(value.sessionId, 'sessionId', 256),
    project: text(value.project, 'project', 1024),
    directory: text(value.directory, 'directory', 4096, true),
    title: text(value.title, 'title', 1024),
    message: text(value.message, 'message', 8192),
    occurredAt: value.occurredAt,
  };
  if (value.terminalId !== undefined) result.terminalId = text(value.terminalId, 'terminalId', 256);
  if (value.instanceId !== undefined) result.instanceId = text(value.instanceId, 'instanceId', 256);
  if (value.sessionTitle !== undefined) result.sessionTitle = text(value.sessionTitle, 'sessionTitle', 1024);
  if (value.display !== undefined) {
    if (typeof value.display !== 'string' || !['auto', 'app', 'system', 'both'].includes(value.display)) throw new Error('Invalid notification display mode');
    result.display = value.display as DisplayMode;
  }
  return result;
}

/** Prevent control sequences and pathological session titles from reaching UIs. */
export function cleanText(value: string, max: number): string {
  return value.replace(/[\x00-\x1f\x7f]/gu, ' ').trim().slice(0, max);
}

/** Process start is epoch milliseconds, estimated from runtime uptime at startup. */
export interface SourceRegistration {
  version: 1;
  instanceId: string;
  pid: number;
  parentPid: number;
  startedAt: number;
  directory: string;
  terminalId?: string;
}

export function parseSourceRegistration(value: unknown): SourceRegistration {
  if (!isRecord(value) || value.version !== 1) throw new Error('Unsupported source protocol');
  if (!Number.isSafeInteger(value.pid) || (value.pid as number) <= 0 ||
      !Number.isSafeInteger(value.parentPid) || (value.parentPid as number) < 0 ||
      typeof value.startedAt !== 'number' || !Number.isFinite(value.startedAt) || value.startedAt < 0) {
    throw new Error('Invalid source process identity');
  }
  const result: SourceRegistration = {
    version: 1, instanceId: text(value.instanceId, 'instanceId', 256),
    pid: value.pid as number, parentPid: value.parentPid as number, startedAt: value.startedAt,
    directory: text(value.directory, 'directory', 4096, true),
  };
  if (value.terminalId !== undefined) result.terminalId = text(value.terminalId, 'terminalId', 256);
  return result;
}

export interface Activation { version: 1; targetId: string }
export interface Relay {
  version: 1;
  notification: Notification;
  origin: { peerId: string; targetId: string };
}

export function parseActivation(value: unknown): Activation {
  if (!isRecord(value) || value.version !== 1) throw new Error('Unsupported activation protocol');
  return { version: 1, targetId: text(value.targetId, 'targetId', 256) };
}

export function parseRelay(value: unknown): Relay {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.origin)) throw new Error('Unsupported relay protocol');
  return { version: 1, notification: parseNotification(value.notification), origin: {
    peerId: text(value.origin.peerId, 'peerId', 256), targetId: text(value.origin.targetId, 'targetId', 256),
  } };
}

export type FocusTarget = Pick<Notification, 'instanceId' | 'terminalId' | 'project' | 'sessionId' | 'sessionTitle' | 'directory'>;

/** Older presenters pass only terminalId/directory to the private focus command. */
export function parseFocusTarget(value: unknown): FocusTarget {
  if (!isRecord(value)) throw new Error('Invalid focus target');
  if (value.version !== undefined) return parseNotification(value);
  return {
    project: 'OpenCode', sessionId: 'Registered terminal',
    directory: value.directory === undefined ? '' : text(value.directory, 'directory', 4096, true),
    ...(value.terminalId === undefined ? {} : { terminalId: text(value.terminalId, 'terminalId', 256) }),
  };
}
