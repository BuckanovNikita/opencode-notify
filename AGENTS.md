# OpenCode Notify

This repository implements an OpenCode v1/v2 notification plugin and VS Code extensions.
Use Node >=22 and npm. Run `npm run check` before committing and `npm run package`
before release. See `docs/development.md` for verification and release instructions.

Production boundaries are protocol, plugin, router and presenter. Protocol is pure;
effects belong to their owning adapter. `npm run check:architecture` enforces imports.
Keep runtime SDK dependencies out of the self-contained OpenCode plugin.

README.md is Russian; other documentation is English. Preserve unrelated changes.
Release with Git tags only; retain VSIX artifacts locally and in CI. Do not create
GitHub Releases. npm and Marketplace publication require separate authorization.
