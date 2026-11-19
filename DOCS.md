# OpenCode Notify reference

## Scope

Users running an agent in a local or remote terminal must notice completion, questions, permission requests and
errors without watching the terminal, then return to the correct session — never to an unrelated console when
several windows or similarly named processes exist. Scripts and long builds also need a simple desktop alert from
their workspace.

Supported: OpenCode v1 (>=1.18.29) and v2; desktop VS Code >=1.90.0 with local, SSH, WSL, Dev Containers and Remote
Tunnels workspaces. Out of scope: browser VS Code, plain SSH outside VS Code, installing OpenCode, external
terminals, tmux/attach source targeting, OS notification prerequisites.

## Architecture and data flow

```text
OpenCode (workspace host)                 VS Code workspace host            VS Code UI host (desktop)
plugin --HTTP loopback /notify,/sources--> Router --vscode command JSON--> presenter --> app alert / native toast
opencode-notify CLI ------------------->  Router                           presenter <--peers /relay--> other windows
                                                                             native action --> /activate --> terminal
```

- **protocol**: message types and validation shared by all adapters; no imports.
- **plugin**: subscribes to OpenCode events, applies its config, formats and posts notifications. One default export
  with ID `opencode-notify`, v1 `server()` and v2 `setup()`. Older v1 loaders are unsupported.
- **Router** (`extensionKind: workspace`): loopback HTTP server with per-window bearer credential, injects
  `OPENCODE_NOTIFY_URL`, `OPENCODE_NOTIFY_TOKEN`, `OPENCODE_NOTIFY_TERMINAL_ID` into new terminals, binds sources to
  terminals, installs the plugin, ships the CLI. Commands pass plain validated JSON between hosts.
- **presenter** (`extensionKind: ui`): display policy, VS Code alerts, native notifications (node-notifier helper
  bundle; SnoreToast on Windows), peer relay, activation, and installation of its embedded Router VSIX.
- Packaging: `npm run package` installs presenter production deps (locked), builds Router first, embeds that exact
  VSIX in presenter, writes `SHA256SUMS`; Router carries the standalone plugin and CLI, presenter the native helpers.

## Domain terms

- **Source**: a registered OpenCode instance (instance ID, PID, parent PID, estimated start epoch ms, directory,
  optional extension-created terminal ID, session title).
- **Binding**: source-to-terminal-object association, kept after source exit until the terminal closes.
- **Origin**: the presenter window whose Router received the event; it alone sends native notifications and owns
  activation targets.
- **Peer**: another enabled, trusted window of the same user-data installation reachable over authenticated loopback.
- **Activation target**: opaque handle behind an **Open OpenCode** action, resolved by the origin.
- **Display mode**: `both`, `auto`, `app`, `system` (plus diagnostic native mode `center`).

## Behavior contract

Events:

- Completion fires only after successful final assistant evidence and idle for the active run. Process exit,
  cancellation or abort is never a completion; a human reply alone never emits completion. Busy-period state and
  event-ID deduplication prevent repeated outcomes.
- Both v1 permission event schemas are supported; `question.asked` is used directly (no duplicate before-tool
  alert). V2 subscribes to public execution outcomes, permissions and question forms, and at unload aborts its
  subscription and active transport.
- Completion, question, permission, error are on by default; child-session completions are off, child questions and
  permissions stay deliverable. The duration threshold (default 0) never suppresses human-input requests.
- Invalid plugin configuration disables the plugin with a diagnostic. Configuration and transport failures never
  interrupt the agent run; unload handles asynchronous failures.
- Questions and permissions use warning severity; errors use error severity.

Delivery:

- `both` (default): one native notification from the origin plus an app alert in the focused enabled trusted window;
  focus is rechecked at receipt, never relayed twice, native only when no window is focused.
- `auto`: app alert if the origin window is focused, else native. `app`: origin window. `system`: native.
- A plugin or CLI display hint applies only under local `auto`. Native failure permits app fallback without
  duplicating an accepted alert.
- Peers relay across profiles of one user-data installation (named profiles share it); separate installations stay
  isolated. Receivers recheck focus and event settings and never rebroadcast. System delivery does not wait for peer
  discovery.

Activation:

- **Open OpenCode** returns to the origin window and exact integrated terminal. Verify process identity before
  ancestry matching. Never pick by terminal/process name, directory alone or the sole remaining terminal; ambiguous
  selection offers related candidates (project, session, directory, position); otherwise report unavailability.
- Targets outlive banners within bounded storage but not source-window closure. Windows Notification Center actions
  work for the latest 512 native targets, at most 24 h; origin targets bound 4096 / 24 h. Dismiss or timeout does not
  consume a target.
- Focus: prefer a window focus command with a bounded wait for the focus-state update; otherwise route through an
  origin-generated `asExternalUri` (first URI activation may need user consent).
- App actions work on all platforms; Linux native activation is unsupported; native sound depends on the desktop.

Script notifications:

- `opencode-notify [-d auto|app|system] [title] message` in fresh VS Code terminals; default title `OpenCode Notify`;
  current directory gives project context. Uses the window's inherited URL and credential and the same policy and
  bridge. Invalid arguments, missing credentials or failed delivery exit nonzero with a diagnostic. No process
  identity: activation reports an unavailable source.

Setup:

- Installing the presenter VSIX in a trusted workspace suffices: it installs its exact bundled Router via
  `workbench.extensions.installExtension` on the workspace host — no Marketplace, remote GitHub or remote shell.
- Inspect placement and inventory including disabled and pending versions; install missing or older Router, preserve
  newer. Remote inventory uses internal `_remoteCLI.manageExtensions` (read-only list); unavailable or malformed
  inventory blocks install and leaves manual VSIX recovery. Locally, read Router manifests next to presenter,
  including other profiles and obsolete copies (an obsolete newer copy may need manual recovery).
- Deduplicate concurrent setup, log failures, offer reload, never reload automatically. Untrusted workspaces never
  trigger setup. An active older Router may need a reload after update.
- Plugin install is create-only and idempotent: identical content accepted, differing files preserved, concurrent
  first installs keep the winner without failing activation; explicit update needs replacement confirmation. Other
  plugins and OpenCode config are preserved. Users restart OpenCode after updates.

Security:

- Loopback only, independent per-window credentials, no public listener, no global last-window credential file.
- Validate payloads before crossing the bridge and again before display; reject bodies over 64 KiB; text is data.
- Peer authentication, input size, connection limits, deadlines and retention are bounded and tested.
- No durable queue; no delivery after window or connection closure. Secrets never appear in diagnostics or packages.
- Current package boundaries describe the implementation; a replacement may reorganize them while preserving public
  behavior, installation, protocol and compatibility contracts.

## Interfaces

Plugin config: `$XDG_CONFIG_HOME/opencode/opencode-notify.json` (fallback `~/.config/opencode/`), separate from
OpenCode config. Keys: `enabled`, `showSessionTitle`, `showProjectName` (bool, default true), `minDurationMs`
(>=0, default 0), `display` (`auto` default | `app` | `system` | `both`),
`events.{complete,question,permission,error,subagent_complete}` (bool; `subagent_complete` default false). Unknown
event keys are errors.

VS Code settings: `opencodeNotify.enabled`, `.systemNotifications` (`both`|`auto`|`app`|`system`), `.sound`,
`.events.{complete,question,permission,error,subagent_complete}` (window scope); `.autoInstallRouter` (application);
`.autoInstallPlugin` (machine, Router).

Commands: presenter `opencodeNotify.showLog`, `opencodeNotify.setup`; Router `opencodeNotify.installPlugin`,
`opencodeNotify.start`, `opencodeNotify.test`.

HTTP (loopback, bearer): Router `/notify`, `/sources`, `/status`; presenter peers `/relay`, `/activate`, `/status`.
Protocol v1 still accepts old messages; optional `instanceId` and `sessionTitle` identify registered sessions. The
plugin posts `/sources` before returning hooks with a 2 s deadline; failure is nonfatal (older Routers).

Source identity: Linux process start ticks; Windows bounded CIM snapshot; other POSIX `ps` start data. Initial start
estimates tolerate clock precision; observed terminal identities must match exactly.

Windows native: bundled SnoreToast run directly with an extension-owned named pipe. Extension disposal closes
listeners, helpers and targets.

Version bounds: Node >=22 (dev), bundles target Node 20; VS Code >=1.90.0; OpenCode pinned in native tests
`opencode-ai@1.18.29`, `opencode-ai@1.19.5`, `@opencode/cli@2.2.5`; `node-notifier` 10.0.1 with `uuid` 11.1.1 override
(CommonJS `v4` API compatible, bounds-check fixes).

Delivery limits: OS focus, permissions and Do Not Disturb can suppress alerts. Linux needs a notification service
and `notify-send`; the bundled macOS helper needs Rosetta on Apple Silicon.

## Operations and acceptance

Automated harnesses:

- `test:extension` downloads the minimum VS Code from the presenter manifest (or `VSCODE_TEST_VERSION`), installs
  only the presenter VSIX into temporary profiles, checks Router install, plugin creation in an isolated XDG dir,
  Router/plugin opt-outs, preservation of an existing plugin, activation, commands, auth, validation and terminal env
  injection. It never touches the user's profile or OpenCode config.
- `test:native`: real OpenCode servers with isolated XDG dirs and a local OpenAI-compatible fixture provider; synthetic
  model reply, real plugin and process, no paid model or credentials.
- `test:multiwindow`: isolated profiles and CDP endpoints, inspects real app notifications and actions;
  `OPENCODE_NOTIFY_SMOKE_PROFILES=1` for named profiles. Single-window smoke uses real npm children with identical
  names/directories. Neither replaces real Windows acceptance.

Manual platform acceptance (record outcomes in the issue, not here):

1. Install only presenter locally; open a trusted remote host; Router appears there, also when present locally.
2. Plugin appears in the host's XDG config; start each OpenCode major in a fresh terminal; check opt-outs and
   manual recovery commands.
3. Completion, question, permission, error; cancel a run → no completion; enable child completions, repeat.
4. OS mode away from VS Code, app mode in it; sound.
5. Two OpenCode terminals from the start command; verify jump-back target.
6. `both`: work in window B, trigger from A → one app alert in B, one native toast; both **Open OpenCode** actions
   foreground A and its exact terminal, also from Notification Center after the banner, with two npm `node`
   terminals in one directory.
7. Repeat across named profiles, no focused window, disabled settings, source exit, closed terminals, presenter
   reload (refresh terminals after reload).
8. Windows: `npm run test:windows` from Windows Node. `-- --automate` uses task-scoped UI Automation;
   `-- --automate --center-only` diagnoses Notification Center only and does not pass banner acceptance. Do Not
   Disturb is reported, not changed.
9. Windows: `OPENCODE_NOTIFY_SMOKE_NATIVE=both npm run test:multiwindow` checks banner and delayed Notification
   Center actions in two windows. `VSCODE_TEST_EXECUTABLE` selects an installation, `VSCODE_TEST_APP_ROOT`
   disambiguates pending builds; inputs are staged locally to avoid UNC exceptions. Native mode `center` is diagnostic.

Recovery: if Router inventory is unavailable, install the bundled Router VSIX manually; replace a differing plugin
with **Install or Update OpenCode Plugin**, then restart OpenCode for automatic targeting.

## History

Full pre-compression documents are in git at commit `714a5fa`: `git show 714a5fa:<path>`. Removed paths:
`CLAUDE.md`, `.pre-commit-config.yaml`, `docs/specification.md`, `docs/development.md`,
`docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`.
