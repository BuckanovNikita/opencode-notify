# Automatic Setup Implementation Plan

**Goal:** Install the notification components automatically in trusted desktop VS Code workspaces.

**Architecture:** The local presenter installs a bundled Router VSIX through VS
Code. The workspace Router owns create-only plugin installation. Protocol remains
pure; existing import contracts cover both adapters and negative probes.

**Tech stack:** TypeScript, Node >=22, npm, VS Code >=1.93, esbuild and VSCE.

**Spec:** [Automatic setup design](../specs/2026-10-26-automatic-setup-design.md).
**Architecture:** [Record](automatic-setup/architecture.json).

## Constraints and execution

Desktop VS Code only; retain OpenCode v1 and no runtime SDK dependencies. No
Marketplace/npm publishing. Preserve existing plugin files and configuration.
The starting checkout is clean. Parent implements in place and verifies; a fresh
read-only reviewer assesses the integrated diff afterward. No parallel writers
are needed because packaging and extension tests depend on the runtime change.
The user's confirmed remote scope and completion instructions authorize execution
through the existing release workflow without further stage prompts.

## Tasks

- [x] T1: Validate this architecture plan. Add failing setup tests for missing,
  matching, older/newer Router versions, disabled/untrusted environments, failures
  and concurrent calls. Add a concurrent plugin-install preservation test.
- [x] T2: Implement presenter setup policy and VS Code adapter, a private Router
  status command and automatic create-only plugin setup with opt-outs. Keep manual
  recovery commands. Run tests and type checking.
- [x] T3: Package Router first and embed its VSIX in presenter. Replace hardcoded
  plugin banner version. Change extension smoke to install only presenter and
  verify Router, plugin and CLI are provisioned; isolate XDG config. Exercise an
  opt-out profile and preserve a pre-existing modified plugin.
- [x] T4: Update Russian READMEs, English development guidance and changelog;
  synchronize 0.2.0 manifests and lockfiles. Run `npm run check`,
  `npm audit --omit=dev`, `npm run package`, `npm run test:native` and
  `xvfb-run -a npm run test:extension`; inspect nested VSIX contents/checksums.
- [ ] T5: Record dated evidence, obtain fresh independent review, resolve findings,
  reconcile the complete diff and validate architecture acceptance. Re-read the
  commit procedure, commit, tag/push and verify authorized VSIX release assets.

## Review focus

- A local Router installation must not conceal a missing remote Router.
- Disabled automation and untrusted workspaces must not write plugin files.
- Existing or concurrently created plugin content must survive automatic setup.
- Installation failure must leave local presentation available and offer recovery.
- A newer Router must not be downgraded; active older code must request reload.

## Evidence

See [dated verification](../../verification-2026-10-26-automatic-setup.md) for failed-first tests,
46 passing tests, five real extension profiles, native OpenCode, independent review
and corrected findings. Architecture acceptance and release are the remaining
completion steps. The selected correction workflow uses parent regression
verification after one independent review, not a second review verdict.
