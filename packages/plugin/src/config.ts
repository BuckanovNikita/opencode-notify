import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { EVENT_KINDS, isRecord, type DisplayMode, type NotificationKind } from '../../protocol/src/index.js';

export interface PluginConfig {
  enabled: boolean;
  events: Record<NotificationKind, boolean>;
  minDurationMs: number;
  showSessionTitle: boolean;
  showProjectName: boolean;
  display: DisplayMode;
}

export const defaultConfig: PluginConfig = {
  enabled: true,
  events: { complete: true, question: true, permission: true, error: true, subagent_complete: false },
  minDurationMs: 0, showSessionTitle: true, showProjectName: true, display: 'auto',
};

export function parseConfig(value: unknown): PluginConfig {
  if (!isRecord(value)) throw new Error('Plugin configuration must be a JSON object');
  const result = { ...defaultConfig, events: { ...defaultConfig.events } };
  for (const key of ['enabled', 'showSessionTitle', 'showProjectName'] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'boolean') throw new Error(`${key} must be boolean`);
      result[key] = value[key];
    }
  }
  if (value.minDurationMs !== undefined) {
    if (typeof value.minDurationMs !== 'number' || !Number.isFinite(value.minDurationMs) || value.minDurationMs < 0) {
      throw new Error('minDurationMs must be a nonnegative number');
    }
    result.minDurationMs = value.minDurationMs;
  }
  if (value.display !== undefined) {
    if (typeof value.display !== 'string' || !['auto', 'app', 'system', 'both'].includes(value.display)) throw new Error('Invalid display mode');
    result.display = value.display as DisplayMode;
  }
  if (value.events !== undefined) {
    if (!isRecord(value.events)) throw new Error('events must be an object');
    for (const key of Object.keys(value.events)) {
      if (!EVENT_KINDS.includes(key as NotificationKind) || typeof value.events[key] !== 'boolean') {
        throw new Error(`Invalid event setting: ${key}`);
      }
      result.events[key as NotificationKind] = value.events[key] as boolean;
    }
  }
  return result;
}

export function configDirectory(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'opencode');
}

export async function loadConfig(directory = configDirectory()): Promise<PluginConfig> {
  try {
    return parseConfig(JSON.parse(await readFile(join(directory, 'opencode-notify.json'), 'utf8')));
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return { ...defaultConfig, events: { ...defaultConfig.events } };
    throw error;
  }
}
