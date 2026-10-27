import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import notifier from 'node-notifier';
import { createWindowsNotifications } from './windows.js';
import type { Notification } from '../../protocol/src/index.js';

const execute = promisify(execFile);

export async function nativeNotification(notification: Notification, sound: boolean, onClick: () => void): Promise<void> {
  if (process.platform === 'linux') {
    // Arguments are data, including leading dashes, quotes and shell substitutions.
    await execute('notify-send', ['--app-name=OpenCode Notify', '--expire-time=10000',
      '--icon=dialog-information', ...(sound ? ['--hint=string:sound-name:message-new-instant'] : ['--hint=boolean:suppress-sound:true']),
      '--', notification.title, notification.message], { timeout: 5000, windowsHide: true });
    return;
  }
  if (process.platform !== 'darwin') throw new Error('Unsupported desktop platform');
  await desktopNotification(notification, sound, onClick, process.platform, notifier);
}

interface DesktopBackend {
  notify(options: { title: string; message: string; sound: boolean; wait: boolean; timeout: number },
    callback: notifier.NotificationCallback): unknown;
}

export async function desktopNotification(notification: Notification, sound: boolean, onClick: () => void,
  platform: 'darwin', backend: DesktopBackend): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error('Native notification helper did not return confirmation'));
    }, 15_000);
    timer.unref();
    // Native callbacks can arrive after the popup is dismissed. The extension schedules
    // this adapter in the background, so HTTP acceptance never waits for the user.
    try {
      backend.notify({ title: notification.title, message: notification.message, sound,
        wait: true, timeout: 10 }, (error, response) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (error) { reject(error); return; }
        if (response === 'activate' || response === 'clicked') onClick();
        resolve();
      });
    } catch (error) { settled = true; clearTimeout(timer); reject(error); }
  });
}

export function createNativeNotifications(helperPath: string, log: (message: string) => void) {
  const windows = process.platform === 'win32' ? createWindowsNotifications(helperPath, log) : undefined;
  return {
    notify(notification: Notification, sound: boolean, onClick: () => void): Promise<void> {
      if (windows) return windows.notify(notification, sound, onClick);
      return nativeNotification(notification, sound, onClick);
    },
    dispose(): void { windows?.dispose(); }
  };
}
