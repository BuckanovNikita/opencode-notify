# Instruction migration checks — 2026-11-02

## Scope and preservation

The task standardizes agent instruction discovery only. Existing application,
service, generated workflow and unrelated source changes are preserved. No runtime
API, database, dependency or deployment changes are made. The implementation checks below preceded commit/release activity; release
outcomes are reported by the coordinating task separately. No deployment or
skill installation is part of this migration.

## Executed checks

- `npm run check:docs` — PASS: 23 Markdown files, zero lint issues; 23 local links validated. Initial bare-import adapter failed MD041; adding a heading resolved it without disabling the check.

Planning and acceptance record validation use the shared architecture validator
with this repository as the explicit root. All root adapter and changed-document
relative links were inspected separately; Git whitespace checks cover owned paths.

## Limits and remaining integration

File checks establish physical instruction discovery structure, not actual loaded
model context. Fresh Claude/Codex sessions, Windows discovery, settings parity,
parent integration, independent final review and authorized commit/release remain
with the coordinating task. Relevant application/runtime suites were not rerun
because no application behavior changed. Missing required release checks must
remain acceptance gaps rather than being inferred from these documentation checks.

## Independent review

The coordinating parent reported fresh `project_review` verdict **SHIP** with no
blocking defects on 2026-11-02. The reviewer validated all twelve project no-impact
records and inspected the documentation evidence across the integrated migration.
No runtime acceptance is inferred from that review. Authorized repository commit
and release gates remain in force; failed gates must be reported separately.

## Native release checks for 0.4.1

- Full `npm run check` passed: 107 tests, type checking, architecture contracts
  with eight negative probes, and documentation lint/links.
- `npm audit --omit=dev` reported zero vulnerabilities.
- `npm run package` produced both local 0.4.1 VSIXs and SHA256SUMS. Archive
  inspection verified both manifest versions, exact embedded Router bytes,
  standalone plugin/CLI and Windows native helpers; both checksums match.
- `npm run test:native` passed against all three pinned real OpenCode servers
  using the local fixture provider and isolated configuration.
- The extension smoke passed on actual VS Code 1.90.0 and 1.143.1.
- The two-window smoke passed on actual VS Code 1.143.1. Its first 1.90.0 run
  concurrently with other GUI scenarios failed foreground acceptance
  (`focused=false`, `foregroundCommandAvailable=false`). Repeating that exact
  minimum-version scenario alone passed: one alert in B, foreground A, and
  exact originating terminal selection. The initial failure remains recorded;
  this task changes no application logic to conceal it.

All installations above were temporary test profiles owned and cleaned by the
existing harnesses. The user's editor profile and OpenCode configuration were
not changed. Native Windows desktop acceptance and real remote-host placement
remain separate from these source-release compatibility checks.

The separate-profile multiwindow scenarios (`OPENCODE_NOTIFY_SMOKE_PROFILES=1`)
also passed sequentially on both pinned versions. Final `npm run check` again
passed all 107 tests and configured static/documentation gates after synchronized
0.4.1 version preparation. Dependency lock entries are unchanged apart from the
root package version fields. Git-only publication is the remaining release step.
