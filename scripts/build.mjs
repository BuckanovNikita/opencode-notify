import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

const common = { bundle: true, platform: 'node', target: 'node20', logLevel: 'info', legalComments: 'eof' };
await build({ ...common, entryPoints: ['packages/plugin/src/index.ts'], outfile: 'packages/router/dist/opencode-notify.js',
  format: 'esm', banner: { js: '// OpenCode Notify managed plugin — v0.1.0; installed by explicit VS Code command' } });
await Promise.all(['router', 'presenter'].map(async name => {
  await build({ ...common, entryPoints: [`packages/${name}/src/extension.ts`], outfile: `packages/${name}/dist/extension.cjs`,
    format: 'cjs', external: ['vscode', 'node-notifier'] });
  await copyFile('LICENSE', `packages/${name}/LICENSE`);
}));
await build({ ...common, entryPoints: ['packages/router/src/cli.ts'], outfile: 'packages/router/dist/cli.cjs', format: 'cjs' });
await mkdir('dist', { recursive: true });
await copyFile('packages/router/dist/opencode-notify.js', 'dist/opencode-notify.js');
await build({ ...common, entryPoints: ['tests/extension/suite.ts'], outfile: 'dist/extension-tests.cjs', format: 'cjs', external: ['vscode'] });
