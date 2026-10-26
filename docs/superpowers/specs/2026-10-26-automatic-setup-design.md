# Automatic setup in desktop VS Code

## Outcome and scope

Install the local OpenCode Notify VSIX once. On opening a trusted local or remote
workspace, it installs its bundled workspace Router through VS Code. The Router
copies the self-contained OpenCode v1 plugin into the host's XDG config directory
when absent. New terminals inherit the existing per-window connection and CLI.
The user confirmed desktop VS Code remotes: SSH, WSL, Dev Containers and tunnels.
Plain SSH without VS Code, browser clients, OpenCode installation and desktop OS
notification prerequisites remain outside scope.

## Approach

Bundle the exact Router VSIX inside the local presenter VSIX. Use the documented
`workbench.extensions.installExtension` command with a resource URI; VS Code owns
transfer and extension-host placement. No remote shell command, downloads from
private GitHub, or Marketplace account is required. Publishing a Marketplace
dependency could also automate installation, but exceeds the existing publication
scope. Automating only the plugin would leave a manual step on every new host.

The presenter checks a private cross-host Router status command and installed
inventory, installs a missing or older Router and preserves observed newer copies,
including disabled versions and pending reloads. Installation errors are logged
with a manual recovery path. Existing active versions may require a window reload;
no automatic reload interrupts terminals. Repeated setup calls share one in-flight
operation. User settings can disable automatic Router or plugin installation.

Remote inventory uses VS Code's internal CLI list command with strict output
validation; an unavailable command prevents automatic installation. Local packaged
installs conservatively inspect adjacent Router manifests. Other-profile/obsolete
newer copies may require manual recovery. This compatibility fallback avoids
blind replacement; it cannot make inspection and installation atomic against
simultaneous external updates. Status uses actual `extensionKind` host identity.

Automatic plugin installation is create-only and idempotent. Identical contents
are accepted; differing existing contents, including managed files with edits, are
preserved. The existing explicit update command retains its replacement prompt.
Concurrent first installs must not overwrite a competing file or fail activation.
No plugin configuration or other plugin is changed. Restart OpenCode after setup.

## Architecture and acceptance

Keep protocol pure and all effects in their current adapters. Presenter owns VS
Code extension installation; Router owns plugin filesystem writes. Add only the
status command to their shared protocol; no adapter imports another adapter.
Packaging builds Router first and embeds the exact checksummed bytes in presenter.

Tests cover setup decisions and errors, concurrent installation and preservation,
and real installation starting with only the presenter VSIX in an isolated VS Code
profile and isolated XDG directory. Existing runtime, architecture and documentation
checks remain required. Actual remote-host placement and OS popup visibility are
reported separately from local extension-host evidence. Release uses synchronized
0.2.0 manifests, the existing authorized VSIX workflow and independent final review.
