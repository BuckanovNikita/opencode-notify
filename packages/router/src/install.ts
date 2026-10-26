import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const OWNED_PLUGIN_MARKER = '// OpenCode Notify managed plugin';

export async function installPlugin(source: string, destination: string, replace = false): Promise<'installed' | 'unchanged' | 'conflict'> {
  const bundle = await readFile(source, 'utf8');
  if (!bundle.startsWith(OWNED_PLUGIN_MARKER)) throw new Error('Bundled plugin is missing its ownership marker');
  let existing: string | undefined;
  try { existing = await readFile(destination, 'utf8'); }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  if (existing === bundle) return 'unchanged';
  // Even previously managed files may contain user edits: explicit confirmation owns replacement.
  if (existing !== undefined && !replace) return 'conflict';
  await mkdir(dirname(destination), { recursive: true });
  try { await writeFile(destination, bundle, { flag: replace ? 'w' : 'wx', mode: 0o600 }); }
  catch (error) {
    if (replace || !(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    // Another window (or the user) created the file after our read. Never overwrite it.
    return await readFile(destination, 'utf8') === bundle ? 'unchanged' : 'conflict';
  }
  return 'installed';
}
