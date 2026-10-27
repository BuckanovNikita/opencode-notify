# Development and release

## Runtime and modules

Use Node >=22 and npm with the committed lockfiles. Extension bundles target
Node 20 for VS Code >=1.143.1. OpenCode runs the standalone ESM plugin in its own v1
runtime; neither OpenCode SDK is a runtime dependency.

Production modules live under `packages/{protocol,plugin,router,presenter}/src`.
Only protocol may be shared between adapters. Protocol cannot import Node, VS Code
or third-party packages. `scripts/check-architecture.mjs` checks static, type-only,
re-export, require and dynamic import edges, with negative probes. Add a declared
dependency only after updating the design and relevant executable boundary.

The plugin emits completion only after both successful final assistant evidence
and idle for the active run. It supports the two v1 permission event schemas and
uses `question.asked` directly, avoiding duplicate before-tool notifications.
The exported bundle must contain exactly one plugin function for old v1 loaders.

The router owns loopback HTTP, terminal credentials and plugin filesystem writes.
The presenter owns local UI, desktop effects and companion installation through
VS Code. Commands pass plain validated JSON between hosts. HTTP
acceptance means the local presenter accepted the event, not that an OS popup was
seen. Secrets never appear in diagnostics or package artifacts.

## Checks

```bash
npm ci --ignore-scripts
npm run check
npm audit --omit=dev
npm run package
npm run test:native
xvfb-run -a npm run test:extension
xvfb-run -a npm run test:multiwindow
VSCODE_TEST_VERSION="${NOTIFY_CURRENT_VSCODE:?set an explicit current VS Code version}" xvfb-run -a npm run test:extension
VSCODE_TEST_VERSION="${NOTIFY_CURRENT_VSCODE:?set an explicit current VS Code version}" xvfb-run -a npm run test:multiwindow
```

Set `NOTIFY_CURRENT_VSCODE` to an explicit version from the official VS Code
release notes. The multiwindow harness rejects the `stable` alias so a failed
network lookup cannot silently substitute a cached minimum version.
On a desktop with a usable display, omit `xvfb-run`. The extension test downloads
the minimum supported VS Code from the presenter manifest (currently 1.143.1) and installs only the presenter VSIX into temporary
profiles. The presenter must install its bundled Router, which must create the
plugin in an isolated XDG config directory. Separate profiles check Router opt-out,
plugin opt-out and preservation of a pre-existing plugin. It also checks activation,
commands, request authentication, validation, prompt acceptance and terminal
environment injection. It never uses the user's profile or OpenCode configuration.
Use `VSCODE_TEST_VERSION` to explicitly test another VS Code version.

`npm run test:native` downloads/runs an OpenCode v1.2.0 server through npm exec with isolated
XDG directories and a local OpenAI-compatible fixture provider. It exercises real
OpenCode completion events and the bundled plugin, without a paid model or user
credentials. The model reply is synthetic; the plugin and OpenCode process are real.
The fixture uses a persistent server to match long-lived TUI sessions. Standalone
`opencode run` can terminate before asynchronous plugin delivery on a slow machine.

`npm run package` performs a locked production dependency install in the presenter,
builds Router first, embeds that exact VSIX in presenter and writes SHA256SUMS.
It includes native helper executables in presenter and the standalone plugin plus
CLI in Router. The presenter uses `workbench.extensions.installExtension` with the
bundled VSIX URI; VS Code transfers it and selects the workspace extension host.
No Marketplace dependency or remote GitHub access is required. Private status
commands detect the current Router version and host; newer versions are preserved.
An active older Router may need a reload after update. Setup never reloads a window
without user action. User settings can disable Router or plugin auto-installation.
Automatic plugin writes are create-only: differing files need the explicit update
command and confirmation. Concurrent first installs preserve the winning file.

Active command availability is not installed inventory. Before installing, setup
checks disabled and pending versions as well. For remote hosts it uses VS Code's
internal `_remoteCLI.manageExtensions` read-only list command (validated on the supported host); unavailable or malformed inventory prevents installation
and leaves manual VSIX recovery. For local packaged installations it conservatively
reads Router manifests alongside presenter, including other profiles and obsolete
copies. An obsolete newer copy may require manual recovery. Extension host identity
comes from `extensionKind`; `env.remoteName` is window context on both hosts.
Inventory and VSIX installation are not an atomic transaction: simultaneous external
Router updates remain outside the version-preservation guarantee.

The desktop adapter retains the validated node-notifier 10 helper bundle. Its uuid dependency is overridden to 11.1.1, whose
CommonJS `v4` API remains compatible and contains the bounds-check fixes.
Do not replace bundled helper files without updating their licenses and tests.
Linux uses an explicit `execFile` argv boundary rather than a shell command.

## Source and presenter contracts

Protocol v1 still accepts old messages. New optional `instanceId` and
`sessionTitle` fields identify registered sessions. The plugin posts authenticated
`/sources` registration before returning hooks; a two-second transport deadline
and nonfatal failure handling keep notifications available on older Routers.
Source metadata includes PID, parent PID, estimated process start epoch milliseconds,
directory and optional extension-created terminal ID. Router checks the observed
identity before binding to a terminal object. Linux uses process start ticks;
Windows uses a bounded CIM snapshot; other POSIX hosts use `ps` start metadata.
Initial start estimates tolerate clock precision; observed terminal identities
must match exactly. Bindings survive source exit and expire when terminals close.
Uncertain identity never selects by name, directory, or remaining terminal count.

Presenter peers advertise private, random bearer credentials and loopback ports
under shared user-data storage. Named profiles resolve to that same directory;
other user-data installations remain isolated. Only enabled trusted windows
participate. The receiver rechecks focus and event settings and never rebroadcasts.
The origin sends native notifications, retains opaque activation targets, and
resolves relay actions. Peer request authentication, input size, connection limits,
deadlines and retention are independently tested. System delivery starts without
waiting for peer discovery. Explicit `auto`, `app` and `system` modes remain.

Windows uses the bundled SnoreToast executable directly with an extension-owned
named pipe. Callback framing follows the upstream UTF-16 connection EOF contract;
one read is not one message. Dismiss/timeout does not consume an activation target.
Windows targets are bounded to 512 and 24 hours; origin targets to 4096 and 24 hours.
Extension disposal closes listeners, helpers and targets. A window focus command
is preferred, with a bounded wait for its asynchronous focus-state update; otherwise an origin-generated `asExternalUri` routes to that window.
First URI activation can require user consent. Update the preserved plugin with
the explicit installation command and restart OpenCode for automatic targeting.

The single-window host smoke uses real npm child processes with identical names
and directories and checks exact terminal object selection and retained output.
The multiwindow harness owns isolated profiles and CDP endpoints; it inspects real
app notifications and actions. Neither substitutes for real Windows acceptance.

## Manual platform acceptance

Automatic local extension-host tests do not prove actual SSH/WSL placement or
Windows/macOS/Linux visual notification behavior. Record those separately:

1. Install only presenter locally. Open a new trusted remote host and verify Router
   appears on that host, including when Router also exists on the local host.
2. Verify the plugin appeared in that host's XDG config directory and start
   OpenCode v1 in a fresh terminal. Check the opt-outs and manual recovery commands.
3. Verify completion, question, permission and error; cancel a run and confirm no
   completion. Enable child completions and repeat with a child session.
4. Switch away from VS Code for OS mode, return for app mode, and check sound.
5. Launch two OpenCode terminals from the command and verify the jump-back target.
6. In default `both` mode, work in window B and trigger from A. Verify one app alert
   in B and one native toast. Both **Open OpenCode** actions must foreground A and
   select its exact originating terminal. Repeat from Notification Center after
   the banner disappears, with two npm-launched `node` terminals in one directory.
7. Repeat across named profiles, with no focused window, disabled settings, source
   exit, closed terminals and presenter reload. Refresh terminals after reload.
8. On Windows run `npm run test:windows` from Windows Node in this checkout. Record
   real callback/foreground outcomes separately from Linux socket tests. A headless
   run, submitted toast, or synthetic pipe callback does not establish visual acceptance.
   Use `-- --automate` for task-scoped UI Automation. `-- --automate --center-only`
   diagnoses Notification Center callbacks but does not pass banner acceptance.
   The harness reports Do not disturb without changing it.
9. On Windows, `OPENCODE_NOTIFY_SMOKE_NATIVE=both npm run test:multiwindow` checks
   real banner and delayed Notification Center actions against the exact source
   terminal in two windows. Use `OPENCODE_NOTIFY_SMOKE_PROFILES=1` for named profiles.
   Environment variable syntax depends on the shell. An explicit
   `VSCODE_TEST_EXECUTABLE` can select an isolated installation;
   `VSCODE_TEST_APP_ROOT` disambiguates installations containing pending builds.
   Inputs are staged in local temporary storage so Electron does not need UNC
   security exceptions. Native mode `center` is diagnostic only.

Store observed counts and platform outcomes in dated evidence, not this guide.

## Commit and release

Review the entire task diff, run applicable checks and obtain fresh independent
review for substantive changes. Stage task-owned paths and use Conventional Commits.
The architecture record and plan must match implementation and executed evidence.

This repository has explicit authorization to publish GitHub Releases containing
the VSIX deliverables requested by the user. This exception does not authorize
npm or Marketplace publication.

1. Update the root and both extension manifest versions together, their lockfiles,
   and CHANGELOG.md. Review user-facing version examples.
2. Run the checks above and inspect VSIX content, including native helpers.
3. Commit, create an annotated `vX.Y.Z` tag, and push the commit and tag.
4. The release workflow validates versions, runs checks and extension-host smoke,
   and uploads both VSIXs and SHA256SUMS to the tag's GitHub Release.
5. Verify the workflow conclusion and released assets; do not claim publication
   solely because the tag was pushed. A workflow failure is a delivery gap.

If a tag event does not start the release workflow, a manual publication may use
the `vsix` artifact from a successful CI run of that exact tagged commit. Verify
the tag/source SHA and artifact checksums, publish with `gh release create
--verify-tag`, then download and verify the uploaded files. Record the fallback
and evidence in dated verification; never move an existing release tag to retry.

Release assets are also available locally in `artifacts/`. Do not commit generated
VSIXs, dependencies, test profiles, credentials or machine-specific configuration.
