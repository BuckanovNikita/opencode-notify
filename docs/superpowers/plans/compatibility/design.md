# OpenCode and VS Code compatibility

Support OpenCode v1.18.29+ and v2 through one self-contained default definition
with stable ID `opencode-notify`, v1 `server` and v2 `setup`. Preserve protocol v1,
configuration, source authentication, terminal identity and create-only installation.
Support VS Code 1.90+ with Node 20 extension bundles and Node 22 repository tooling.

## Architecture

See [architecture.json](architecture.json). Plugin owns lifecycle adaptation,
configuration, source registration and transport. Router owns workspace HTTP,
terminal binding and installation. Presenter owns local UI and companion setup.
Protocol remains pure. Adapters share only protocol, with no runtime SDK imports.
A v2 lifecycle adapter maps public execution and human-input events into the shared
notification sender; busy-period state and event deduplication prevent repeated terminal outcomes.
Subscriptions are aborted at unload, with asynchronous failures handled at boundaries.

## Acceptance

Exercise pinned real OpenCode 1.18.29, 1.19.5 and 2.2.5 and installed VSIXs on
VS Code 1.90.0 and 1.143.1. Run check, audit, package and import negative probes.
Inspect packaged plugin, embedded Router and helpers. Independent final review
covers runtime, compatibility, boundaries and executed evidence. Real remote host
placement and visual desktop behavior require separate dated results.

Release 0.4.0 with an annotated Git tag and commit/tag push only. Retain local/CI
VSIX artifacts; do not create GitHub Releases or publish packages.
