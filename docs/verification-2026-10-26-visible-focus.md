# Visible notifications verification — 2026-10-26

## Scope and baseline

Implemented against clean `0c9babc`. The baseline check passed before runtime edits.
The task owns protocol, plugin, Router, presenter, import contracts, tests/harnesses,
README files, development guide, changelog and Superpowers artifacts. No unrelated
changes were present at baseline. Architecture planning validation passed before
implementation; code review accepted the final runtime changes. Full architecture acceptance
remains blocked by the explicitly failed desktop checks below.

## Automated evidence

- `npm run check`: passed after integration, including strict TypeScript, unit and
  integration tests (**95 passed, 0 failed**), import contracts with eight negative
  probes, and Markdown/link checks. This includes both review corrections and
  the focus-state timing regression.
- `npm run package`: passed after final runtime corrections. Both VSIXs built; ZIP
  inspection confirmed the embedded Router matches exactly, both Windows helper
  executables are present, source/tests are excluded, and plugin has no runtime SDK.
- `npm audit --omit=dev`: passed, zero production dependency advisories.
- `npm run test:native`: passed with real OpenCode v1.2.0, a local fixture provider,
  startup source registration and notification identity/session metadata.
- `xvfb-run -a npm run test:extension`: passed all five isolated VS Code 1.93.1
  scenarios, including two actual npm-launched `node` instances with identical
  terminal names/directories, exact terminal selection, source exit and closure.
- A requested `stable` run silently fell back to cached 1.93.1 after update API
  timeout. This is not current-version evidence. Harnesses now report actual
  versions and reject misleading fallback. The official release page resolved to
  1.143.1; its Microsoft CDN archive was downloaded directly when the update API
  timed out. The downloaded application manifest was verified as 1.143.1.
- `VSCODE_TEST_VERSION=1.143.1 xvfb-run -a npm run test:extension`: passed all five
  isolated scenarios, including real npm source selection. VS Code emitted upstream
  unsigned-in agent-host diagnostics; the extension tests exited successfully.
- `OPENCODE_NOTIFY_SMOKE_PROFILES=1 VSCODE_TEST_VERSION=1.143.1 xvfb-run -a npm run test:multiwindow`:
  passed against final packaged runtime at 19:29 UTC. Two named profiles were
  verified through their effective settings; B showed one alert, A zero duplicates,
  and the actual **Open OpenCode** button foregrounded A and selected its exact
  npm/node source among two identically named terminals. Cleanup confirmed zero
  task terminals and no remaining task processes.
- Tests-first failures were observed for new protocol fields/parsers, source
  registration, source/peer/Windows adapter behavior and privacy labels. The real
  Windows investigation motivated a regression test proving helper exit without
  a valid callback must fail instead of suppressing app fallback.

## Desktop evidence and gaps from the initial pass

Two real isolated VS Code 1.93.1 windows advertised authenticated peers. With B
focused, an event from A produced exactly one app alert in B and none in A. The
**Open OpenCode** action was clicked through the real workbench UI. The minimum
host does not expose `workbench.action.focusWindow`; its URI fallback did not
foreground/select A in this headless environment. No consent dialog was visible in the final minimum-host run. The current host
initially exposed a focus-state event race; after a bounded wait was implemented,
its final named-profile run passed without URI consent.
The harness correctly failed the activation assertion. This was an acceptance gap
until the user removed support for that version in the continuation below.

Windows Node executed the actual process adapter: CIM identity lookup and source
binding passed. The bundled SnoreToast emitted matching real named-pipe timeout
callbacks; its process exited with status 3. Neither a banner action nor a later
Notification Center action was accessible through scoped UI Automation. Callback
submission/timeout is not evidence that a toast was visible or clicked. Real
Windows two-window foreground and exact-console click acceptance remains pending.
The native smoke exited 1 after scoped UI Automation could not find its task-owned
banner/history actions. Its matching callback and CIM checks passed; a pass of this
native-only harness would still require separate Windows VS Code action checks.
The installed Windows VS Code had a pending update, so it was left untouched;
no existing user profile was opened or modified. The portable multiwindow harness
accepts an explicit test executable/app root for an isolated desktop installation.

At the end of the initial pass, no commit, release, tag, publication or
installed-user-profile modification had occurred. Package version was still
0.2.0 with development changes under Unreleased;
local VSIXs are verification builds, not a new published version.
Required desktop checks must pass before release; unresolved checks are not marked
passed in the architecture record.

## Source contracts checked

The Windows parser follows SnoreToast v0.7.0 connection EOF framing and UTF-16
formatAction records; banner lifecycle and activation lifetime are distinct.
See [SnoreToast implementation](https://github.com/KDE/snoretoast/blob/v0.7.0/src/snoretoasts.cpp)
and [pipe writer](https://github.com/KDE/snoretoast/blob/v0.7.0/src/utils.cpp).

Origin URI construction uses VS Code's own `asExternalUri` and URI handler. The
minimum host adds the origin window ID and requests foreground on handling; actual
OS URL dispatch and consent remain platform acceptance requirements.
See [VS Code 1.93 URI routing](https://github.com/microsoft/vscode/blob/1.93.1/src/vs/workbench/services/url/electron-sandbox/urlService.ts).

## Independent review and final reconciliation

The first requested reviewer failed at model capacity and produced no verdict.
A fresh GPT-6 Astra reviewer inspected all runtime modules and architecture, ran
41 focused tests and the eight import probes, and reported two P2 issues. Both
were reproduced with failing tests before correction: legacy presenter focus hints
now remain compatible, and simultaneous immutable registrations commit one binding.
The reviewer reran 17 focused tests and both original reproductions, checked the
94-test parent log, and accepted the corrections. After the real profile test
exposed delayed focus state, the reviewer additionally reran all four activation
tests and inspected the 95-test check log; final code verdict: **ship**.

[Review record](review-2026-10-26-visible-focus.md) distinguishes code acceptance
from the remaining desktop release gates. The complete tracked/untracked task diff
was reconciled with the architecture record, including checker, new adapters,
protocol, privacy compatibility, native smoke and multiwindow harnesses, package
settings, build/test scripts and documentation. No unrelated work was excluded.
Architecture plan validation passed. Acceptance validation was run and correctly
fails for the minimum-host/Windows desktop gaps; they have not been marked passed.

## Continuation after support-range change

The user explicitly removed VS Code 1.93 support. Both extensions now require
VS Code 1.143.1; host test defaults derive from the presenter manifest. The older
1.93 result above remains historical evidence and no longer blocks this release.
The origin URI fallback remains available for foreground failures on supported
hosts. Version metadata is prepared as 0.3.0 across manifests and lockfiles.

After this change, `npm run check` passed all 95 tests and the architecture/docs
checks. Packaging and all five isolated extension-host scenarios passed using
the new default 1.143.1 host. Real OpenCode v1.2.0 smoke also passed on the 0.3.0
bundle. Subsequent read-only Windows UI Automation identified **Do not disturb on**; WinRT confirms the task's toast
exists in history. This explains suppressed banners and immediate timeout callbacks.
No global notification setting has been changed. Temporary alteration requires
the user's answer to the pending permission question.

A separate Microsoft-signed Windows VS Code 1.143.1 archive was used with isolated
user data and two named profiles; the installed editor and its pending update were
left untouched. Both 0.3.0 VSIXs installed. The real **Open OpenCode** app action
passed: B displayed one alert, A displayed none, and the click foregrounded A and
selected its exact npm/node source among identical terminal names/directories.
The harness stages VSIXs and fixture code in its local temporary directory because
Electron correctly rejects an unapproved WSL UNC host. No UNC allowlist was changed.

The first native-center continuation attempt exposed a nullable UI Automation Name
in the test driver. A deterministic nullable-Name probe reproduced the exception;
the corrected probe and live read-only lookup passed. The rerun no longer raised that exception, but could not find the task-owned
Notification Center action. The actual Windows app-action assertions passed again.
A driver fix alone is not activation evidence.

Further read-only diagnostics confirmed an interactive, unlocked Windows session
and enabled native notifier. UI Automation root enumeration omitted hosted provider
subtrees; direct top-level subtree traversal fixes that observation. Bounded attempts
to open Notification Center did not expose its action. No notification preferences
were changed. The exact task toasts existed in WinRT history, but that does not
prove native clicks or foreground behavior.

The continuation review found three test-harness issues: native matching could
mistake the identical VS Code action for a shell action; the single-window test
assumed the old Windows archive layout; multiwindow cleanup omitted toast history.
The two latter issues were corrected with shared host discovery, Windows Electron
CLI invocation, local staged inputs and exact per-run toast cleanup. Host discovery
passed actual Windows archive lookup, ambiguous-build rejection and explicit
selection fixtures. All five supported-host scenarios passed again after the host
changes. The WinRT cleanup code removed two exact task notifications and verified
zero matching entries remained. The driver now requires a Windows CoreWindow owned by an exact protected
notification-host path with a valid Microsoft Windows signature before searching
for the title/action. The deterministic duplicate-Code regression passes; removing
the gate makes it fail. Both parent and independent reviewer ran the final driver
self-test. All three review findings are resolved; final code verdict: **ship**.

The final native-center diagnostic at 20:30 UTC used the shell-provider filter.
The genuine two-profile Windows app-action stage passed again. The native stage
failed because no task-owned shell action was accessible; it did not substitute
a VS Code alert or synthetic pipe callback. The runner's exact-message history
cleanup completed. Do not disturb remained on and unchanged. Banner acceptance
was not rerun in this diagnostic mode; native banner/history acceptance remains
required before release.

Final `npm run check` passed 95 tests, all eight negative import probes and
Markdown/link checks. Inspection of the 0.3.0 VSIXs confirmed both host minimums,
byte-identical embedded Router and both native Windows helpers. Architecture
planning validates; acceptance validation remains deliberately blocked by the
failed Windows native and full desktop checks. Code review acceptance does not
waive those checks. Version 0.3.0 is prepared locally; no commit, tag, push or
publication occurred during this task.

Cleanup confirmed zero task terminals and no processes from the isolated Windows
Code installation. Task profiles, the temporary Windows extraction and download
were removed. Exact task toast history entries were removed while unrelated
notifications were preserved. Sanitized final desktop evidence remains available
in the temporary verification logs; repository evidence contains no machine paths
or credentials. Existing editor sessions and notification settings were preserved.
