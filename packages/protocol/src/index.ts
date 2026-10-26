export const PROTOCOL_VERSION = 1;
export const MAX_BODY_BYTES = 65_536;
export const EVENT_KINDS = ['complete', 'question', 'permission', 'error', 'subagent_complete'] as const;
export type NotificationKind = (typeof EVENT_KINDS)[number];
export type DisplayMode = 'auto' | 'app' | 'system';

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
  display?: DisplayMode;
}

export const COMMANDS = {
  deliver: 'opencodeNotify.deliver', focus: 'opencodeNotify.focus',
  install: 'opencodeNotify.installPlugin', start: 'opencodeNotify.start',
  test: 'opencodeNotify.test', log: 'opencodeNotify.showLog',
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
  if (value.display !== undefined) {
    if (typeof value.display !== 'string' || !['auto', 'app', 'system'].includes(value.display)) throw new Error('Invalid notification display mode');
    result.display = value.display as DisplayMode;
  }
  return result;
}

/** Prevent control sequences and pathological session titles from reaching UIs. */
export function cleanText(value: string, max: number): string {
  return value.replace(/[\x00-\x1f\x7f]/gu, ' ').trim().slice(0, max);
}
