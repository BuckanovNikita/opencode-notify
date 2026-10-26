# Changelog

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
