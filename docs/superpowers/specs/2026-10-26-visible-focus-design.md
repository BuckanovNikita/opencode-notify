# Visible notifications and exact console focus

## Accepted behavior

The default local mode is `both`: one native notification from the originating
presenter and an app alert in the currently focused enabled, trusted window.
Explicit `auto`, `app` and `system` settings remain supported. Recheck focus at
receipt; do not relay again. With no focused window, use native delivery only.
Native failure permits an app fallback, without duplicating an accepted alert.
Warnings identify questions and permissions; errors use error severity. Actions
say **Open OpenCode** and return to the originating window and terminal.

## Architecture

[Architecture record](../plans/visible-focus/architecture.json) governs the four
existing production boundaries. Protocol owns pure validation. Plugin owns bounded
startup registration and notifications. Router owns workspace process inspection,
source-to-terminal bindings and terminal lifecycle. Presenter owns authenticated
local peer discovery, UI/native delivery and activation. Adapters share only
protocol. Runtime OpenCode SDK dependencies remain forbidden.

Source registration carries version, random instance ID, PID, parent PID, process
start epoch milliseconds, directory and optional extension-created terminal ID.
Notifications add optional instanceId and sessionTitle while accepting old payloads.
The router verifies process identity before ancestry matching. Bind to terminal
objects, keep completed bindings until terminal closure, and never guess by name,
directory alone or the sole remaining terminal. Ambiguous candidates must be
relevant and include project/session/directory/position details.

Peer discovery uses private storage shared across profiles within one user-data
installation. Every peer owns a random loopback port and bearer credential. Relay
contracts carry an origin peer ID and opaque activation target; activation never
executes caller-supplied commands or paths. Only the origin owns native toasts.
Bounded target registries survive banner timeouts, but not source-window closure.
Windows uses the existing bundled SnoreToast helper with a presenter-owned named
pipe and buffered UTF-16 callback parsing. First URI activation can require consent.

## Limits and acceptance

External terminals and tmux/attach are excluded. Separate user-data installations
are isolated. Existing plugin replacement safeguards remain; automatic targeting
requires updating the plugin and restarting OpenCode in fresh terminals.
Real Windows foreground, action and Notification Center checks are required and
must remain explicit acceptance gaps if the desktop cannot be exercised.
