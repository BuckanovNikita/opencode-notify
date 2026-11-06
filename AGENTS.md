# OpenCode Notify

OpenCode v1/v2 notification plugin plus VS Code extensions (Router and presenter).

## Toolchain and checks

Use Node >=22 and npm with the committed lockfiles.

```bash
npm ci --ignore-scripts   # first, in a fresh checkout or worktree
npm run check             # typecheck, tests, architecture and docs checks; run before committing
npm run package           # build VSIXs and SHA256SUMS into artifacts/; run before release
```

Read `docs/development.md` before running platform, VS Code compatibility, native
OpenCode or manual acceptance checks, and before any release.

## Architecture

- Production modules are `packages/{protocol,plugin,router,presenter}/src`.
- Protocol imports nothing outside `packages/protocol/src` (no Node, VS Code or
  third-party packages).
- Among production modules, an adapter may import only its own `src` and protocol.
  External imports are limited to the per-module lists declared in
  `scripts/check-architecture.mjs`; add one only after updating the design and that
  checker. Effects belong to their owning adapter.
- `npm run check:architecture` enforces these import contracts.
- Keep runtime SDK dependencies out of the self-contained OpenCode plugin.

## Documentation and release

- README.md is Russian; other documentation is English.
- Preserve unrelated changes.
- Release with Git tags only; retain VSIX artifacts locally and in CI. Do not create
  GitHub Releases. npm and Marketplace publication require separate authorization.
- Follow "Commit and release" in `docs/development.md` for version bumps, the annotated
  `vX.Y.Z` tag and workflow verification.
