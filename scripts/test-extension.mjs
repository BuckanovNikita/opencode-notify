import { downloadAndUnzipVSCode, runTests, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const executable = await downloadAndUnzipVSCode(process.env.VSCODE_TEST_VERSION || '1.93.1');
const task = await mkdtemp(join(tmpdir(), 'opencode-notify-vscode-'));
try {
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
    const [cli, ...baseArgs] = resolveCliArgsFromVSCodeExecutablePath(executable);
    const isolated = [`--user-data-dir=${userData}`, `--extensions-dir=${extensions}`];
    execFileSync(cli, [...baseArgs.filter(arg => !arg.startsWith('--user-data-dir') && !arg.startsWith('--extensions-dir')),
        ...isolated, '--install-extension', resolve('artifacts', `opencode-notify-${version}.vsix`), '--force'],
      { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, DONT_PROMPT_WSL_INSTALL: '1' }, timeout: 120000 });
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
      { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, DONT_PROMPT_WSL_INSTALL: '1' }, timeout: 120000 });
    }
    await runTests({ vscodeExecutablePath: executable, reuseMachineInstall: false,
      extensionDevelopmentPath: resolve('tests/extension'), extensionTestsPath: resolve('dist/extension-tests.cjs'),
      extensionTestsEnv: { OPENCODE_NOTIFY_SMOKE_DIR: scenario, OPENCODE_NOTIFY_SETUP_MODE: mode,
        OPENCODE_NOTIFY_EXTENSIONS_DIR: extensions, XDG_CONFIG_HOME: config },
      launchArgs: [workspace, ...isolated, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
        ...(mode === 'newer-disabled' ? ['--disable-extension=buckanovnikita.opencode-notify-router'] : []),
        '--disable-gpu', '--no-sandbox', '--disable-updates', '--disable-telemetry'],
    });
  }
} finally { await rm(task, { recursive: true, force: true }); }
