import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { createRequire } from 'node:module';
import notifier from 'node-notifier';
import { nativeNotification, desktopNotification } from '../src/native.js';

test('Linux native adapter passes hostile text as literal argv', { skip: process.platform !== 'linux' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'opencode-notify-native-'));
  const output = join(directory, 'args.json');
  const executable = join(directory, 'notify-send');
  await writeFile(executable, `#!${process.execPath}\nrequire('fs').writeFileSync(${JSON.stringify(output)}, JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o700 });
  const previousPath = process.env.PATH;
  process.env.PATH = `${directory}${delimiter}${previousPath || ''}`;
  t.after(async () => {
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    await rm(directory, { recursive: true, force: true });
  });
  const title = '--help; $(echo injected)';
  const message = '`uname` "quotes" \'apostrophe\' \\backslash';
  await nativeNotification({ version: 1, id: 'test', event: 'question', sessionId: 's1', project: 'demo',
    directory: '/demo', title, message, occurredAt: 1000 }, false, assert.fail);
  const args = JSON.parse(await readFile(output, 'utf8')) as string[];
  assert.deepEqual(args.slice(-3), ['--', title, message]);
  assert.ok(args.includes('--hint=boolean:suppress-sound:true'));
});

test('Windows dependency launch errors cannot silently count as delivered', async t => {
  // Exercise the actual v10 WindowsToaster parser, which drops non--1 launch errors.
  const require = createRequire(import.meta.url);
  const utils = require('node-notifier/lib/utils') as {
    createNamedPipe(server: unknown): Promise<Buffer | undefined>;
    fileCommand(path: string, args: string[], callback: (error: NodeJS.ErrnoException) => void): void;
  };
  t.mock.method(utils, 'createNamedPipe', async () => undefined);
  t.mock.method(utils, 'fileCommand', (_path: string, _args: string[], callback: (error: NodeJS.ErrnoException) => void) => {
    callback(Object.assign(new Error('Helper missing'), { code: 'ENOENT' }));
  });
  await assert.rejects(desktopNotification({ version: 1, id: 'windows-test', event: 'complete', sessionId: 's1',
    project: 'demo', directory: '/demo', title: 'Test', message: 'Done', occurredAt: 1000 }, false,
  assert.fail, 'win32', new notifier.WindowsToaster()), /confirmation|helper/i);
});
