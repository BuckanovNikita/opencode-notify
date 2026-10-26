# Initial release verification — 2026-10-26

## Scope

Initial independent repository: protocol, OpenCode v1 plugin, workspace router,
local presenter, build/package scripts, tests, documentation and GitHub workflows.
No existing sibling repository files or personal OpenCode/VS Code settings changed.
This record describes observed local verification; release publication is recorded
after the remote workflow completes.

## Executed checks

| Command/check | Result |
| --- | --- |
| `npm run check` | Passed: strict TypeScript, 32 tests, architecture contracts and Markdown/local links |
| `npm run check:architecture` | Passed: production graph plus four forbidden-edge negative probes |
| `npm audit --omit=dev` | Passed: no reported production vulnerabilities |
| `npm run package` | Passed: presenter and router VSIXs plus SHA256SUMS |
| `npm run test:native` | Passed: real persistent OpenCode v1.2.0 server completion through the bundled plugin and real authenticated HTTP |
| `xvfb-run -a npm run test:extension` | Passed: installed VSIXs in isolated VS Code 1.93.1 |
| VSIX archive inspection | Passed: local/workspace host manifests, plugin/CLI bundles, SnoreToast, terminal-notifier and uuid CommonJS files present |

The extension-host smoke activates both installed packages, checks commands, sends
an HTTP notification through the actual command bridge, rejects invalid payloads,
and confirms URL/token/PATH injection into a newly created terminal. Temporary
profiles, credentials, fixture providers and servers are disposed after tests.

Regression tests were observed failing before fixes for invalid display arrays,
the v1 SDK single-object timeout argument, and current-user-message matching under
event delivery clock skew. Cancellation-before-error, duplicate idle events,
pending requests, repeated turns, child sessions, offline delivery and native
fallback are covered. Linux native argument handling is tested using an executable
fixture; hostile strings remain literal arguments rather than shell commands.

Independent review identified four additional bugs, all reproduced with failing
regression tests before correction: queued user prompts inheriting stale success,
late assistant errors leaving successful evidence behind, terminal structured
output being mistaken for an unfinished tool call, and WindowsToaster swallowing
helper launch failures. The Windows test exercises the actual dependency parser
with an injected ENOENT. Compaction-summary suppression has its own regression.
The full suite, packaging and both real-process smoke checks passed after fixes.

## Evidence limits

- The native OpenCode process uses a synthetic local model response; no paid model
  or production credentials are needed.
- Real remote SSH/WSL extension-host placement was not exercised. The installed
  local-host smoke verifies APIs and artifacts; the two-host arrangement follows
  VS Code's documented command routing and declared extension kinds.
- Native Windows/macOS popup appearance and OS click callbacks were not exercised.
  Linux adapter argument safety was exercised; desktop popup visibility and sound
  depend on the user's notification service and settings.
- Full development-tool audit reports advisories in VSCE's Azure login dependencies
  and Markdown math rendering. Those dependencies are not shipped in either VSIX;
  publication uses GitHub CLI, not VSCE's Azure login. Production audit is clean.

## Source contracts inspected

- [OpenCode v1.2.0 session loop](https://github.com/anomalyco/opencode/blob/v1.2.0/packages/opencode/src/session/prompt.ts)
- [OpenCode v1.2.0 status events](https://github.com/anomalyco/opencode/blob/v1.2.0/packages/opencode/src/session/status.ts)
- [OpenCode v1.2.0 SDK methods](https://github.com/anomalyco/opencode/blob/v1.2.0/packages/sdk/js/src/gen/sdk.gen.ts)
- [OpenCode v1.0.119 plugin loader](https://github.com/anomalyco/opencode/blob/v1.0.119/packages/opencode/src/plugin/index.ts)
- [VS Code cross-host command routing](https://code.visualstudio.com/api/advanced-topics/remote-extensions#communicating-between-extensions-using-commands)

## Review and publication

The first independent review requested fixes; resolution is recorded in
[review evidence](review-2026-10-26.md). Fresh acceptance review returned **ship** after all
corrections.

Published [v0.1.0](https://github.com/BuckanovNikita/opencode-notify/releases/tag/v0.1.0)
in the private repository from annotated tag commit
`ed5e607940e7c399b57b5e3955c60e422242c9ad`.
[GitHub CI run 40328082570](https://github.com/BuckanovNikita/opencode-notify/actions/runs/40328082570)
passed typing, all tests, import/documentation checks, production audit, packaging,
native OpenCode smoke and installed-extension smoke on that exact commit.

The release-tag workflow did not start on the initial combined branch/tag push.
The parent therefore downloaded the successful CI run's `vsix` artifact, verified
its source commit and SHA256SUMS, and published those exact files with `gh release
create --verify-tag`. No tag was moved and no package was published to a registry.
The uploaded assets were downloaded again and matched the CI files byte for byte:

| Asset | SHA-256 |
| --- | --- |
| `opencode-notify-0.1.0.vsix` | `66f2447dde9f1b4e1fae97dc066de5261d8b2982e1bdbbe246fb1d9399f856dc` |
| `opencode-notify-router-0.1.0.vsix` | `07d6436e930e1ce293abb39db361624f6fe16a8811e58393fb1ee03342b6600a` |

The release also contains SHA256SUMS and is neither a draft nor a prerelease.
The following documentation-only commit records publication; runtime source and
package versions remain identical to the release tag.
