# OpenCode Notify design

## Intent and scope

Build an independent OpenCode **v1-only** notification plugin and VS Code remote
notification bridge. A user working in SSH, WSL, a container, or a local workspace
receives completed-run, question, permission, and error alerts on the computer
running VS Code. The reference is the functionality described in the preceding
conversation, not a source-code fork or every feature of either upstream product.

Default delivery uses VS Code notifications while focused and OS notifications
while unfocused. Users can select app-only or system-only delivery, sound, enabled
events, minimum completion duration, and subagent completion suppression. Messages
identify the project and session. Questions and permissions must not be lost to a
completion-duration threshold. Aborts do not become successful completions.

## Approach

The selected implementation uses an authenticated loopback HTTP receiver on the
workspace host and VS Code's cross-extension command routing to a UI extension.
An OSC terminal transport would depend on shell integration and an attached
terminal. A standalone notification service would require separate host setup.
The command bridge fits the user's requested VS Code workflow and works with
ordinary remote terminals without a public listener or external service.

There are two VSIX packages: a workspace router and a local presenter. VS Code
places each extension in its declared extension host. One extension cannot be
active on both hosts simultaneously. The router bundles a self-contained plugin
and installs it through an explicit command. Nothing installs into the user's
OpenCode config during development or merely on extension activation.

## Contracts and ownership

- `packages/protocol`: effect-free validation, constants, notification types.
- `packages/plugin`: OpenCode v1 hooks, session event policy and bounded HTTP
  delivery. It never imports VS Code or OS notification implementations.
- `packages/router`: workspace loopback server, random credentials, terminal
  environment, plugin installation, optional terminal launch/focus and diagnostics.
- `packages/presenter`: local focus policy, VS Code messages and native desktop
  adapter. Native failures fall back to VS Code; no message is evaluated as code.
- `scripts`: build, packaging, architecture checks, documentation checks and
  release validation. Production modules cannot import build/test code.

Wire payload: `{ version: 1, id, event, sessionId, project, directory, title,
message, occurredAt, terminalId?, display? }`. Event is one of `complete`,
`question`, `permission`, `error`, `subagent_complete`. The optional display hint
is `auto`, `app`, or `system`. All fields are validated before crossing the command
bridge and again before presentation. The maximum request size is 64 KiB.

Environment keys: `OPENCODE_NOTIFY_URL`, `OPENCODE_NOTIFY_TOKEN`, and optional
`OPENCODE_NOTIFY_TERMINAL_ID`. Each VS Code window has independent credentials.
Background terminals must inherit that window's environment; a disconnected
window cannot deliver notifications. No global last-window-wins credential file.

Commands: `opencodeNotify.deliver` (local presenter), `opencodeNotify.focus`
(workspace router), `opencodeNotify.installPlugin`, `opencodeNotify.start`,
`opencodeNotify.test`, `opencodeNotify.showLog`. The presenter can use
`opencodeNotify.focus` for a jump-back action, identifying launched terminals by ID
and offering a picker when an ordinary terminal cannot be identified uniquely.

OpenCode plugin configuration is separate JSON at
`~/.config/opencode/opencode-notify.json` (honor XDG_CONFIG_HOME). Defaults enable
the four primary events and disable child completions. Configuration loading and
transport failures are reported through the OpenCode logging boundary and never
interrupt an agent run. No runtime SDK dependency or OpenCode v2 code is included.

## Verification and release

Use strict TypeScript, Node's test runner, esbuild and VSCE. Exercise event
sequences, real loopback HTTP, authentication, input validation, duplicate
suppression, focus routing and fallback. An executable dependency checker covers
all production modules and includes negative cases. Run an isolated real VS Code
extension-host smoke test and inspect both VSIX archives. OS appearance and actual
SSH/WSL host placement are recorded separately from mocked adapter evidence.

The README is Russian; developer/design documentation is English. The first
release is `v0.1.0`. The user's request explicitly authorizes GitHub release VSIX
assets for this repository; npm and Marketplace publication are out of scope.
Repository visibility is being clarified; private is the default if unanswered.
