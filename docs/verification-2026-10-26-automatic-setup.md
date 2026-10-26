# Automatic setup verification — 2026-10-26

## Scope

The user confirmed desktop VS Code remote environments. Version 0.2.0 bundles
Router inside the local presenter VSIX and installs it through VS Code. Router
automatically creates an absent OpenCode v1 plugin. Existing differing plugin
files are preserved. No user's installed extensions or OpenCode configuration
were changed by this verification.

## Executed checks

| Check | Observed outcome |
| --- | --- |
| Baseline `npm run check` | Passed, 32 tests before implementation |
| New setup/concurrent-install tests before implementation | Failed: setup module absent and concurrent plugin writes raised EEXIST |
| Presenter-only VSIX smoke before bundling | Failed: missing `dist/router.vsix` and Router not installed |
| Presenter-only smoke after initial packaging change | Failed: VSCE default exclusions omitted the nested VSIX |
| Initial integrated `npm run check` | Passed: 42 tests, strict TypeScript, import contracts and four negative probes, Markdown and local links |
| `npm audit --omit=dev` | Passed: zero reported vulnerabilities |
| `npm run package` | Passed: both 0.2.0 VSIXs and SHA256SUMS |
| Archive inspection | Nested Router bytes equal the standalone Router VSIX; plugin, CLI and native desktop helpers present |
| `npm run test:native` | Passed: real OpenCode v1.2.0 server events through bundled plugin and authenticated HTTP |
| Initial `xvfb-run -a npm run test:extension` | Passed: four isolated VS Code 1.93.1 profiles, each initially installing only presenter |

The four installed-extension scenarios verify automatic Router/plugin installation,
Router opt-out, plugin opt-out and preservation of a personal plugin. Enabled Router
scenarios also check activation, current-version status, authenticated delivery,
malformed-request rejection and credentials/CLI PATH injection into a new terminal.
The XDG config directories, profiles and test processes belong to the harness and
are cleaned up on exit. Native OpenCode uses an isolated local fixture provider.

The VSIX exclusion failure was traced to VSCE's default `**/*.vsix` ignore. The
presenter's explicit `!dist/router.vsix` exception resolves it; the same real
installed-extension test then passed. Concurrent creation now treats EEXIST as
another writer winning, reads the resulting content, and never overwrites it.

## Architecture and limitations

Only protocol constants are shared between adapters. Presenter setup uses injected
status/install operations for its decision tests; the installed-extension suite
exercises the real VS Code command and packaged files. Router owns plugin writes;
protocol remains effect-free. Existing import contracts reject prohibited edges.
Version/configuration/packaging changes add no runtime dependency.

Real SSH, WSL, Dev Container and tunnel placement was not exercised in these
tests. They prove the local desktop installation path, not every remote platform.
The remote design uses VS Code's documented
[VSIX install command](https://code.visualstudio.com/api/references/commands)
and the minimum supported version's
[workspace-host selection](https://github.com/microsoft/vscode/blob/1.93.1/src/vs/workbench/services/extensionManagement/common/extensionManagementService.ts).
VS Code owns transfer/placement; no host-name list or shell bootstrap is used.
Actual OS popup visibility and native Windows/macOS behavior remain manual checks.
Untrusted-workspace suppression has manifest guards and a setup-policy unit test;
the extension harness runs trusted isolated profiles. Existing OpenCode processes
must be restarted to load a newly installed plugin and terminal environment.

## Independent review and corrections

A fresh GPT-6 Astra reviewer (requested high effort, read-only, no delegation)
reviewed the integrated diff and logs. Its verdict was **fix-first**: unavailable
status could cause a disabled newer Router, or a newer installed version awaiting
reload, to be replaced. It also found that `remoteName` cannot identify the host
because VS Code exposes it on both sides. The parent additionally identified that
explicit setup/activation calls in the smoke could mask broken startup automation.

The parent reproduced the two downgrade decisions with failing unit tests, then
added installed-inventory checks. Both passed after correction. A malformed remote
inventory response was also observed failing its rejection test and then corrected.
Host checking now uses actual `extensionKind`. The default installed smoke waits
for startup provisioning without invoking setup or activating Router itself.
A fifth profile installs a disabled test-only Router version 9.0.0 and verifies
its installed metadata and disabled state survive setup.

The reviewer separately advised on inventory API availability. No public disabled
inventory API was found. The remote CLI list command is profile-aware but internal;
local adjacent manifests are a conservative guard. Unknown inventory stops setup.
An obsolete newer local directory can cause a safe false positive; simultaneous
external upgrades remain a race because VS Code exposes no atomic compare/install.
These limits are documented rather than reported as verified remote coverage.

Per the selected execution workflow, the parent verifies the single correction
pass with regression tests and the complete suite; no second review is claimed.
No deferred review findings remain. The review excluded plain SSH/browser clients,
OpenCode/OS dependency installation and publication status; those scope decisions
stand, and publication is completed separately. Final post-correction results and
release publication follow below. Initial-release evidence remains unchanged.

## Final correction acceptance

- `npm run check`: passed, 46 tests, strict types, import rules/four negative probes
  and documentation checks after the review corrections.
- `npm run package`: passed with the corrected inventory and host checks.
- `xvfb-run -a npm run test:extension`: passed all five VS Code 1.93.1 profiles.
  The ordinary profile required automatic startup installation and activation;
  the disabled 9.0.0 Router fixture remained installed without activation/downgrade.
- Native OpenCode 1.2.0 smoke passed for the unchanged v0.2.0 plugin bundle;
  post-review changes affect presenter inventory and Router status only.
- Full task-owned diff inspection includes added setup module/tests, concurrent
  installer handling, manifests/locks, packaging exclusion and bundle order, test
  harness isolation and fixtures, documentation and architecture record. The
  checkout started clean and no unrelated paths are excluded.

The parent accepted the regression-verified correction pass under the selected
workflow. The independent reviewer did not issue a second verdict. The architecture
record refers to this review and correction evidence without representing the
initial fix-first verdict as an unconditional approval.
