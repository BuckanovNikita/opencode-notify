import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowed = {
  protocol: new Set(), plugin: new Set(['node:crypto', 'node:fs/promises', 'node:os', 'node:path']),
  router: new Set(['node:crypto', 'node:fs/promises', 'node:http', 'node:os', 'node:path', 'node:child_process', 'node:util', 'vscode']),
  presenter: new Set(['node:child_process', 'node:util', 'node-notifier', 'vscode',
    'node:crypto', 'node:fs/promises', 'node:path', 'node:http', 'node:net']),
};

export function violations(file, source) {
  const path = relative(root, resolve(root, file)).replaceAll('\\', '/');
  const module = path.split('/')[1];
  if (!allowed[module]) return [`Unknown production module: ${path}`];
  const errors = [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const inspect = specifier => {
    if (!ts.isStringLiteral(specifier)) { errors.push(`${path}: non-literal import is forbidden`); return; }
    const dependency = specifier.text;
    if (dependency.startsWith('.')) {
      const target = relative(root, resolve(root, dirname(file), dependency)).replaceAll('\\', '/');
      if (!target.startsWith(`packages/${module}/src/`) && !target.startsWith('packages/protocol/src/')) {
        errors.push(`${path}: forbidden import ${dependency}`);
      }
    } else if (!allowed[module].has(dependency)) errors.push(`${path}: undeclared dependency ${dependency}`);
  };
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) { if (node.moduleSpecifier) inspect(node.moduleSpecifier); }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      if (node.arguments[0]) inspect(node.arguments[0]); else errors.push(`${path}: empty dynamic import`);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return errors;
}

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory()
    ? files(resolve(directory, item.name)) : item.name.endsWith('.ts') ? [resolve(directory, item.name)] : []);
}

export function check() {
  const errors = Object.keys(allowed).flatMap(module => files(resolve(root, 'packages', module, 'src'))
    .flatMap(file => violations(relative(root, file), readFileSync(file, 'utf8'))));
  // Negative probes prove that the same checker rejects forbidden dependency edges.
  for (const [file, code] of [
    ['packages/protocol/src/probe.ts', "import { readFile } from 'node:fs';"],
    ['packages/plugin/src/probe.ts', "import '../../router/src/server.js';"],
    ['packages/router/src/probe.ts', "await import('../../presenter/src/native.js');"],
    ['packages/presenter/src/probe.ts', "import type { X } from '../../../tests/helpers.js';"],
    ['packages/protocol/src/probe.ts', "import type { Server } from 'node:net';"],
    ['packages/plugin/src/probe.ts', "import { execFile } from 'node:child_process';"],
    ['packages/presenter/src/probe.ts', "import '../../router/src/sources.js';"],
    ['packages/router/src/probe.ts', "export { x } from '../../presenter/src/peers.js';"],
  ]) if (violations(file, code).length === 0) errors.push(`Negative probe was incorrectly accepted: ${file}`);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Production import contracts and eight negative probes passed.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) check();
