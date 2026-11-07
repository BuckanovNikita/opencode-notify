# OpenCode notification requirements

## Problem and scope

People running an agent in a local or remote terminal need to notice completion,
questions, permission requests and errors without watching the terminal, then return
to the correct session. Multiple windows and similarly named processes must not
send them to an unrelated console. Scripts and long-running builds also need a
simple way to send a desktop alert from their originating workspace.

Provide a self-contained OpenCode v1/v2 plugin and desktop VS Code bridge for local,
SSH, WSL, Dev Containers and Remote Tunnels workspaces. Browser VS Code, plain SSH
outside VS Code, installation of OpenCode itself, external terminals and tmux/attach
source targeting are outside scope. Supported runtime baselines and build versions
belong to package configuration and the [development guide](development.md).

## Events and configuration

- Successful response/run completion is distinct from process exit or cancellation.
  Aborts must not become successful completions. Busy-period state and event
  deduplication must prevent repeated terminal outcomes.
- Completion, question, permission and error notifications are enabled by default.
  Child-session completions are disabled by default; child questions and permissions
  remain deliverable. The completion duration threshold must not suppress human-input
  requests. Its default is zero.
- Users can control enabled events, project/session labels, duration, display and
  sound. Plugin configuration honors XDG_CONFIG_HOME and remains separate from
  OpenCode configuration. Invalid configuration disables the plugin with a diagnostic;
  configuration and transport failures must never interrupt the agent run.
- Preserve plugin ID `opencode-notify` and both v1 server and v2 setup lifecycles.
  Unload stops subscriptions and handles asynchronous failures.

## Delivery and source activation

Default local mode `both` delivers one native notification from the originating
presenter and an app notification in the focused enabled, trusted window. Recheck
focus at receipt, never relay twice, and use only native delivery when no window is
focused. `auto` uses app delivery when the originating window is focused and native
delivery otherwise; `app` uses that originating window, and `system` uses native
delivery. A plugin or CLI display hint applies only under local `auto` mode.
Native failure permits an app fallback without duplicating an accepted alert.
Questions and permissions use warning severity; errors use error severity.

The **Open OpenCode** action returns to the originating window and exact integrated
terminal. Registration identifies the source instance, PID, parent PID, process
start time, directory and optional launched-terminal ID. Verify process identity
before ancestry matching. Bind terminal objects and retain a completed process's
binding until terminal closure. Never guess from terminal/process names, directory
alone or the sole remaining terminal. Ambiguous selection offers only related
candidates with project, session, directory and position; unavailable sources report
unavailability. Activation never executes caller-supplied commands or paths.

Private authenticated loopback peers may relay across profiles within one user-data
installation; separate user-data installations remain isolated. Only the origin
owns native notifications. Activation targets outlive banners within bounded storage,
but not source-window closure. Windows Notification Center actions remain useful
after banner dismissal for the latest 512 native targets, for at most 24 hours.
App actions work on all supported platforms; Linux native activation is unsupported
and native sound depends on the desktop. Helper success does not prove visibility.

## Script notifications

Provide `opencode-notify [-d auto|app|system] [title] message` in fresh VS Code
terminals. Scripts can send a completion alert without an OpenCode session; omitted
titles use `OpenCode Notify`, and the current directory supplies project context.
The command uses that window's inherited URL and credential, validates its input,
and returns a nonzero exit with a diagnostic for invalid arguments, missing
credentials or failed delivery. It uses the same display policy and authenticated
bridge as plugin notifications. These alerts have no registered process identity;
activation must report an unavailable source rather than guess a terminal.

## Setup and recovery

Installing the local presenter VSIX in a trusted workspace must be sufficient to
install its exact bundled Router through VS Code, on the workspace host. Setup must
not require Marketplace publication, remote GitHub access or remote shell commands.
Inspect actual host placement and installed inventory, including disabled/pending
versions. Install missing or older Router copies; preserve observed newer copies.
If inspection is unavailable, fail conservatively with a manual recovery path.
Deduplicate concurrent setup, log failures, offer reload when required and never
reload automatically. Independent settings disable Router and plugin auto-install.
Untrusted workspaces must not trigger setup.

Plugin installation is create-only and idempotent: identical content is accepted,
any differing existing file is preserved, and competing first installations cannot
overwrite each other or fail activation. Explicit updates require replacement
confirmation. Preserve other plugins and OpenCode configuration. New terminals
inherit per-window credentials and the CLI; users restart OpenCode after updates.
Setup does not install OS notification prerequisites.

## Boundaries and security

Keep workspace-side access separate from desktop-side notification and activation.
The plugin must remain self-contained without a runtime OpenCode SDK dependency.
Current package boundaries and architecture checks describe the existing
implementation; replacements may reorganize it while preserving public behavior,
installation, protocol and compatibility contracts.

Use authenticated loopback HTTP with independent per-window credentials, never a
public listener or global last-window credential file. Validate payloads before
crossing the bridge and again before display, reject requests over 64 KiB and preserve
protocol v1 compatibility including payloads without source identity. Treat text as
data. No durable delivery queue or delivery after window/connection closure is
promised. Packaging embeds exact checksummed Router bytes and required native helpers.

## Delivery limits

A desktop helper reporting success does not establish visible delivery: OS focus,
permissions and Do Not Disturb can suppress alerts or activation. Linux requires a
desktop notification service and `notify-send`; the bundled macOS helper requires
Rosetta on Apple Silicon. The [development guide](development.md) owns current
packaging and platform procedures; the behavior above applies across implementations.
