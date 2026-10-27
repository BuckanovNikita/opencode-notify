import * as vscode from 'vscode';
import { COMMANDS, EVENT_KINDS, isRecord, parseNotification, type DisplayMode, type Notification } from '../../protocol/src/index.js';
import { createPresenter, notificationLabel, notificationSeverity } from './policy.js';
import { createPeers, sharedPeerDirectory } from './peers.js';
import { createActivationTargets, createForegroundWindow } from './activation.js';
import { createNativeNotifications } from './native.js';
import { createRouterSetup, newestVersion, routerVersionFromList } from './setup.js';

export function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('OpenCode Notify');
  context.subscriptions.push(output);
  const log = (message: string) => output.appendLine(`${new Date().toISOString()} ${message}`);
  let alive = true;
  context.subscriptions.push({ dispose: () => { alive = false; } });
  const options = () => {
    const config = vscode.workspace.getConfiguration('opencodeNotify');
    return { enabled: alive && config.get<boolean>('enabled', true), trusted: vscode.workspace.isTrusted,
      mode: config.get<DisplayMode>('systemNotifications', 'both'), focused: vscode.window.state.focused,
      sound: config.get<boolean>('sound', true),
      events: Object.fromEntries(EVENT_KINDS.map(kind => [kind, config.get<boolean>(`events.${kind}`, true)])) };
  };
  const targets = createActivationTargets({
    foreground: createForegroundWindow({
      focused: () => vscode.window.state.focused,
      commands: () => vscode.commands.getCommands(true),
      execute: command => vscode.commands.executeCommand(command), log,
    }),
    focus: async notification => {
      if (!options().enabled || !vscode.workspace.isTrusted) return;
      await vscode.commands.executeCommand(COMMANDS.focus, notification);
    },
    uri: async targetId => (await vscode.env.asExternalUri(vscode.Uri.from({
      scheme: vscode.env.uriScheme, authority: context.extension.id, path: '/activate', query: `target=${encodeURIComponent(targetId)}`,
    }))).toString(),
    open: async uri => vscode.env.openExternal(vscode.Uri.parse(uri)),
  });
  context.subscriptions.push(targets);
  context.subscriptions.push(vscode.window.registerUriHandler({ handleUri: uri => {
    if (uri.path !== '/activate') return;
    const target = new URLSearchParams(uri.query).get('target');
    if (target) void targets.resume(target).catch(error => log(`Origin terminal activation failed: ${String(error)}`));
  } }));
  const localTargets = new Map<string, string>();
  const originTarget = (notification: Notification) => {
    let id = localTargets.get(notification.id);
    if (!id) {
      id = targets.register(notification); localTargets.set(notification.id, id);
      if (localTargets.size > 4096) localTargets.delete(localTargets.keys().next().value!);
    }
    return id;
  };
  const native = createNativeNotifications(context.asAbsolutePath(
    `node_modules/node-notifier/vendor/snoreToast/snoretoast-${process.arch === 'ia32' ? 'x86' : 'x64'}.exe`), log);
  context.subscriptions.push(native);
  const activateLocal = (targetId: string) => {
    void targets.activate(targetId).catch(error => log(`Could not open OpenCode origin: ${String(error)}`));
  };
  const presenter = createPresenter({
    options,
    app: (notification, origin) => {
      const severity = notificationSeverity(notification);
      const show = severity === 'error' ? vscode.window.showErrorMessage :
        severity === 'warning' ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
      void show(`${notificationLabel(notification)}: ${notification.message}`, 'Open OpenCode').then(action => {
        if (action !== 'Open OpenCode') return;
        if (origin) void peersReady.then(async peer => {
          if (!peer || !await peer.activate(origin)) log('The notification origin is no longer available');
        }).catch(error => log(`Origin activation failed: ${String(error)}`));
        else activateLocal(originTarget(notification));
      }, error => log(`VS Code notification failed: ${String(error)}`));
    },
    relay: async notification => {
      const peer = await peersReady;
      if (!peer) return false;
      return peer.relay({ version: 1, notification, origin: { peerId: peer.id, targetId: originTarget(notification) } });
    },
    system: (notification, sound) => {
      const targetId = originTarget(notification);
      return native.notify({ ...notification, title: notificationLabel(notification) }, sound, () => activateLocal(targetId));
    }, log,
  });
  const peersReady = (async () => createPeers({
    directory: sharedPeerDirectory(context.globalStorageUri.fsPath),
    available: () => { const current = options(); return current.enabled && current.trusted && current.focused; },
    receive: value => presenter.receive(value), activate: targetId => targets.activate(targetId), log,
  }))().catch(error => { log(`Local peer discovery unavailable: ${String(error)}`); return undefined; });
  context.subscriptions.push({ dispose: () => { void peersReady.then(peer => peer?.dispose()).catch(error => log(`Peer shutdown failed: ${String(error)}`)); } });
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
