# Installation documentation verification — 2026-11-04

## Inspection

Baseline `cf31eb040189eddaea5428f43e53b8775a25456e` was clean. Root,
presenter and Router manifests all declare 0.4.1. The Actions Release VSIX run
[41453668570](https://github.com/BuckanovNikita/opencode-notify/actions/runs/41453668570)
succeeded for the v0.4.1 tag. The coordinating investigation downloaded its
published VSIX artifact and verified the GitHub ZIP digest, enclosed SHA256SUMS,
both manifest versions and byte-identical embedded Router. Machine-specific
inspection details and full raw logs remain in private maintenance evidence.

## Executed checks

- Architecture planning validator: exit 0 before editing the README.
- `npm run check:docs`: exit 0; 26 Markdown files, no lint issues and 24 local
  documentation links validated.
- Scoped Python assertions: exit 0; all three README examples match the synchronized
  0.4.1 manifests, no 0.4.0 reference remains in README, and both named VSIXs exist.
- `git diff --check`: exit 0. Inspected the three README edits and all three new
  task-artifact files against the clean baseline; no unrelated changes exist.
- Architecture acceptance validator: exit 0 for this no-impact record.

The earlier full source check passed all 107 tests, types, architecture contracts
with eight negative probes, and documentation checks. The downloaded published
presenter also passed the existing five-scenario Linux installed-host smoke.
Those baseline checks establish the inspected product state; this documentation
correction requires its own current documentation checks, recorded separately.

## Scope and remaining acceptance

The complete task-owned diff contains only three README version-reference changes
and this task's plan, no-impact record and dated evidence. Runtime source,
dependencies, versions, existing plans and historical notes remain unchanged.
Parent verified the exact final diff and reran `npm run check`: 107 tests, types,
architecture checks with eight negative probes, and documentation checks pass.
Fresh independent read-only review returned ship with no findings for this scoped
documentation. The task-scoped documentation commit follows these checks. This correction
references the existing published artifacts and creates no new product version.
Broader owner-installation/native acceptance and any subsequent version release
await owner choices. No installation or publication was performed. Windows native
callback/focus, real remote-host placement and owner-profile installation remain
unverified; local artifact checks do not establish those outcomes.
