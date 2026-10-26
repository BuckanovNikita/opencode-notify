import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ignored = new Set(['node_modules', '.git', '.vscode-test', 'dist', 'artifacts']);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(item => ignored.has(item.name) ? [] :
    item.isDirectory() ? files(resolve(directory, item.name)) : item.name.endsWith('.md') ? [resolve(directory, item.name)] : []);
}
let checked = 0;
for (const file of files('.')) {
  for (const match of readFileSync(file, 'utf8').matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const href = match[1];
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    const path = decodeURIComponent(href.split('#')[0]);
    if (!existsSync(resolve(dirname(file), path))) throw new Error(`Broken local link in ${file}: ${href}`);
    checked++;
  }
}
console.log(`Validated ${checked} local documentation links.`);
