import { downloadAndUnzipVSCode, runTests, resolveCliArgsFromVSCodeExecutablePath } from '@vscode/test-electron';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const executable = await downloadAndUnzipVSCode(process.env.VSCODE_TEST_VERSION || '1.93.1');
const task = await mkdtemp(join(tmpdir(), 'opencode-notify-vscode-'));
try {
  const userData = join(task, 'profile'); const extensions = join(task, 'extensions');
  const workspace = join(task, 'workspace');
  await mkdir(workspace, { recursive: true });
  const [cli, ...baseArgs] = resolveCliArgsFromVSCodeExecutablePath(executable);
  const isolated = [`--user-data-dir=${userData}`, `--extensions-dir=${extensions}`];
  for (const name of ['opencode-notify', 'opencode-notify-router']) {
    execFileSync(cli, [...baseArgs.filter(arg => !arg.startsWith('--user-data-dir') && !arg.startsWith('--extensions-dir')),
      ...isolated, '--install-extension', resolve('artifacts', `${name}-${version}.vsix`), '--force'],
    { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, DONT_PROMPT_WSL_INSTALL: '1' }, timeout: 120000 });
  }
  await runTests({ vscodeExecutablePath: executable, reuseMachineInstall: false,
    extensionDevelopmentPath: resolve('tests/extension'), extensionTestsPath: resolve('dist/extension-tests.cjs'),
    extensionTestsEnv: { OPENCODE_NOTIFY_SMOKE_DIR: task },
    launchArgs: [workspace, ...isolated, '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
      '--disable-gpu', '--no-sandbox', '--disable-updates', '--disable-telemetry'],
  });
} finally { await rm(task, { recursive: true, force: true }); }
