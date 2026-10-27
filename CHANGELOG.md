# Changelog

## 0.3.0

- Require VS Code 1.143.1 or newer; discontinue the earlier 1.93 support range.
- Default to a focused-window VS Code alert plus one native toast, with authenticated local relay across profiles.
- Route **Open OpenCode** actions back to the originating window and registered integrated terminal.
- Register manually started OpenCode instances with bounded, nonfatal startup transport and process identity checks.
- Retain completed source bindings until terminal closure; avoid process-name and directory guesses.
- Keep Windows callback targets after banner timeout using a persistent named pipe and bundled SnoreToast.
- Add source lifecycle, peer authentication, late-click and real npm/extension-host acceptance harnesses.

Upgrade the preserved OpenCode plugin with the explicit update command and restart
OpenCode for automatic terminal targeting. Windows VS Code alert activation is
verified; native banner and Notification Center click activation still lack real
desktop acceptance.

## 0.2.0

- Install the local VSIX once: it carries and installs the workspace Router through VS Code.
- Automatically provision the OpenCode v1 plugin when absent in trusted workspaces.
- Preserve existing plugin contents and newer Router versions; add setup opt-outs and retry command.
- Handle concurrent first plugin installations without overwriting competing files.
- Verify automatic setup from a presenter-only install with isolated profiles and config directories.

## 0.1.0

- Initial OpenCode v1 plugin with completion, question, permission and error alerts.
- Workspace router and local VS Code/OS notification presenter for remote sessions.
- Explicit plugin installer, session-aware terminal launch, CLI and diagnostics.
- Configurable delivery, sound, events, duration threshold and child completions.
- Authenticated loopback protocol, independent window credentials and VSIX releases.
