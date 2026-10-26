import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import notifier from 'node-notifier';
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
  if (process.platform !== 'win32' && process.platform !== 'darwin') throw new Error('Unsupported desktop platform');
  await desktopNotification(notification, sound, onClick, process.platform, notifier);
}

interface DesktopBackend {
  notify(options: { title: string; message: string; sound: boolean; wait: boolean; timeout: number },
    callback: notifier.NotificationCallback): unknown;
}

export async function desktopNotification(notification: Notification, sound: boolean, onClick: () => void,
  platform: 'win32' | 'darwin', backend: DesktopBackend): Promise<void> {
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
        // WindowsToaster v10 drops ENOENT/EACCES errors and returns no response.
        // Treat that as uncertain delivery so the policy falls back to VS Code.
        if (platform === 'win32' && !response) { reject(new Error('Windows notification helper returned no confirmation')); return; }
        if (response === 'activate' || response === 'clicked') onClick();
        resolve();
      });
    } catch (error) { settled = true; clearTimeout(timer); reject(error); }
  });
}
