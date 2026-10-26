import * as vscode from 'vscode';
import { COMMANDS, EVENT_KINDS, parseNotification, type DisplayMode, type Notification } from '../../protocol/src/index.js';
import { createPresenter } from './policy.js';
import { nativeNotification } from './native.js';

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('OpenCode Notify');
  context.subscriptions.push(output);
  const log = (message: string) => output.appendLine(`${new Date().toISOString()} ${message}`);
  const focus = (notification: Notification) => {
    void vscode.commands.executeCommand(COMMANDS.focus, {
      terminalId: notification.terminalId, directory: notification.directory,
    }).then(undefined, error => log(`Could not focus remote terminal: ${String(error)}`));
  };
  const presenter = createPresenter({
    options: () => {
      const config = vscode.workspace.getConfiguration('opencodeNotify');
      return { enabled: config.get<boolean>('enabled', true), mode: config.get<DisplayMode>('systemNotifications', 'auto'),
        focused: vscode.window.state.focused, sound: config.get<boolean>('sound', true),
        events: Object.fromEntries(EVENT_KINDS.map(kind => [kind, config.get<boolean>(`events.${kind}`, true)])) };
    },
    app: notification => {
      const show = notification.event === 'error' ? vscode.window.showErrorMessage : vscode.window.showInformationMessage;
      void show(`${notification.title}: ${notification.message}`, 'Open terminal').then(action => {
        if (action === 'Open terminal') focus(notification);
      }, error => log(`VS Code notification failed: ${String(error)}`));
    },
    system: (notification, sound) => nativeNotification(notification, sound, () => focus(notification)), log,
  });
  context.subscriptions.push(vscode.commands.registerCommand(COMMANDS.deliver, (value: unknown) => {
    const notification = parseNotification(value);
    void presenter.deliver(notification).catch(error => log(`Presentation failed: ${String(error)}`));
    log(`Accepted ${notification.event} for session ${notification.sessionId}`);
    return true;
  }));
  context.subscriptions.push(vscode.commands.registerCommand(COMMANDS.log, () => output.show()));
  log('Local notification presenter ready');
}
