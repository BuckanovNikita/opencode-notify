import assert from 'node:assert/strict';
import { resolveTestAppRoot } from './vscode-test-host.mjs';
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, readFile, writeFile, rename, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await check(); if (value) return value; await pause(100); }
  throw new Error(`Timed out: ${label}`);
}
async function json(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}
async function freePort() {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl); let next = 0; const waiting = new Map();
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', event => {
    const value = JSON.parse(String(event.data)); const pending = waiting.get(value.id);
    if (pending) { waiting.delete(value.id); clearTimeout(pending.timer); value.error ? pending.reject(new Error(JSON.stringify(value.error))) : pending.resolve(value.result); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next; const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 5000);
    waiting.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  return { send, close: () => ws.close(), evaluate: async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value;
  } };
}

const requested = process.env.VSCODE_TEST_VERSION || JSON.parse(await readFile('packages/presenter/package.json', 'utf8')).engines.vscode.replace(/^\^/, '');
const namedProfiles = process.env.OPENCODE_NOTIFY_SMOKE_PROFILES === '1';
const executable = process.env.VSCODE_TEST_EXECUTABLE || await downloadAndUnzipVSCode(requested);
const appRoot = await resolveTestAppRoot(executable);
const actualVersion = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8')).version;
if (/^\d+\.\d+\.\d+$/.test(requested) && actualVersion !== requested) throw new Error(`Requested VS Code ${requested}, resolved ${actualVersion}`);
console.log(`Multiwindow requested=${requested} actual=${actualVersion}`);
if (requested === 'stable') throw new Error('Pin VSCODE_TEST_VERSION to the verified current release; stable resolution may silently use a cached older build.');
const task = await mkdtemp(join(tmpdir(), 'opencode-notify-multiwindow-'));
const port = await freePort(); const children = []; const clients = [];
const userData = join(task, 'profile'); const extensions = join(task, 'extensions');
const toastMarkers = [];

try {
  await mkdir(join(userData, 'User'), { recursive: true }); await mkdir(join(task, 'source'));
  await writeFile(join(userData, 'User', 'settings.json'), JSON.stringify({
    'opencodeNotify.systemNotifications': 'both', 'opencodeNotify.sound': false,
    'workbench.startupEditor': 'none', 'window.title': '${rootName}', 'security.workspace.trust.enabled': false,
  }));
  await writeFile(join(task, 'source', 'package.json'), JSON.stringify({ scripts: { source: 'node source.cjs' } }));
  await writeFile(join(task, 'source', 'source.cjs'), `
const fs=require('node:fs');
(async()=>{
 const source={version:1,instanceId:process.env.SOURCE_INSTANCE,pid:process.pid,parentPid:process.ppid,startedAt:Date.now()-process.uptime()*1000,directory:process.cwd()};
 const response=await fetch(process.env.OPENCODE_NOTIFY_URL.replace('/notify','/sources'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.OPENCODE_NOTIFY_TOKEN},body:JSON.stringify(source)});
 fs.writeFileSync(process.env.SOURCE_RESULT,JSON.stringify({source,status:response.status}),{mode:384});
 setInterval(()=>{},1000);
})().catch(error=>{fs.writeFileSync(process.env.SOURCE_RESULT,JSON.stringify({error:String(error)}));process.exit(1);});
`);
  const [resolvedCli, ...resolvedBase] = resolveCliArgsFromVSCodeExecutablePath(executable);
  // Windows cannot execFile a .cmd shim; execute its official CLI with Electron's Node mode.
  const cli = process.platform === 'win32' ? executable : resolvedCli;
  const base = process.platform === 'win32' ? [join(appRoot, 'out', 'cli.js')] : resolvedBase;
  const isolated = [`--user-data-dir=${userData}`, `--extensions-dir=${extensions}`];
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: undefined, DONT_PROMPT_WSL_INSTALL: '1',
    OPENCODE_NOTIFY_PEER_SMOKE_DIR: task, XDG_CONFIG_HOME: join(task, 'config') };
  const version = JSON.parse(await readFile('package.json', 'utf8')).version;
  const artifacts = [`opencode-notify-${version}.vsix`, `opencode-notify-router-${version}.vsix`];
  // Stage inputs locally: Electron deliberately rejects unapproved UNC hosts.
  for (const artifact of artifacts) await writeFile(join(task, artifact), await readFile(resolve('artifacts', artifact)));
  await writeFile(join(task, 'activate-toast.ps1'), await readFile('tests/windows/activate-toast.ps1'));
  const install = profile => { for (const artifact of artifacts) {
    execFileSync(cli, [...base.filter(arg => !arg.startsWith('--user-data-dir') && !arg.startsWith('--extensions-dir')),
      ...isolated, ...(profile ? ['--profile', profile] : []), '--install-extension', join(task, artifact), '--force'], { env: { ...env, ...(process.platform === 'win32' ? { ELECTRON_RUN_AS_NODE: '1' } : {}) }, stdio: 'inherit', timeout: 120000 });
  } };
  if (!namedProfiles) install(undefined);
  for (const name of ['window-A', 'window-B']) {
    const workspace = join(task, name); await mkdir(workspace);
    // Code reuses a development window for the same development extension path.
    // Distinct fixture copies allow two real windows in one user-data instance.
    const harness = join(task, `harness-${name}`); await mkdir(harness);
    await writeFile(join(harness, 'package.json'), await readFile('tests/extension/package.json'));
    await writeFile(join(harness, 'peer-window.cjs'), await readFile('dist/peer-window.cjs'));
    await writeFile(join(harness, 'empty.cjs'), "exports.activate=context=>require('./peer-window.cjs').activate(context);");
    const child = spawn(executable, [workspace, ...isolated, ...(namedProfiles ? ['--profile', name] : []), '--new-window', `--extensionDevelopmentPath=${harness}`,
      `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', '--disable-workspace-trust',
      '--skip-welcome', '--skip-release-notes', '--disable-gpu', '--no-sandbox', '--disable-updates', '--disable-telemetry'],
    { env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    children.push(child);
    if (namedProfiles) {
      // Launching --profile creates it; installation alone requires it to exist.
      await until(async () => {
        try { return (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).some(page => page.type === 'page' && page.title.includes(name)); }
        catch { return false; }
      }, `${name} named profile creation`);
      const registry = await json(join(userData, 'User', 'globalStorage', 'storage.json'));
      const profile = registry?.userDataProfiles?.find(profile => profile.name === name);
      assert.ok(profile?.location, `Named profile ${name} must exist`);
      await writeFile(join(userData, 'User', 'profiles', profile.location, 'settings.json'), JSON.stringify({
        'window.title': 'smoke-profile-' + name + ' ${rootName}',
        'opencodeNotify.systemNotifications': 'both', 'opencodeNotify.sound': false,
      }));
      install(name);
    }
    let logs = ''; child.stdout.on('data', chunk => { logs = (logs + chunk).slice(-12000); }); child.stderr.on('data', chunk => { logs = (logs + chunk).slice(-12000); });
    child.on('error', error => { logs += String(error); });
    await until(async () => {
      const state = await json(join(task, `${name}.state.json`));
      if (state?.error) throw new Error(`${name}: ${state.error}`);
      return state?.ready;
    }, `${name} extension readiness; logs: ${logs}`, 120000);
    const registration = await until(async () => json(join(task, `${name}.source.json`)), `${name} source registration`);
    assert.equal(registration.status, 202, JSON.stringify(registration));
  }
  const peers = await readdir(join(userData, 'User', 'globalStorage', 'opencode-notify-peers'));
  assert.equal(peers.filter(name => name.endsWith('.json')).length, 2, 'Two live presenters must advertise peers');
  const targets = await until(async () => {
    try { const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const a = pages.find(page => page.type === 'page' && page.title.includes('window-A'));
      const b = pages.find(page => page.type === 'page' && page.title.includes('window-B'));
      return a && b ? [a, b] : undefined;
    } catch { return undefined; }
  }, 'both workbench CDP targets');
  const [a, b] = await Promise.all(targets.map(connect)); clients.push(a, b);
  const state = name => json(join(task, `${name}.state.json`));
  const command = async (name, value) => {
    const target = join(task, `${name}.command.json`); await writeFile(`${target}.tmp`, JSON.stringify(value), { mode: 0o600 }); await rename(`${target}.tmp`, target);
    await until(async () => (await state(name))?.processed === value.id, `${name} command ${value.id}`);
  };
  await command('window-A', { id: 'prepare-a', kind: 'prepare' }); await command('window-B', { id: 'prepare-b', kind: 'prepare' });
  await b.send('Page.bringToFront');
  await until(async () => (await state('window-B'))?.focused && !(await state('window-A'))?.focused, 'window B focused');
  if (namedProfiles) {
    const first = await state('window-A'); const second = await state('window-B');
    assert.equal(first.configuredTitle, 'smoke-profile-window-A ${rootName}', 'A must use its named profile settings');
    assert.equal(second.configuredTitle, 'smoke-profile-window-B ${rootName}', 'B must use its named profile settings');
  }
  const message = `peer-smoke-${Date.now()}`; toastMarkers.push(message);
  await command('window-A', { id: 'deliver', kind: 'deliver', notification: {
    version: 1, id: message, instanceId: 'window-A', event: 'question', sessionId: 'peer-smoke', sessionTitle: 'Origin A',
    project: 'same-project', directory: join(task, 'source'), title: 'OpenCode', message, occurredAt: Date.now(),
  } });
  const count = `(Array.from(document.querySelectorAll('.notification-list-item')).filter(item=>item.textContent.includes(${JSON.stringify(message)})).length)`;
  await until(async () => await b.evaluate(count) === 1, 'one relayed app notification in focused B');
  assert.equal(await a.evaluate(count), 0, 'Unfocused origin A must not duplicate B app alert');
  const clicked = await b.evaluate(`(()=>{const item=Array.from(document.querySelectorAll('.notification-list-item')).find(item=>item.textContent.includes(${JSON.stringify(message)}));const button=item&&Array.from(item.querySelectorAll('button,a')).find(button=>button.textContent.trim()==='Open OpenCode');if(!button)return false;button.click();return true;})()`);
  assert.equal(clicked, true, 'App notification must expose Open OpenCode');
  let consentOpened = false;
  // Consent is scoped to this isolated fixture's only notification origin.
  for (let attempt = 0; attempt < 30 && !(await state('window-A'))?.terminalActive; attempt++) {
    consentOpened = await a.evaluate(`(()=>{
      const dialog=document.querySelector('.monaco-dialog-box'); if(!dialog)return false;
      const values=Array.from(dialog.querySelectorAll('a,[title],[aria-label]')).flatMap(link=>[link.href,link.title,link.getAttribute('data-href'),link.getAttribute('aria-label')]).filter(Boolean);
      const exact=values.some(value=>{try{const uri=new URL(value);return uri.protocol==='vscode:'&&uri.hostname==='buckanovnikita.opencode-notify'&&uri.pathname==='/activate'&&/target=[a-f0-9-]{36}/.test(decodeURIComponent(uri.search));}catch{return false;}});
      if(!exact)return false;
      const open=Array.from(dialog.querySelectorAll('button,a,.monaco-button')).find(button=>button.textContent.trim()==='Open');if(!open)return false;open.click();return true;
    })()`);
    if (consentOpened) break;
    await pause(100);
  }
  const terminalSelected = await until(async () => (await state('window-A'))?.terminalActive, 'action selects exact origin terminal', 20000).catch(error => { console.error(`ACCEPTANCE GAP: ${error.message}; origin state available in retained smoke directory`); return false; });
  const originState = await state('window-A');
  await writeFile(join(task, 'evidence.json'), JSON.stringify({ requested, actualVersion, observedAt: new Date().toISOString(),
    consentOpened, profiles: namedProfiles ? 'two named profiles' : 'shared default profile', peers: 2, focusedAlertWindow: 'window-B', appAlerts: { A: 0, B: 1 }, clicked: true,
    exactOriginTerminal: !!terminalSelected, originState, peerState: await state('window-B'),
    activationDialogMarkup: await a.evaluate("(document.querySelector('.monaco-dialog-box')?.outerHTML||'').replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/g,'[target]').slice(0,12000)"),
    activationDialogs: { A: await a.evaluate("Array.from(document.querySelectorAll('.monaco-dialog-box')).map(item=>item.textContent).join(' ').slice(0,4000)"),
      B: await b.evaluate("Array.from(document.querySelectorAll('.monaco-dialog-box')).map(item=>item.textContent).join(' ').slice(0,4000)") },
    limitation: namedProfiles ? 'Native notification visibility requires separate desktop acceptance.' : 'Shared default profile; native notification visibility and cross-profile discovery require separate acceptance.' }, null, 2));
  if (!terminalSelected || !originState?.focused) throw new Error(`Origin activation acceptance gap: ${JSON.stringify(originState)}. Headless URI consent/foreground may require desktop acceptance.`);
  console.log(`Multiwindow VS Code ${actualVersion}: two peers; focused B receives one alert; action foregrounds A and selects its exact npm/node terminal.`);
  const nativeMode = process.env.OPENCODE_NOTIFY_SMOKE_NATIVE;
  if (nativeMode) {
    assert.equal(process.platform, 'win32', 'Native activation acceptance requires Windows');
    assert.ok(['both', 'center'].includes(nativeMode), 'Native mode must be both or diagnostic center');
    const nativeResults = [];
    for (const stage of nativeMode === 'both' ? ['banner', 'center'] : ['center']) {
      const marker = `notify-${stage}-${Date.now()}`; toastMarkers.push(marker);
      const title = `OpenCode · Complete · ${marker}`;
      try {
        await command('window-A', { id: `prepare-a-${stage}`, kind: 'prepare' });
        await command('window-B', { id: `prepare-b-${stage}`, kind: 'prepare' });
        await b.send('Page.bringToFront');
        await until(async () => (await state('window-B'))?.focused && !(await state('window-A'))?.terminalActive, 'B foreground and A decoy selected');
        await command('window-A', { id: marker, kind: 'deliver', notification: {
          version: 1, id: marker, instanceId: 'window-A', event: 'complete', sessionId: marker, sessionTitle: marker,
          project: 'same-project', directory: join(task, 'source'), title: 'OpenCode', message: marker, occurredAt: Date.now(),
        } });
        const alertCount = `(Array.from(document.querySelectorAll('.notification-list-item')).filter(item=>item.textContent.includes(${JSON.stringify(marker)})).length)`;
        await until(async () => await b.evaluate(alertCount) === 1, `${stage} event app alert in B`);
        assert.equal(await a.evaluate(alertCount), 0, 'Native event cannot duplicate the app alert in A');
        if (stage === 'center') {
          // Await the real helper's lifecycle, rather than writing a synthetic pipe callback.
          const escaped = marker.replaceAll("'", "''");
          const script = `$deadline=[DateTime]::UtcNow.AddSeconds(70); do { $active=@(Get-CimInstance Win32_Process -Filter "Name='snoretoast-x64.exe'" | Where-Object {$_.CommandLine -like '*${escaped}*'}); if($active.Count -eq 0){exit 0}; Start-Sleep -Milliseconds 250 } while([DateTime]::UtcNow -lt $deadline); throw 'Task toast helper did not finish its banner lifecycle'`;
          // The app alert can precede native process startup. Observe its lifecycle after
          // a short startup grace; later real UI activation must still reach the origin.
          await pause(2000);
          execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 75000, stdio: 'inherit' });
        }
        console.log(`Windows ${stage}: activating task-owned toast ${marker}`);
        execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
          join(task, 'activate-toast.ps1'), '-Title', title, ...(stage === 'center' ? ['-Center'] : [])],
        { windowsHide: true, timeout: 30000, stdio: 'inherit' });
        await until(async () => { const current = await state('window-A'); return current?.focused && current.terminalActive; }, `${stage} click foregrounds exact origin terminal`, 15000);
        nativeResults.push({ stage, passed: true, origin: await state('window-A') });
      } catch (error) { nativeResults.push({ stage, passed: false, error: String(error) }); }
    }
    await writeFile(join(task, 'native-evidence.json'), JSON.stringify({ nativeMode, observedAt: new Date().toISOString(), nativeResults }, null, 2));
    assert.ok(nativeResults.every(result => result.passed), JSON.stringify(nativeResults));
    console.log(`Windows native ${nativeMode}: real notification actions foreground the exact originating console.`);
  }
} finally {
  for (const name of ['window-A', 'window-B']) {
    if (!await json(join(task, `${name}.state.json`))) continue;
    const instruction = { id: `cleanup-${Date.now()}`, kind: 'cleanup' };
    const target = join(task, `${name}.command.json`);
    try {
      await writeFile(`${target}.tmp`, JSON.stringify(instruction), { mode: 0o600 }); await rename(`${target}.tmp`, target);
      await until(async () => { const state = await json(join(task, `${name}.state.json`)); return state?.processed === instruction.id && state?.terminals === 0; }, `${name} terminal cleanup`, 5000);
    } catch (error) { console.error(`Terminal cleanup warning: ${error.message}`); }
  }
  for (const client of clients) client.close();
  if (process.platform === 'win32') {
    // Windows Code's launcher can exit after starting its versioned executable.
    // Locate only this run's main process by both installation and user-data paths.
    const installPath = dirname(executable).replaceAll("'", "''");
    const profilePath = userData.replaceAll("'", "''");
    const owned = `$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'Code.exe' -and $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${installPath}\\',[StringComparison]::OrdinalIgnoreCase) -and $_.CommandLine -and $_.CommandLine.Contains('${profilePath}') -and $_.CommandLine -notmatch '(?:^|\\s)--type='} | ForEach-Object { if (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue) { & taskkill.exe /PID $_.ProcessId /T /F | Out-Null } }`;
    execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', owned], { windowsHide: true, timeout: 15000, stdio: 'inherit' });
    // Remove only notifications containing this run's exact unique message text.
    // Closing a presenter does not remove Windows Notification Center entries.
    const markers = toastMarkers.map(marker => `'${marker.replaceAll("'", "''")}'`).join(',');
    const cleanupToasts = `$ErrorActionPreference='Stop'; [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] > $null; $app='Snore.DesktopToasts.0.7.0'; $markers=@(${markers}); $history=[Windows.UI.Notifications.ToastNotificationManager]::History; foreach($toast in $history.GetHistory($app)) { $texts=@($toast.Content.GetElementsByTagName('text') | ForEach-Object {$_.InnerText}); if(@($markers | Where-Object {$texts -contains $_}).Count -gt 0) {$history.Remove($toast.Tag,$toast.Group,$app)} }`;
    execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', cleanupToasts], { windowsHide: true, timeout: 15000, stdio: 'inherit' });
  }
  for (const child of children) {
    try { if (child.exitCode !== null || child.signalCode !== null || process.platform === 'win32') continue; process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') console.error(error); }
  }
  await Promise.all(children.map(child => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : Promise.race([new Promise(resolve => child.once('exit', resolve)), pause(3000)])));
  for (const child of children) {
    try { if (child.exitCode !== null || child.signalCode !== null) continue; if (process.platform === 'win32') child.kill('SIGKILL'); else process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') console.error(error); }
  }
  if (!process.env.OPENCODE_NOTIFY_KEEP_SMOKE) await rm(task, { recursive: true, force: true });
  else console.error(`Retained isolated test evidence: ${task}`);
}
