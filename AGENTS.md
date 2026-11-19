# OpenCode Notify

OpenCode v1/v2 notification plugin plus two VS Code extensions (Router and presenter) that deliver
completion, question, permission and error alerts from local and remote workspaces and return the user to the
exact originating terminal. Reference material (behavior contract, interfaces, operations) is in
[DOCS.md](DOCS.md); user-facing documentation is [README.md](README.md).

## Layout

- `packages/protocol/src` — shared message types and validation; the only module adapters may share.
- `packages/plugin/src` — self-contained OpenCode plugin (v1 `server()`, v2 `setup()`), bundled to
  `dist/opencode-notify.js`.
- `packages/router/src` — workspace-host extension: loopback HTTP bridge, terminal credentials, plugin install, CLI.
- `packages/presenter/src` — UI-host extension: local UI, native notifications, peers, activation, Router setup.
- `packages/*/test`, `tests/*.test.ts` — unit and integration tests (`node:test` via `tsx`).
- `tests/extension`, `tests/native`, `tests/windows` — VS Code host, real OpenCode and Windows smoke harnesses.
- `scripts/` — build, package, architecture check and smoke-test drivers.
- `packages/router/README.md`, `packages/presenter/README.md` — shipped inside the VSIXs; keep them.

## Environment

- Node >=22 and npm with the committed lockfiles (root and `packages/presenter`).
- Install: `npm ci --ignore-scripts`.
- Extension bundles target Node 20 for VS Code >=1.90.0. Neither OpenCode SDK is a runtime dependency.

## Checks

The gate (also what CI runs) is:

```bash
npm run check   # lint, format:check, typecheck, test, check:architecture
```

Individual steps: `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`,
`npm run check:architecture`. For a single file: `npx --no-install eslint --max-warnings 0 <file>`,
`npx --no-install prettier --check <file>`.

Additional stages, run separately when relevant (CI and the release workflow run them):

```bash
npm audit --omit=dev
npm run package                       # writes artifacts/*.vsix and SHA256SUMS
npm run test:native                   # pinned real OpenCode servers via npm exec; needs network
xvfb-run -a npm run test:extension    # downloads VS Code; omit xvfb-run on a desktop
xvfb-run -a npm run test:multiwindow
```

Set `VSCODE_TEST_VERSION` to test another VS Code version (CI matrix: 1.90.0 and 1.143.1). Platform and manual
acceptance procedures are in [DOCS.md](DOCS.md#operations-and-acceptance).

## Architecture boundaries

- Production code lives only in `packages/{protocol,plugin,router,presenter}/src`.
- Protocol imports nothing outside `packages/protocol/src` (no Node, VS Code or third-party packages).
- An adapter imports only its own `src` and protocol. External imports are limited to the per-module allow-lists
  in `scripts/check-architecture.mjs`, the authoritative boundary record; declare new dependencies there.
  `npm run check:architecture` enforces static, type-only, re-export, `require` and dynamic import edges; non-literal
  imports are forbidden.
- Effects belong to their owning adapter: Router owns loopback HTTP, terminal credentials and plugin filesystem
  writes; presenter owns UI, desktop effects and Router installation.
- The plugin stays self-contained: no runtime OpenCode SDK or other runtime dependency.

## Hard constraints

- Preserve the behavior contract in [DOCS.md](DOCS.md#behavior-contract), including its scenarios and exceptions.
  On any rewrite, compare original behavior, conditions and exceptions with their new home; separate approved policy
  changes from wording changes; keep compatibility obligations.
- Approved public-behavior changes update [DOCS.md](DOCS.md) (behavior contract, interfaces) in the same PR; the
  Linear feature issue holds the change spec.
- Preserve plugin ID `opencode-notify`, both v1 and v2 lifecycles, and protocol v1 compatibility (including payloads
  without source identity).
- Never log or package secrets; credentials are per-window and never written to a global file.
- Activation never executes caller-supplied commands or paths and never guesses a terminal.
- Plugin installation is create-only; never overwrite a differing plugin file without explicit confirmation.
- Setup never reloads a window automatically and never runs in untrusted workspaces.
- Do not replace bundled native helper files without updating their licenses and tests. Keep the `node-notifier`
  10.0.1 pin and its `uuid` 11.1.1 override.
- Linux native calls use an explicit `execFile` argv, never a shell command.

## Language standards

- TypeScript strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, unused-code
  and switch-fallthrough checks (`tsconfig.json`); do not loosen them.
- ESLint: shared strict core in `eslint-core.mjs` after `@eslint/js` recommended, then `strictTypeChecked` and
  `stylisticTypeChecked` with project type information. Warnings and unused disable directives fail.
- Prettier with `printWidth` 120; exclude generated and vendored files rather than adding formatting exceptions.
- Do not weaken the baseline with blanket suppressions to get a passing check. Keep tool configuration
  self-contained in the repo.
- Cleanup: trace consumers before removing or simplifying code; leave dependency pins intact; behavior changes go
  through a tracked issue, not a "cleanup".

## Release

- Release is Git-tag-only: annotated `vX.Y.Z` tag. Never create GitHub Releases; npm or Marketplace publication needs
  separate authorization. VSIXs stay local and as CI artifacts.
- Bump root, `packages/router` and `packages/presenter` versions together with their lockfiles and `CHANGELOG.md`;
  review user-facing version examples.
- Before tagging, run all checks for both pinned VS Code versions and inspect VSIX contents (native helpers,
  dual-version plugin, exact embedded Router). Push the commit and tag only with explicit push authorization.
- The tag workflow (`.github/workflows/release.yml`) checks tag/version match and reruns all checks; verify its
  conclusion — a failed workflow is a delivery gap.
- Never commit VSIXs, dependencies, test profiles, credentials or machine-specific configuration.

## Delivery

- Issues, plans and acceptance criteria live in Linear: team `SIP`, project `opencode-notify`. Search before creating.
  Labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, plus one category `Bug`,
  `Feature` or `Improvement`; readiness never overrides a blocker.
- One task branch and one GitHub PR against `main` (`BuckanovNikita/opencode-notify`) per cohesive change; name the
  `SIP-NN` id in branch and PR title. Agents push task branches and open PRs; humans merge. Never push `main` and
  never merge into it locally (release tag push keeps its own authorization).
- The repo is public, Linear is private: cite issues only as `SIP-NN`; never paste Linear URLs or issue text into
  GitHub or committed files. Put the PR link in the Linear issue.
- `npm run check` passes before a PR is marked ready; CI also runs on PRs. Move issues In Progress → In Review →
  Done (Done only after merge to `main` and acceptance met); record checks actually run in the issue.
- Changes to behavior, interfaces, dependencies, security or operational policy get a fresh independent review
  (not by the author) after integrated verification and before the PR is marked ready; the human merge is separate.
- Several cohesive tickets may share one PR; list every included `SIP-NN` in the PR description and link issue and PR
  in both directions. A draft PR may hold incomplete work.
- Start dependent work only once its prerequisite is verified on the branch used as its base; the dependency still
  orders the merges. Blocking uses Linear's blocked-by relation; a feature is a parent issue (holding the change
  spec) with ticket sub-issues.
- Finding an issue In Review with a merged PR: check its acceptance criteria and move it to Done. Work that changes no
  files completes on its recorded acceptance outcome. Confirm a GitHub check, branch protection or Linear automation
  exists before relying on it.
- One readiness and one category label at a time; use the existing labels, never create lowercase duplicates;
  `wontfix` also sets the lifecycle state to Canceled.

## Pitfalls

- HTTP acceptance means the local presenter accepted the event, not that an OS popup was seen. A helper's success,
  a headless run or a synthetic pipe callback is not visual acceptance.
- Local extension-host tests do not prove SSH/WSL placement or platform visual behavior; record those separately.
- `test:multiwindow` rejects the `stable` VS Code alias so a failed lookup cannot silently test a cached version.
- Standalone `opencode run` can exit before async plugin delivery; native tests use a persistent server.
- Windows toast callbacks follow a UTF-16 connection-EOF contract: one read is not one message.
- `env.remoteName` is window context on both hosts; extension host identity comes from `extensionKind`.
- Router inventory check plus VSIX install is not atomic; concurrent external Router updates are not covered.
- `tests/native/smoke.ts` sets `OPENCODE_DISABLE_CLAUDE_CODE`; that is an OpenCode setting, not a reference to
  agent config.

## Working agreement

- At the start of work, state the worktree path, the current branch and its relation to the default branch; say when remote refs were not fetched.
- Inspect existing and staged changes before editing. Preserve unrelated work and local overrides; stage only task-owned paths and inspect the staged diff.
- Report what each executed check establishes and what remains unverified; distinguish mocked checks, live outcomes and historical evidence. Clean up task-owned processes and temporary resources.
- Tests must exercise product code, never project tooling.
- Changes to behavior, interfaces, dependencies, security or operational policy need a fresh independent review after integration and verification. Small wording edits may be self-reviewed.
- Split large work into independent delegated tasks with explicit write ownership and acceptance evidence; delegated agents do not delegate further.
- Use Conventional Commits. Commit automatic formatting separately from logic. Local commits within the task scope need no approval.
- README.md is Russian; AGENTS.md and DOCS.md are English. Keep observed counts, timings and deployment status out of both files.
- Keep machine-specific paths, endpoints and settings in local configuration, not in these files.
