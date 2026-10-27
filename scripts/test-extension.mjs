import { resolveTestAppRoot } from './vscode-test-host.mjs';
import { downloadAndUnzipVSCode, runTests, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const version = JSON.parse(await readFile('package.json', 'utf8')).version;
let requestedVersion = process.env.VSCODE_TEST_VERSION || JSON.parse(await readFile('packages/presenter/package.json', 'utf8')).engines.vscode.replace(/^\^/, '');
if (requestedVersion === 'stable') {
  const response = await fetch('https://update.code.visualstudio.com/api/releases/stable', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Could not resolve current VS Code version');
  const versions = await response.json();
  if (!Array.isArray(versions) || typeof versions[0] !== 'string') throw new Error('Invalid VS Code version response');
  requestedVersion = versions[0];
}
const executable = process.env.VSCODE_TEST_EXECUTABLE || await downloadAndUnzipVSCode(requestedVersion);
const application = await resolveTestAppRoot(executable);
const actualVersion = JSON.parse(await readFile(join(application, 'package.json'), 'utf8')).version;
if (/^\d+\.\d+\.\d+$/.test(requestedVersion) && actualVersion !== requestedVersion) throw new Error(`VS Code version mismatch: ${actualVersion} != ${requestedVersion}`);
console.log(`Testing actual VS Code ${actualVersion}`);
const task = await mkdtemp(join(tmpdir(), 'opencode-notify-vscode-'));
try {
  const harness = join(task, 'harness'); await mkdir(harness);
  await copyFile('tests/extension/package.json', join(harness, 'package.json'));
  await writeFile(join(harness, 'empty.cjs'), 'exports.activate = () => {};');
  await copyFile('dist/extension-tests.cjs', join(harness, 'extension-tests.cjs'));
  const artifact = join(task, `opencode-notify-${version}.vsix`);
  await copyFile(resolve('artifacts', `opencode-notify-${version}.vsix`), artifact);
  for (const mode of ['automatic', 'router-disabled', 'plugin-disabled', 'preserve', 'newer-disabled']) {
    const scenario = join(task, mode);
    const userData = join(scenario, 'profile'); const extensions = join(scenario, 'extensions');
    const workspace = join(scenario, 'workspace'); const config = join(scenario, 'config');
    await mkdir(workspace, { recursive: true });
    await mkdir(join(userData, 'User'), { recursive: true });
    await writeFile(join(userData, 'User', 'settings.json'), JSON.stringify({
      'opencodeNotify.systemNotifications': 'app', 'opencodeNotify.sound': false,
      'opencodeNotify.autoInstallRouter': mode !== 'router-disabled',
      'opencodeNotify.autoInstallPlugin': mode !== 'plugin-disabled',
    }));
    if (mode === 'preserve') {
      await mkdir(join(config, 'opencode', 'plugins'), { recursive: true });
      await writeFile(join(config, 'opencode', 'plugins', 'opencode-notify.js'), '// existing personal plugin\n');
    }
    const [resolvedCli, ...resolvedBase] = resolveCliArgsFromVSCodeExecutablePath(executable);
    const cli = process.platform === 'win32' ? executable : resolvedCli;
    const baseArgs = process.platform === 'win32' ? [join(application, 'out', 'cli.js')] : resolvedBase;
    const cliEnv = { ...process.env, ELECTRON_RUN_AS_NODE: process.platform === 'win32' ? '1' : undefined, DONT_PROMPT_WSL_INSTALL: '1' };
    const isolated = [`--user-data-dir=${userData}`, `--extensions-dir=${extensions}`];
    execFileSync(cli, [...baseArgs.filter(arg => !arg.startsWith('--user-data-dir') && !arg.startsWith('--extensions-dir')),
        ...isolated, '--install-extension', artifact, '--force'],
      { stdio: 'inherit', env: cliEnv, timeout: 120000 });
    if (mode === 'newer-disabled') {
      const fixture = join(scenario, 'newer-router'); const vsix = join(scenario, 'newer-router.vsix');
      await mkdir(join(fixture, 'dist'), { recursive: true });
      const manifest = JSON.parse(await readFile('packages/router/package.json', 'utf8'));
      await writeFile(join(fixture, 'package.json'), JSON.stringify({ ...manifest, version: '9.0.0' }));
      await writeFile(join(fixture, 'README.md'), '# Isolated newer Router fixture\n');
      await copyFile('LICENSE', join(fixture, 'LICENSE'));
      await copyFile('packages/router/dist/extension.cjs', join(fixture, 'dist', 'extension.cjs'));
      execFileSync(process.execPath, [resolve('node_modules/@vscode/vsce/vsce'), 'package', '--no-dependencies', '--out', vsix],
        { cwd: fixture, stdio: 'inherit', timeout: 120000 });
      execFileSync(cli, [...baseArgs.filter(arg => !arg.startsWith('--user-data-dir') && !arg.startsWith('--extensions-dir')),
        ...isolated, '--install-extension', vsix],
      { stdio: 'inherit', env: cliEnv, timeout: 120000 });
    }
    await runTests({ vscodeExecutablePath: executable, reuseMachineInstall: false,
      extensionDevelopmentPath: harness, extensionTestsPath: join(harness, 'extension-tests.cjs'),
      extensionTestsEnv: { OPENCODE_NOTIFY_SMOKE_DIR: scenario, OPENCODE_NOTIFY_SETUP_MODE: mode,
        OPENCODE_NOTIFY_EXTENSIONS_DIR: extensions, XDG_CONFIG_HOME: config },
      launchArgs: [workspace, ...isolated, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
        ...(mode === 'newer-disabled' ? ['--disable-extension=buckanovnikita.opencode-notify-router'] : []),
        '--disable-gpu', '--no-sandbox', '--disable-updates', '--disable-telemetry'],
    });
  }
} finally { await rm(task, { recursive: true, force: true }); }
