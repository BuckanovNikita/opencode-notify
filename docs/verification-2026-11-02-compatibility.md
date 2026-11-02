# Compatibility verification — 2026-11-02

## Scope and baseline

Task starts at clean commit `d7bdc92`. Baseline: 95 tests passed. Implementation
adds a single default dual-version plugin definition, shared notification sender,
v2 lifecycle adapter, VS Code 1.90 manifests/types, pinned runtime matrix and
Git-tag-only release workflow. Protocol v1 and adapter import rules are unchanged.

## Compatibility evidence

- OpenCode public API verified against pinned 2.2.5 package schemas and implementation.
  [Migration contract](https://opencode.ai/v2/docs/build/plugins/migrate-v1#support-v1-and-v2-from-one-package).
  [Execution lifecycle](https://github.com/anomalyco/opencode/blob/v2.2.5/packages/core/src/session/execution.ts)
  emits one terminal observation per busy period, without an execution ID.
- V2 plugin session metadata is flat; its Promise adapter unwraps the HTTP data
  envelope and accepts only session input. A bounded metadata wait owns its timer;
  the underlying host request has no forwarded cancellation option.
- V2 subscriptions inherit the plugin location scope, including owner-routed
  session events. Global forms and forms unrelated to questions are ignored.
- VS Code 1.90 supports the existing VSIX installation and remote inventory commands.
  [Remote inventory](https://github.com/microsoft/vscode/blob/1.90.0/src/vs/workbench/api/browser/mainThreadCLICommands.ts)
  includes disabled extensions; remote management resolves the current profile.
  The installed VSIX manifest still selects the workspace host.
- The first 1.90 multiwindow run reproduced a harness gap: origin URI consent was
  neither visible through the native dialog nor accepted by its full-URI selector.
  Retained custom-dialog evidence showed the correct OpenCode Notify confirmation,
  with truncated plain-text URI. The isolated harness now selects custom dialogs
  and recognizes that version's extension-specific prompt. Production consent is
  unchanged; terminal and foreground assertions remain mandatory.

## Executed checks

- `npm run check`: passed; strict compilation against `@types/vscode@1.90.0`,
  107 tests, production imports and eight negative probes, Markdown and local links.
- `npm audit --omit=dev`: passed, zero production vulnerabilities.
- `npm run package`: passed for both 0.4.0 VSIXs.
- `npm run test:native`: passed all three pinned OpenCode versions, including
  actual local provider calls, source registration, authenticated completion and title.
- `VSCODE_TEST_VERSION=1.90.0 xvfb-run -a npm run test:extension`: passed all
  five profiles, including auto setup, both opt-outs, preserved plugin and disabled
  newer Router; exact real npm/node source terminal selection also passed.
- `VSCODE_TEST_VERSION=1.143.1 xvfb-run -a npm run test:extension`: same checks passed.
- `VSCODE_TEST_VERSION=1.90.0 xvfb-run -a npm run test:multiwindow`: passed
  after the consent harness correction; alert in B foregrounds exact terminal in A.
- `VSCODE_TEST_VERSION=1.143.1 xvfb-run -a npm run test:multiwindow`: passed.
- Both multiwindow versions also passed with `OPENCODE_NOTIFY_SMOKE_PROFILES=1`.
- ZIP inspection passed: both manifests have version 0.4.0 and engine ^1.90.0;
  Router contains CLI and the exact built plugin; presenter embeds exact Router
  bytes, both SnoreToast architectures, both Notifu architectures and macOS helper.
  Plugin imports only Node built-ins; importing built ESM confirms only the default
  definition with id/server/setup. SHA256SUMS matches both packages.
- `git diff --check`: passed.

Artifact SHA256 at this verification checkpoint:

```text
9541bbe3dee66ca42dc1c40aeb8f285276d4079b7ace8eeeb703c2954918ccf5  opencode-notify-router-0.4.0.vsix
c75c04819f1128b57e4204ec1822e2373212d8fff7650b3b05515f7738778c4d  opencode-notify-0.4.0.vsix
```

## Independent review and acceptance

Fresh-context native reviewer `final_review` inspected the complete diff against
`d7bdc92`, all untracked additions, pinned v2 source and executed logs. Verdict:
ready to merge; no Critical, Important or Minor findings. The reviewer independently
ran diff whitespace validation, not the runtime matrices. Parent reconciled the
full task-owned diff, including manifests/lockfiles, new plugin internals/tests,
harness, workflows and documentation; no unrelated changes were present.

Review boundaries and parent decisions:

- Actual SSH/WSL/container host placement remains manual acceptance as planned;
  headless local setup and source inspection do not substitute for it.
- Native desktop appearance/physical foreground behavior on operating systems
  remains separate platform acceptance; Linux/Xvfb assertions are narrower.
- Releases beyond the pinned matrix cannot be proven in advance. The public
  compatibility contract and minimum API types support the stated range; later
  upstream changes still require regression verification.

The cost of those limits is possible platform- or upstream-specific regressions
outside the recorded matrix. None is reported as a passing platform test.
Planning and acceptance architecture validation pass, with executable boundaries
and eight negative probes preserved. Release push/workflow outcome is reported
separately after this source checkpoint.

## Platform limits

Tests run in isolated Linux profiles under Xvfb. They establish installed artifact
setup, authenticated delivery, source registration, VS Code alerts/actions and
exact integrated-terminal selection. They do not establish actual SSH/WSL/container
extension-host placement or visual native notification behavior on Windows,
macOS or a Linux desktop. Those remain manual platform acceptance, with no new
claim of desktop visual acceptance in this release.

## Release policy

Version 0.4.0 uses an annotated Git tag only. VSIXs and checksums remain local and
in Actions artifacts. No GitHub Release, npm package or Marketplace publication.
