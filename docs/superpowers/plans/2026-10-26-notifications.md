# OpenCode Notify Implementation Plan

**Goal:** Deliver the independent OpenCode v1 plugin, local/remote VS Code bridge,
and installable VSIX release assets.

**Architecture:** A pure protocol joins a remote plugin/router and a local
presenter. Credentials and side effects remain in their owning adapters.

**Tech stack:** TypeScript, Node >=22, Node test runner, esbuild, VSCE, VS Code >=1.93.

**Spec:** [Notification design](../specs/2026-10-26-notifications-design.md).
**Architecture record:** [architecture.json](initial-release/architecture.json).

## Global constraints

- OpenCode v1 only; no runtime dependency on either OpenCode SDK.
- Preserve the existing sibling repository and all personal configuration.
- Two VSIX packages; plugin is bundled in the router and installed by command.
- Main alerts: completed run, question, permission, error; child completions opt in.
- Do not publish npm packages or Marketplace extensions.

## Execution and review

The user has requested implementation and delivery through completion. The parent
owns implementation, integration and release. Bounded read-only investigations
may run alongside parent work. A fresh independent reviewer evaluates the final
integrated code and verification evidence. No additional design approval stage is
needed for the already requested behavior and delivery.

## Review focus

- Concurrent sessions/windows: no cross-window credential guessing or dedup loss.
- Idle after questions, aborts, or errors: do not announce false completion.
- Disconnected/missing presenter: bounded failure, actionable log, no agent crash.
- Untrusted JSON, titles and message text: validate and never use shell evaluation.
- Packaging: native helper binaries and plugin bundle must be present in VSIX.

## Tasks

- [x] T1: Write failing protocol/architecture tests; implement pure wire validation,
  strict TypeScript project and executable dependency rules. Run `npm run typecheck`,
  `npm test`, and `npm run check:architecture` including an injected forbidden edge.
- [x] T2: Write event-sequence tests; implement v1 session state, question/permission
  hooks, cancellation handling, configuration and timeout-bound HTTP transport.
  Run plugin tests including repeated turns, child sessions and unavailable router.
- [x] T3: Write receiver/presentation tests; implement authenticated remote router,
  explicit plugin install/start commands, local presenter and native fallback.
  Verify real HTTP and no shell injection through titles or messages.
- [x] T4: Bundle plugin/extensions, package VSIXs, add CI and release automation,
  Russian README, English developer docs and local documentation validation.
- [x] T5: Run integrated checks and isolated real extension-host smoke test; inspect
  final archive content and record dated evidence and limitations.
- [x] T6: Obtain fresh independent review, resolve blockers, reconcile complete
  task scope and architecture acceptance, and make a Conventional Commit.
- [x] T7: Create/use authorized GitHub destination, push commit and annotated tag,
  publish release with both VSIX assets, and verify their remote metadata/checksums.

## Progress and decisions

- Inspected target: directory did not exist; this is a new isolated repository.
- Existing `clearml-yolo` changes are outside scope and remain untouched.
- Shared protocol is established first; implementation investigation is independent.

- Parent integration passed 27 tests, real OpenCode v1.2.0 smoke, installed VSIX
  smoke in VS Code 1.93.1, architecture and documentation checks. Independent
  final review is in progress; release remains pending.

- Final correction checks passed 32 tests and both real-process smoke tests. Fresh
  independent acceptance review returned ship; architecture and full task scope
  reconciled. Release publication is the remaining task.

- Published private repository and annotated `v0.1.0` tag. GitHub CI passed on the
  release commit; its two VSIXs and checksums were published and downloaded for
  byte-for-byte verification. Initial tag workflow did not start, so the equivalent
  verified CI-artifact publication path was used without moving the tag. All tasks
  are complete; dated verification records the details and platform limitations.
