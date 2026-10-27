import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createWindowsNotifications } from '../../packages/presenter/src/windows.js';
import { inspectProcess, SourceRegistry } from '../../packages/router/src/sources.js';
import type { Notification } from '../../packages/protocol/src/index.js';

const execute = promisify(execFile);
const argument = (name: string) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
const report = (stage: string, detail: string) => console.log(JSON.stringify({ at: new Date().toISOString(), stage, detail }));
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function activateToast(title: string, center: boolean): Promise<void> {
  const scriptPath = resolve(argument('--activation-script') ?? 'tests/windows/activate-toast.ps1');
  const result = await execute('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath, '-Title', title, ...(center ? ['-Center'] : [])],
    { timeout: 25_000, windowsHide: true, maxBuffer: 32_768 }).catch(() => {
      throw new Error('Task-owned toast action was not accessible through UIAutomation; manual activation is required');
    });
  report(center ? 'center-automation' : 'banner-automation', result.stdout.trim());
}

async function main(): Promise<void> {
  if (process.platform !== 'win32') throw new Error('Windows desktop acceptance requires a Windows Node process');
  const helper = argument('--helper');
  if (!helper) throw new Error('Pass --helper with the bundled SnoreToast executable path');
  const automate = process.argv.includes('--automate');
  const centerOnly = process.argv.includes('--center-only');
  const preflight = await execute('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `
Add-Type -AssemblyName UIAutomationClient
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] > $null
$setting = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Snore.DesktopToasts.0.7.0').Setting
$root = [System.Windows.Automation.AutomationElement]::RootElement
$condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty,'Shell_TrayWnd')
$tray = $root.FindFirst([System.Windows.Automation.TreeScope]::Children,$condition)
$dnd = 'unknown'
if ($null -ne $tray) {
  foreach ($element in $tray.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)) {
    if ($element.Current.Name -like 'Notifications *') {
      $dnd = if ($element.Current.Name -like '*Do not disturb on*') { 'on' } else { 'not reported on' }
      break
    }
  }
}
[pscustomobject]@{ notifierSetting=$setting.ToString(); doNotDisturb=$dnd } | ConvertTo-Json -Compress
`], { timeout: 10_000, windowsHide: true, maxBuffer: 32_768 });
  report('desktop-preflight', preflight.stdout.trim());
  if (centerOnly) report('diagnostic-scope', 'Notification Center only; this run cannot satisfy complete Windows acceptance');
  const runId = randomUUID();
  const identity = await inspectProcess(process.pid);
  assert.ok(identity, 'CIM must inspect this Windows Node process');
  assert.equal(identity.pid, process.pid);
  assert.ok(Math.abs(identity.startedAt - (Date.now() - process.uptime() * 1000)) < 1500, 'CIM start time must match process lifetime');
  const registry = new SourceRegistry<object>(); const terminal = {};
  await registry.observe(terminal, process.pid);
  await registry.register({ version: 1, instanceId: runId, ...identity, directory: process.cwd() });
  const resolution = registry.resolve({ instanceId: runId });
  assert.equal(resolution.kind, 'exact', 'Windows CIM source identity must bind to its observed terminal');
  report('windows-process-binding', 'PASS: real CIM self identity and SourceRegistry ancestry binding');

  const helperExits = new Map<string, string | number | null>();
  const ownedToastIds: string[] = [];
  const adapter = createWindowsNotifications(resolve(helper), message => report('native-log', message), {
    launch(path, args, callback) {
      const id = args[args.indexOf('-id') + 1]!;
      ownedToastIds.push(id);
      return execFile(path, args, { windowsHide: true, timeout: 70_000, maxBuffer: 64 * 1024 }, (error, _stdout, stderr) => {
        const status = error?.code ?? 0;
        helperExits.set(id, status);
        report('helper-exit', `id=${id} status=${status} stderrPresent=${Boolean(stderr.trim())}`);
        callback(error ?? (stderr.trim() ? new Error('Windows notification helper reported an error') : null));
      });
    }
  });
  const deadline = setTimeout(() => { report('acceptance', 'FAIL: Windows desktop acceptance exceeded 120 seconds'); adapter.dispose(); process.exitCode = 1; }, 120_000);
  let bannerClicks = 0; let centerClicks = 0;
  const base: Notification = { version: 1, id: runId, event: 'complete', sessionId: runId,
    project: 'Isolated Windows acceptance', directory: process.cwd(), title: '', message: 'Task-owned OpenCode Notify desktop acceptance. Select Open OpenCode.', occurredAt: Date.now() };
  const waitForClick = async (read: () => number, stage: string) => {
    const end = Date.now() + 25_000;
    while (read() === 0 && Date.now() < end) await delay(100);
    assert.equal(read(), 1, `${stage}: genuine native action callback was not observed`);
  };
  const failures: string[] = [];
  try {
    const bannerTitle = `OpenCode test banner ${runId.slice(0, 8)}`;
    if (!centerOnly) try {
      report('banner', `Click Open OpenCode on "${bannerTitle}" within 25 seconds`);
      const start = Date.now();
      const bannerResult = adapter.notify({ ...base, title: bannerTitle }, false, () => { bannerClicks++; report('banner-callback', 'Native activation received'); })
        .then(() => { report('banner-helper', `Display confirmed after ${Date.now() - start}ms`); return undefined; }, error => {
          report('banner-helper', `FAIL: ${error instanceof Error ? error.message : String(error)}`); return error as Error;
        });
      if (automate) await activateToast(bannerTitle, false);
      await waitForClick(() => bannerClicks, 'banner');
      const bannerError = await bannerResult; if (bannerError) throw bannerError;
      report('banner', 'PASS: real helper banner activation');
    } catch (error) { failures.push(`banner: ${error instanceof Error ? error.message : String(error)}`); report('banner', `FAIL: ${failures.at(-1)}`); }

    const centerTitle = `OpenCode test history ${runId.slice(0, 8)}`;
    try {
      report('history', `Leave "${centerTitle}" untouched until the banner expires`);
      const started = Date.now();
      await adapter.notify({ ...base, id: `${runId}-history`, title: centerTitle }, false, () => { centerClicks++; report('history-callback', 'Late native activation received'); });
      assert.equal(centerClicks, 0, 'History toast must finish its banner lifecycle before activation');
      const timeoutToastId = ownedToastIds.at(-1)!;
      const exitDeadline = Date.now() + 2000;
      while (!helperExits.has(timeoutToastId) && Date.now() < exitDeadline) await delay(50);
      assert.equal(helperExits.get(timeoutToastId), 3,
        'A genuine SnoreToast timedout exit (3) is required; successful helper exit alone does not prove a visible banner');
      report('history-timeout', `Native display Promise settled after ${Date.now() - started}ms with actual timedout status3; callback target retained`);
      report('history', `Open Notification Center and select Open OpenCode on "${centerTitle}" within 25 seconds`);
      if (automate) await activateToast(centerTitle, true);
      await waitForClick(() => centerClicks, 'Notification Center');
      await delay(500);
      assert.equal(centerClicks, 1);
      report('history', 'PASS: real late Notification Center activation reached its original target once');
    } catch (error) { failures.push(`history: ${error instanceof Error ? error.message : String(error)}`); report('history', `FAIL: ${failures.at(-1)}`); }
    if (failures.length) throw new Error(failures.join('; '));
    if (centerOnly) report('diagnostic', 'PASS: real late Notification Center callback; banner acceptance was not run');
    else {
      assert.equal(bannerClicks, 1);
      report('acceptance', 'PASS: banner and late Notification Center callbacks each reached their original target once');
    }
  } finally {
    clearTimeout(deadline); adapter.dispose();
    for (const id of ownedToastIds) {
      await execute(resolve(helper), ['-close', id], { timeout: 3000, windowsHide: true }).catch(() => {
        report('cleanup', `Could not remove task-owned toast ${id}; no unrelated toast was targeted`);
      });
    }
  }
}

void main().catch(error => { report('acceptance', `FAIL: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
