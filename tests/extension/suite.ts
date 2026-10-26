import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
  const presenter = vscode.extensions.getExtension('buckanovnikita.opencode-notify');
  assert.ok(presenter, 'Presenter VSIX must be installed');
  assert.ok(!presenter.extensionPath.includes('/packages/'), 'Test installed artifact rather than source');
  await presenter.activate();
  const mode = process.env.OPENCODE_NOTIFY_SETUP_MODE;
  const config = process.env.XDG_CONFIG_HOME;
  assert.ok(config, 'Smoke test must isolate the OpenCode config directory');
  const plugin = join(config, 'opencode', 'plugins', 'opencode-notify.js');
  if (mode === 'newer-disabled') {
    await vscode.commands.executeCommand('opencodeNotify.setup');
    assert.equal(vscode.extensions.getExtension('buckanovnikita.opencode-notify-router'), undefined);
    const directory = process.env.OPENCODE_NOTIFY_EXTENSIONS_DIR;
    assert.ok(directory);
    const installed = JSON.parse(await readFile(join(directory, 'extensions.json'), 'utf8')) as { identifier: { id: string }; version: string }[];
    assert.equal(installed.find(item => item.identifier.id === 'buckanovnikita.opencode-notify-router')?.version, '9.0.0');
    await assert.rejects(readFile(plugin), { code: 'ENOENT' });
    console.log('Disabled newer Router remained installed without downgrade or activation.');
    return;
  }
  if (mode === 'router-disabled') {
    await vscode.commands.executeCommand('opencodeNotify.setup');
    assert.equal(vscode.extensions.getExtension('buckanovnikita.opencode-notify-router'), undefined);
    await assert.rejects(readFile(plugin), { code: 'ENOENT' });
    console.log('Automatic Router setup opt-out preserved the isolated environment.');
    return;
  }
  let router = vscode.extensions.getExtension('buckanovnikita.opencode-notify-router');
  for (let attempt = 0; attempt < 600 && !router?.isActive; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    router = vscode.extensions.getExtension('buckanovnikita.opencode-notify-router');
  }
  assert.ok(router?.isActive, 'Startup must install and activate Router without a setup command');
  await vscode.commands.executeCommand('opencodeNotify.setup');
  assert.ok(presenter.isActive && router.isActive);
  const status = await vscode.commands.executeCommand<{ version: string }>('opencodeNotify.routerStatus');
  assert.equal(status?.version, presenter.packageJSON.version);
  if (mode === 'plugin-disabled') await assert.rejects(readFile(plugin), { code: 'ENOENT' });
  else if (mode === 'preserve') assert.equal(await readFile(plugin, 'utf8'), '// existing personal plugin\n');
  else assert.equal(await readFile(plugin, 'utf8'), await readFile(join(router.extensionPath, 'dist', 'opencode-notify.js'), 'utf8'));
  const commands = await vscode.commands.getCommands(true);
  for (const command of ['deliver', 'focus', 'installPlugin', 'start', 'test', 'showLog', 'setup', 'routerStatus']) {
    assert.ok(commands.includes(`opencodeNotify.${command}`), `Missing command ${command}`);
  }
  await vscode.workspace.getConfiguration('opencodeNotify').update('systemNotifications', 'app', vscode.ConfigurationTarget.Global);
  await vscode.workspace.getConfiguration('opencodeNotify').update('sound', false, vscode.ConfigurationTarget.Global);
  const before = Date.now();
  await vscode.commands.executeCommand('opencodeNotify.test');
  assert.ok(Date.now() - before < 2000, 'HTTP acceptance must not wait for user interaction');
  await assert.rejects(Promise.resolve(vscode.commands.executeCommand('opencodeNotify.deliver', { version: 2 })));

  const taskDirectory = process.env.OPENCODE_NOTIFY_SMOKE_DIR;
  assert.ok(taskDirectory); await mkdir(taskDirectory, { recursive: true });
  const resultFile = join(taskDirectory, 'terminal-result.json');
  const code = `const fs=require('fs'); fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({url:process.env.OPENCODE_NOTIFY_URL,token:process.env.OPENCODE_NOTIFY_TOKEN,path:process.env.PATH}),{mode:384});`;
  const terminal = vscode.window.createTerminal({ name: 'OpenCode Notify smoke', shellPath: process.execPath,
    shellArgs: ['-e', code], env: { ELECTRON_RUN_AS_NODE: '1' } });
  try {
    let result: { url: string; token: string; path: string } | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { result = JSON.parse(await readFile(resultFile, 'utf8')) as typeof result; break; }
      catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    assert.ok(result, 'New terminal must inherit the router connection');
    assert.match(result.url, /^http:\/\/127\.0\.0\.1:\d+\/notify$/);
    assert.match(result.token, /^[a-f0-9]{64}$/);
    assert.ok(result.path.includes('buckanovnikita.opencode-notify-router'));
    const headers = { Authorization: `Bearer ${result.token}`, 'Content-Type': 'application/json' };
    assert.equal((await fetch(result.url, { method: 'POST', headers, body: '{}' })).status, 400);
    assert.equal((await fetch(result.url, { method: 'POST', body: '{}' })).status, 401);
  } finally { terminal.dispose(); }
  console.log('Installed VSIX smoke: activation, commands, authenticated bridge, invalid input and terminal environment passed.');
}
