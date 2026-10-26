import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { COMMANDS, isRecord, type Notification } from '../../protocol/src/index.js';
import { startRouter } from './server.js';
import { installPlugin } from './install.js';

let shutdown: (() => Promise<void>) | undefined;
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export async function activate(context: vscode.ExtensionContext) {
  const output = vscode.window.createOutputChannel('OpenCode Notify Router');
  const log = (message: string) => output.appendLine(`${new Date().toISOString()} ${message}`);
  context.subscriptions.push(output);
  const router = await startRouter({ log, deliver: async notification => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const accepted = await Promise.race([
        vscode.commands.executeCommand<boolean>(COMMANDS.deliver, notification),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Presenter timeout')), 1500); }),
      ]);
      if (accepted !== true) throw new Error('Presenter did not accept notification');
    } finally { if (timer) clearTimeout(timer); }
  } });
  shutdown = router.close;
  const env = context.environmentVariableCollection;
  env.persistent = false;
  env.description = 'Routes OpenCode v1 notifications to this VS Code window. Restart terminals after reloading the window.';
  env.replace('OPENCODE_NOTIFY_URL', router.url);
  env.replace('OPENCODE_NOTIFY_TOKEN', router.token);
  context.subscriptions.push({ dispose: () => env.clear() });

  const bin = join(context.globalStorageUri.fsPath, 'bin');
  await mkdir(bin, { recursive: true });
  const cli = context.asAbsolutePath('dist/cli.cjs');
  if (process.platform === 'win32') {
    await writeFile(join(bin, 'opencode-notify.cmd'), `@echo off\r\nsetlocal\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${process.execPath}" "${cli}" %*\r\n`);
  } else {
    await writeFile(join(bin, 'opencode-notify'), `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${quote(process.execPath)} ${quote(cli)} "$@"\n`, { mode: 0o700 });
  }
  env.prepend('PATH', `${bin}${delimiter}`);

  const terminals = new Map<string, vscode.Terminal>();
  context.subscriptions.push(vscode.window.onDidCloseTerminal(terminal => {
    for (const [id, candidate] of terminals) if (candidate === terminal) terminals.delete(id);
  }));
  context.subscriptions.push(vscode.commands.registerCommand(COMMANDS.start, async () => {
    const folders = vscode.workspace.workspaceFolders;
    const folder = folders && folders.length > 1 ? await vscode.window.showWorkspaceFolderPick() : folders?.[0];
    if (folders && folders.length > 1 && !folder) return;
    const terminalId = randomUUID();
    const terminal = vscode.window.createTerminal({ name: `OpenCode${folder ? ` · ${folder.name}` : ''}`,
      ...(folder ? { cwd: folder.uri } : {}),
      env: { OPENCODE_NOTIFY_URL: router.url, OPENCODE_NOTIFY_TOKEN: router.token, OPENCODE_NOTIFY_TERMINAL_ID: terminalId } });
    terminals.set(terminalId, terminal); terminal.show(); terminal.sendText('opencode');
  }));
  context.subscriptions.push(vscode.commands.registerCommand(COMMANDS.focus, async (value: unknown) => {
    const terminalId = isRecord(value) && typeof value.terminalId === 'string' ? value.terminalId : undefined;
    const exact = terminalId ? terminals.get(terminalId) : undefined;
    if (exact) { exact.show(); return; }
    const all = vscode.window.terminals;
    if (all.length === 1) { all[0]!.show(); return; }
    if (!all.length) { void vscode.window.showInformationMessage('The originating terminal is no longer open.'); return; }
    const selected = await vscode.window.showQuickPick(all.map(terminal => ({ label: terminal.name, terminal })),
      { placeHolder: 'Choose the OpenCode terminal' });
    selected?.terminal.show();
  }));
  context.subscriptions.push(vscode.commands.registerCommand(COMMANDS.install, async () => {
    const configRoot = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
    const destination = join(configRoot, 'opencode', 'plugins', 'opencode-notify.js');
    const source = context.asAbsolutePath('dist/opencode-notify.js');
    try {
      let result = await installPlugin(source, destination);
      if (result === 'conflict') {
        const answer = await vscode.window.showWarningMessage(`Replace the existing plugin at ${destination}?`, { modal: true }, 'Replace');
        if (answer !== 'Replace') return;
        result = await installPlugin(source, destination, true);
      }
      log(`Plugin ${result}: ${destination}`);
      void vscode.window.showInformationMessage('OpenCode v1 notification plugin is ready. Restart OpenCode in a fresh terminal.');
    } catch (error) {
      log(`Plugin installation failed: ${String(error)}`);
      void vscode.window.showErrorMessage('Could not install the OpenCode plugin. See OpenCode Notify Router output.');
    }
  }));
  context.subscriptions.push(vscode.commands.registerCommand(COMMANDS.test, async () => {
    const note: Notification = { version: 1, id: randomUUID(), event: 'complete', sessionId: 'connection-test',
      project: vscode.workspace.name || 'workspace', directory: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
      title: 'OpenCode Notify', message: 'Remote notification bridge is working', occurredAt: Date.now() };
    try {
      const response = await fetch(router.url, { method: 'POST', headers: {
        Authorization: `Bearer ${router.token}`, 'Content-Type': 'application/json',
      }, body: JSON.stringify(note), signal: AbortSignal.timeout(2500) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      log(`Connection test failed: ${String(error)}`);
      void vscode.window.showErrorMessage('Notification test failed. Install OpenCode Notify on the local host and inspect the Router output.');
      throw error;
    }
  }));
  log('Workspace notification router ready. Use a fresh terminal to inherit this window’s connection.');
  // API is limited to non-secret readiness metadata. Credentials are injected only into terminals.
  return { ready: true, remoteName: vscode.env.remoteName };
}

export async function deactivate() { await shutdown?.(); shutdown = undefined; }
