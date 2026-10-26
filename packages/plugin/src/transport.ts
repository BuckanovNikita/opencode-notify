import { parseNotification, type Notification } from '../../protocol/src/index.js';

export function createTransport(url: string | undefined, token: string | undefined,
  fetcher: typeof fetch = fetch): (notification: Notification) => Promise<void> {
  return async notification => {
    if (!url || !token) throw new Error('Open a fresh VS Code terminal with the OpenCode Notify Router enabled');
    const target = new URL(url);
    if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.pathname !== '/notify' ||
        target.username || target.password || target.search || target.hash) {
      throw new Error('Notification endpoint must be a loopback HTTP /notify URL');
    }
    const response = await fetcher(target, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(parseNotification(notification)), signal: AbortSignal.timeout(2000), redirect: 'error',
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`Router rejected notification (HTTP ${response.status}); check the VS Code output log`);
  };
}
