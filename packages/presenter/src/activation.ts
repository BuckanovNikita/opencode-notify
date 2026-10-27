import { randomUUID } from 'node:crypto';
import type { Notification } from '../../protocol/src/index.js';

interface ActivationAdapters {
  foreground(): Promise<boolean>;
  focus(notification: Notification): Promise<void>;
  uri(targetId: string): Promise<string>;
  open(uri: string): Promise<boolean>;
  now?: () => number;
  limit?: number;
  lifetime?: number;
}

/** Only the originating window can resolve an opaque target to its full notification. */
export function createActivationTargets(adapters: ActivationAdapters) {
  const now = adapters.now ?? Date.now;
  const targets = new Map<string, { notification: Notification; expires: number }>();
  const limit = adapters.limit ?? 4096;
  const lifetime = adapters.lifetime ?? 24 * 60 * 60 * 1000;
  let disposed = false;
  function lookup(id: string): Notification | undefined {
    const target = targets.get(id);
    if (!target) return undefined;
    if (target.expires <= now()) { targets.delete(id); return undefined; }
    return target.notification;
  }
  return {
    register(notification: Notification): string {
      if (disposed) throw new Error('Notification origin closed');
      // Prune on registration, without a timer that can outlive extension shutdown.
      for (const [id, target] of targets) if (target.expires <= now()) targets.delete(id);
      const id = randomUUID();
      targets.set(id, { notification, expires: now() + lifetime });
      while (targets.size > limit) targets.delete(targets.keys().next().value!);
      return id;
    },
    async activate(id: string): Promise<boolean> {
      const notification = lookup(id);
      if (!notification || disposed) return false;
      if (await adapters.foreground()) {
        if (disposed || !lookup(id)) return false;
        await adapters.focus(notification);
      } else {
        const uri = await adapters.uri(id);
        if (disposed || !lookup(id)) return false;
        if (!await adapters.open(uri)) throw new Error('Could not open notification origin URI');
      }
      return true;
    },
    async resume(id: string): Promise<void> {
      const notification = lookup(id);
      if (notification && !disposed) await adapters.focus(notification);
    },
    dispose(): void { disposed = true; targets.clear(); },
  };
}

interface ForegroundAdapters {
  focused(): boolean;
  commands(): PromiseLike<string[]>;
  execute(command: string): PromiseLike<unknown>;
  log(message: string): void;
}

/** Focus Window operates on its invoking window; switch-window actions cannot establish ownership. */
export function createForegroundWindow(adapters: ForegroundAdapters): () => Promise<boolean> {
  return async () => {
    if (adapters.focused()) return true;
    const command = 'workbench.action.focusWindow';
    try {
      if (!(await adapters.commands()).includes(command)) return false;
      await adapters.execute(command);
      // The command can finish before VS Code forwards its window-state event.
      // Give that event a bounded chance to arrive before prompting for URI consent.
      const deadline = Date.now() + 500;
      while (!adapters.focused() && Date.now() < deadline) {
        await new Promise<void>(resolve => setTimeout(resolve, 25));
      }
      // OS foreground restrictions can still defeat a resolved action.
      return adapters.focused();
    } catch (error) {
      adapters.log(`Window focus command failed; using origin URI: ${String(error)}`);
      return false;
    }
  };
}
