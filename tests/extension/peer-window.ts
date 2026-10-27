import * as vscode from 'vscode';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join, basename } from 'node:path';

interface Instruction { id: string; kind: 'deliver' | 'prepare' | 'cleanup'; notification?: unknown }

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const directory = process.env.OPENCODE_NOTIFY_PEER_SMOKE_DIR;
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!directory || !workspace) return;
  const name = basename(workspace);
  if (name !== 'window-A' && name !== 'window-B') return;
  const stateFile = join(directory, `${name}.state.json`);
  let foregroundCommandAvailable = false;
  let ready = false; let processed = ''; let accepted: unknown; let error: string | undefined;
  let origin: vscode.Terminal | undefined;
  let decoy: vscode.Terminal | undefined;
  const state = async () => {
    const temporary = `${stateFile}.tmp`;
    await writeFile(temporary, JSON.stringify({ name, ready, processed, accepted, error,
      focused: vscode.window.state.focused, foregroundCommandAvailable, uriScheme: vscode.env.uriScheme, profileStorage: context.globalStorageUri.fsPath, configuredTitle: vscode.workspace.getConfiguration('window').get<string>('title'), terminalActive: !!origin && vscode.window.activeTerminal === origin,
      terminalName: vscode.window.activeTerminal?.name, terminals: vscode.window.terminals.length }), { mode: 0o600 });
    await rename(temporary, stateFile);
  };
  try {
    let presenter = vscode.extensions.getExtension('buckanovnikita.opencode-notify');
    for (let attempt = 0; !presenter && attempt < 900; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      presenter = vscode.extensions.getExtension('buckanovnikita.opencode-notify');
    }
    if (!presenter) throw new Error('Packaged presenter missing');
    await presenter.activate();
    for (let attempt = 0; attempt < 900; attempt++) {
      if (vscode.extensions.getExtension('buckanovnikita.opencode-notify-router')?.isActive) break;
      if (attempt === 899) throw new Error('Router did not activate');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await vscode.workspace.getConfiguration('opencodeNotify').update('systemNotifications', 'both', vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('opencodeNotify').update('sound', false, vscode.ConfigurationTarget.Global);
    // Real manually launched npm/node source; the shell remains after source exit.
    const fixture = join(directory, 'source');
    origin = vscode.window.createTerminal({ name: 'node', cwd: fixture,
      shellPath: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      shellArgs: process.platform === 'win32' ? ['/d', '/c', 'npm run source & pause'] : ['-c', 'npm run source; sleep 180'],
      env: { SOURCE_INSTANCE: name, SOURCE_RESULT: join(directory, `${name}.source.json`) } });
    context.subscriptions.push(origin);
    // Keep the origin terminal different from the initially active terminal.
    decoy = vscode.window.createTerminal({ name: 'node', cwd: fixture });
    context.subscriptions.push(decoy); decoy.show();
    foregroundCommandAvailable = (await vscode.commands.getCommands(true)).includes('workbench.action.focusWindow');
    ready = true;
  } catch (failure) { error = String(failure); }
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    void (async () => {
      try {
        let instruction: Instruction | undefined;
        try { instruction = JSON.parse(await readFile(join(directory, `${name}.command.json`), 'utf8')) as Instruction; }
        catch (failure) { if (!(failure instanceof Error && 'code' in failure && failure.code === 'ENOENT')) throw failure; }
        if (instruction && instruction.id !== processed) {
          if (instruction.kind === 'deliver') accepted = await vscode.commands.executeCommand('opencodeNotify.deliver', instruction.notification);
          else if (instruction.kind === 'cleanup') { for (const terminal of vscode.window.terminals) terminal.dispose(); }
          else if (instruction.kind === 'prepare') {
            await vscode.commands.executeCommand('notifications.clearAll');
            decoy?.show();
          }
          processed = instruction.id;
        }
      } catch (failure) { error = String(failure); }
      await state();
    })().catch(failure => { error = String(failure); }).finally(() => { busy = false; });
  }, 100);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  await state();
}
