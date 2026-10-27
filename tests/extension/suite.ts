import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
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
  if (mode === 'automatic') await exactSourceFocus(taskDirectory);
  console.log('Installed VSIX smoke: activation, commands, authenticated bridge, invalid input and terminal environment passed.');
}

async function waitUntil(check: () => boolean | Promise<boolean>, message: string): Promise<void> {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail(message);
}

async function exactSourceFocus(directory: string): Promise<void> {
  // Real npm ancestry and identical names/directories catch name-based or sole-terminal guesses.
  await writeFile(join(directory, 'package.json'), JSON.stringify({ scripts: { source: 'node source.cjs' } }));
  await writeFile(join(directory, 'source.cjs'), `
const fs = require('node:fs');
const source = { version: 1, instanceId: process.env.SOURCE_INSTANCE, pid: process.pid,
  parentPid: process.ppid, startedAt: Date.now() - process.uptime() * 1000, directory: process.cwd() };
(async () => {
  const response = await fetch(process.env.OPENCODE_NOTIFY_URL.replace('/notify','/sources'), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENCODE_NOTIFY_TOKEN },
    body: JSON.stringify(source) });
  fs.writeFileSync(process.env.SOURCE_RESULT, JSON.stringify({ source, status: response.status }));
  setInterval(() => { if (fs.existsSync(process.env.SOURCE_RESULT + '.stop')) process.exit(); }, 100);
})().catch(error => { fs.writeFileSync(process.env.SOURCE_RESULT, JSON.stringify({ error: String(error) })); process.exit(1); });
`);
  const terminals: vscode.Terminal[] = [];
  try {
    for (const id of ['one', 'two']) {
      const result = join(directory, `source-${id}.json`);
      const terminal = vscode.window.createTerminal({ name: 'node', cwd: directory,
        shellPath: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
        shellArgs: process.platform === 'win32' ? ['/d', '/c', 'npm run source & pause'] : ['-c', 'npm run source; sleep 120'],
        env: { SOURCE_INSTANCE: id, SOURCE_RESULT: result } });
      terminals.push(terminal);
      await waitUntil(async () => {
        try { await readFile(result); return true; }
        catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false; throw error; }
      }, `npm source ${id} must register`);
      const registration = JSON.parse(await readFile(result, 'utf8')) as { status: number };
      assert.equal(registration.status, 202, `npm source ${id} registration accepted`);
    }
    const note = (instanceId: string) => ({ version: 1, id: `focus-${instanceId}`, instanceId,
      event: 'complete', sessionId: instanceId, sessionTitle: `Session ${instanceId}`, project: 'same-project',
      directory, title: 'OpenCode', message: 'Completed', occurredAt: Date.now() });
    for (const index of [0, 1, 0]) {
      await vscode.commands.executeCommand('opencodeNotify.focus', note(index === 0 ? 'one' : 'two'));
      await waitUntil(() => vscode.window.activeTerminal === terminals[index], 'Exact originating terminal must be revealed');
    }
    await writeFile(join(directory, 'source-one.json.stop'), 'stop');
    // The source exits while its parent shell stays open: completed output remains addressable.
    await new Promise(resolve => setTimeout(resolve, 500));
    await vscode.commands.executeCommand('opencodeNotify.focus', note('one'));
    await waitUntil(() => vscode.window.activeTerminal === terminals[0], 'Completed source binding must survive process exit');
    terminals[0]!.dispose();
    await waitUntil(() => !vscode.window.terminals.includes(terminals[0]!), 'Closed source terminal must disappear');
    terminals[1]!.show();
    await waitUntil(() => vscode.window.activeTerminal === terminals[1], 'Remaining terminal must be active');
    await vscode.commands.executeCommand('opencodeNotify.focus', note('one'));
    assert.equal(vscode.window.activeTerminal, terminals[1], 'Known closed source cannot select another terminal');
    console.log('Exact source smoke passed: two npm-launched node sources in one directory; retained output and closed binding.');
  } finally { for (const terminal of terminals) terminal.dispose(); }
}
