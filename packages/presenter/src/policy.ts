import { parseNotification, type DisplayMode, type Notification, type NotificationKind } from '../../protocol/src/index.js';

export interface PresenterOptions {
  enabled: boolean;
  mode: DisplayMode;
  focused: boolean;
  sound: boolean;
  events: Partial<Record<NotificationKind, boolean>>;
}
interface Adapters {
  options(): PresenterOptions;
  app(notification: Notification): void;
  system(notification: Notification, sound: boolean): Promise<void>;
  log(message: string): void;
}

export function createPresenter(adapters: Adapters) {
  const seen = new Set<string>();
  return {
    async deliver(value: unknown): Promise<void> {
      const notification = parseNotification(value);
      const options = adapters.options();
      if (!options.enabled || options.events[notification.event] === false || seen.has(notification.id)) return;
      seen.add(notification.id);
      if (seen.size > 4096) seen.delete(seen.values().next().value!);
      let mode = options.mode;
      if (mode === 'auto') mode = notification.display ?? 'auto';
      if (mode === 'auto') mode = options.focused ? 'app' : 'system';
      if (mode === 'app') { adapters.app(notification); return; }
      try { await adapters.system(notification, options.sound); }
      catch (error) {
        adapters.log(`OS notification failed; using VS Code: ${error instanceof Error ? error.message : String(error)}`);
        adapters.app(notification);
      }
    },
  };
}
