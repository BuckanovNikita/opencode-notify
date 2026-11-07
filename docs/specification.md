# OpenCode notification requirements

## Problem and scope

People running an agent in a local or remote terminal need to notice completion,
questions, permission requests and errors without watching the terminal, then return
to the correct session. Multiple windows and similarly named processes must not
send them to an unrelated console.

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
- One definition with stable ID `opencode-notify` adapts v1 server and v2 setup
  lifecycles. Unload aborts subscriptions and handles asynchronous failures.

## Delivery and source activation

Default local mode `both` delivers one native notification from the originating
presenter and an app notification in the focused enabled, trusted window. Recheck
focus at receipt, never relay twice, and use only native delivery when no window is
focused. Preserve explicit `auto`, `app` and `system` behavior described in README.
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
within the documented retention limits. Native action and sound support follow the
platform limitations in README; helper success does not prove visible delivery.

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

Protocol owns pure validation. Plugin owns lifecycle/configuration and bounded
transport; Router owns workspace HTTP, filesystem installation, process inspection
and terminal bindings; presenter owns local notifications, peers and companion
installation. Adapters share only protocol; no runtime OpenCode SDK dependency is
allowed. Production import contracts remain enforced by the architecture checker.

Use authenticated loopback HTTP with independent per-window credentials, never a
public listener or global last-window credential file. Validate payloads before
crossing the bridge and again before display, enforce bounded requests and preserve
protocol v1 compatibility including payloads without source identity. Treat text as
data. No durable delivery queue or delivery after window/connection closure is
promised. Packaging embeds exact checksummed Router bytes and required native helpers.

## Delivery limits

A desktop helper reporting success does not establish visible delivery. Remote host
placement and Windows foreground/Notification Center behavior depend on the host.
Release and platform operation belong to the [development guide](development.md).
