import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

if (process.platform !== 'win32') {
  throw new Error('test:windows requires Windows Node and an interactive Windows desktop; WSL/Linux execution cannot prove native activation.');
}
await build({ entryPoints: ['tests/windows/smoke.ts'], outfile: 'dist/windows-smoke.cjs', bundle: true,
  platform: 'node', target: 'node20', format: 'cjs' });
const helper = process.env.OPENCODE_NOTIFY_WINDOWS_HELPER || resolve('node_modules', 'node-notifier', 'vendor', 'snoreToast',
  `snoretoast-${process.arch === 'ia32' ? 'x86' : 'x64'}.exe`);
await new Promise((resolveRun, reject) => {
  const child = spawn(process.execPath, [resolve('dist/windows-smoke.cjs'), '--helper', helper,
    '--activation-script', resolve('tests/windows/activate-toast.ps1'), ...process.argv.slice(2)],
    { stdio: 'inherit', windowsHide: false });
  const timer = setTimeout(() => { child.kill(); reject(new Error('Windows acceptance process exceeded 130 seconds')); }, 130_000);
  child.once('error', error => { clearTimeout(timer); reject(error); });
  child.once('exit', (code, signal) => {
    clearTimeout(timer);
    if (code === 0) resolveRun();
    else reject(new Error(`Windows acceptance failed: exit=${code}, signal=${signal}`));
  });
});
