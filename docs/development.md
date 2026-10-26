# Development and release

## Runtime and modules

Use Node >=22 and npm with the committed lockfiles. Extension bundles target
Node 20 for VS Code >=1.93. OpenCode runs the standalone ESM plugin in its own v1
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

The router owns loopback HTTP and terminal credentials. The presenter owns local
UI and desktop effects. Commands pass plain validated JSON between hosts. HTTP
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
```

On a desktop with a usable display, omit `xvfb-run`. The extension test downloads
an isolated VS Code 1.93.1 and installs the actual VSIXs into a temporary profile.
It checks activation, commands, request authentication, validation, prompt
acceptance and terminal environment injection. It never uses the user's profile.
Use `VSCODE_TEST_VERSION` to explicitly test another VS Code version.

`npm run test:native` downloads/runs an OpenCode v1.2.0 server through npm exec with isolated
XDG directories and a local OpenAI-compatible fixture provider. It exercises real
OpenCode completion events and the bundled plugin, without a paid model or user
credentials. The model reply is synthetic; the plugin and OpenCode process are real.
The fixture uses a persistent server to match long-lived TUI sessions. Standalone
`opencode run` can terminate before asynchronous plugin delivery on a slow machine.

`npm run package` performs a locked production dependency install in the presenter,
builds both VSIXs and writes SHA256SUMS. It includes native helper executables in
the presenter and the standalone plugin plus CLI in the router.

The desktop adapter pins node-notifier 10 because version 11 requires newer Node
than the minimum VS Code host. Its uuid dependency is overridden to 11.1.1, whose
CommonJS `v4` API remains compatible and contains the bounds-check fixes.
Do not replace bundled helper files without updating their licenses and tests.
Linux uses an explicit `execFile` argv boundary rather than a shell command.

## Manual platform acceptance

Automatic local extension-host tests do not prove actual SSH/WSL placement or
Windows/macOS/Linux visual notification behavior. Record those separately:

1. Install presenter locally and router on the workspace host.
2. Install the plugin by command and start OpenCode v1 in a fresh terminal.
3. Verify completion, question, permission and error; cancel a run and confirm no
   completion. Enable child completions and repeat with a child session.
4. Switch away from VS Code for OS mode, return for app mode, and check sound.
5. Launch two OpenCode terminals from the command and verify the jump-back target.
6. Open another remote VS Code window and confirm notifications stay with their
   originating window. Reload one window and refresh only its terminals.

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

Release assets are also available locally in `artifacts/`. Do not commit generated
VSIXs, dependencies, test profiles, credentials or machine-specific configuration.
