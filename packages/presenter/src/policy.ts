import { parseNotification, parseRelay, type DisplayMode, type Notification, type NotificationKind, type Relay } from '../../protocol/src/index.js';

export interface PresenterOptions {
  enabled: boolean;
  trusted?: boolean;
  mode: DisplayMode;
  focused: boolean;
  sound: boolean;
  events: Partial<Record<NotificationKind, boolean>>;
}
interface Adapters {
  options(): PresenterOptions;
  app(notification: Notification, origin?: Relay['origin']): void;
  relay?(notification: Notification): Promise<boolean>;
  system(notification: Notification, sound: boolean): Promise<void>;
  log(message: string): void;
}

export function createPresenter(adapters: Adapters) {
  const seen = new Set<string>();
  const remember = (id: string) => {
    seen.add(id);
    if (seen.size > 4096) seen.delete(seen.values().next().value!);
  };
  const enabled = (notification: Notification, options: PresenterOptions) =>
    options.enabled && options.trusted !== false && options.events[notification.event] !== false;
  function app(notification: Notification, origin?: Relay['origin'], requireFocus = false): boolean {
    const options = adapters.options();
    if (!enabled(notification, options) || (requireFocus && !options.focused)) return false;
    try { adapters.app(notification, origin); return true; }
    catch (error) { adapters.log(`VS Code notification failed: ${String(error)}`); return false; }
  }
  return {
    receive(value: unknown): boolean {
      const relay = parseRelay(value);
      const options = adapters.options();
      if (!enabled(relay.notification, options) || !options.focused) return false;
      if (seen.has(relay.notification.id)) return true;
      if (!app(relay.notification, relay.origin, true)) return false;
      remember(relay.notification.id);
      return true;
    },
    async deliver(value: unknown): Promise<void> {
      const notification = parseNotification(value);
      const options = adapters.options();
      if (!enabled(notification, options) || seen.has(notification.id)) return;
      remember(notification.id);
      let mode = options.mode;
      if (mode === 'auto') mode = notification.display ?? 'auto';
      if (mode === 'auto') mode = options.focused ? 'app' : 'system';
      if (mode === 'app') { app(notification); return; }
      let accepted = false;
      // Start native delivery before remote discovery; consume failures immediately.
      const native = mode === 'both' && !options.focused
        ? Promise.resolve().then(() => adapters.system(notification, options.sound)).then(() => ({ failed: false as const }), error => ({ failed: true as const, error }))
        : undefined;
      if (mode === 'both') {
        if (adapters.options().focused) accepted = app(notification, undefined, true);
        else if (adapters.relay) {
          try { accepted = await adapters.relay(notification); }
          catch (error) { adapters.log(`Focused window discovery failed: ${String(error)}`); }
        }
      }
      try {
        if (native) { const result = await native; if (result.failed) throw result.error; }
        else await adapters.system(notification, options.sound);
      }
      catch (error) {
        adapters.log(`OS notification failed: ${error instanceof Error ? error.message : String(error)}`);
        if (!accepted) app(notification);
      }
    },
  };
}

export function notificationSeverity(notification: Notification): 'info' | 'warning' | 'error' {
  if (notification.event === 'error') return 'error';
  return notification.event === 'question' || notification.event === 'permission' ? 'warning' : 'info';
}

export function notificationLabel(notification: Notification): string {
  const labels: Record<NotificationKind, string> = { complete: 'Complete', question: 'Question', permission: 'Permission required', error: 'Error', subagent_complete: 'Subagent complete' };
  // The plugin's title already applies showProjectName; raw routing fields are private.
  return `${notification.title} · ${labels[notification.event]}${notification.sessionTitle ? ` · ${notification.sessionTitle}` : ''}`;
}
