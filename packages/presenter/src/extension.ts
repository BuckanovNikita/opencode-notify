import * as vscode from 'vscode';
import { COMMANDS, EVENT_KINDS, isRecord, parseNotification, type DisplayMode, type Notification } from '../../protocol/src/index.js';
import { createPresenter } from './policy.js';
import { nativeNotification } from './native.js';
import { createRouterSetup, newestVersion, routerVersionFromList } from './setup.js';

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

  const setup = createRouterSetup({
    installedVersion: async () => {
      if (vscode.env.remoteName) {
        // VS Code's CLI inventory includes disabled extensions and the current remote profile.
        // This core command is not public API: fail closed if unavailable, never guess absence.
        return routerVersionFromList(await vscode.commands.executeCommand('_remoteCLI.manageExtensions', { list: { showVersions: true } }));
      }
      if (context.extensionMode !== vscode.ExtensionMode.Production) {
        throw new Error('Automatic Router installation requires a packaged extension');
      }
      // The public extensions API omits disabled extensions. Conservatively inspect all
      // Router copies next to this installed extension, including other profiles/obsolete copies.
      const directory = vscode.Uri.joinPath(context.extensionUri, '..');
      const versions: unknown[] = [];
      for (const [name, type] of await vscode.workspace.fs.readDirectory(directory)) {
        if (!name.toLowerCase().startsWith('buckanovnikita.opencode-notify-router-') || !(type & vscode.FileType.Directory)) continue;
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(directory, name, 'package.json'));
        const manifest: unknown = JSON.parse(new TextDecoder().decode(bytes));
        if (!isRecord(manifest) || manifest.publisher !== 'buckanovnikita' || manifest.name !== 'opencode-notify-router') {
          throw new Error('Unrecognized installed Router manifest');
        }
        versions.push(manifest.version);
      }
      return newestVersion(versions);
    },
    status: async () => {
      try { return await vscode.commands.executeCommand(COMMANDS.status); }
      catch (error) {
        // Older/missing Routers do not register this command. Other failures need diagnostics.
        if (error instanceof Error && error.message === `command '${COMMANDS.status}' not found`) return undefined;
        throw error;
      }
    },
    install: async () => {
      await vscode.commands.executeCommand('workbench.extensions.installExtension',
        vscode.Uri.joinPath(context.extensionUri, 'dist', 'router.vsix'));
    },
  });
  const runSetup = async () => {
    try {
      const result = await setup({
        enabled: vscode.workspace.getConfiguration('opencodeNotify').get<boolean>('autoInstallRouter', true),
        trusted: vscode.workspace.isTrusted,
        version: String(context.extension.packageJSON.version), remoteName: vscode.env.remoteName,
      });
      log(`Workspace Router setup: ${result}`);
      if (result === 'reload-required') {
        void vscode.window.showInformationMessage('OpenCode Notify Router is installed but not active at the required version. Enable it if disabled, then reload this window.', 'Reload Window')
          .then(action => { if (action === 'Reload Window') void vscode.commands.executeCommand('workbench.action.reloadWindow'); });
      }
    } catch (error) {
      log(`Workspace Router setup failed: ${String(error)}`);
      void vscode.window.showWarningMessage('OpenCode Notify could not set up the workspace Router. Run OpenCode Notify: Set Up Workspace to retry, or install the Router VSIX manually.', 'Show Log')
        .then(action => { if (action === 'Show Log') output.show(); });
    }
  };
  context.subscriptions.push(vscode.commands.registerCommand(COMMANDS.setup, runSetup));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('opencodeNotify.autoInstallRouter')) void runSetup();
  }));
  // Do not block notification delivery or command registration on installation.
  void runSetup();
}
