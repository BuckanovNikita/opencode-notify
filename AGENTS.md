# OpenCode Notify

This repository implements an OpenCode v1 notification plugin and VS Code extensions.
Use Node >=22 and npm. Run `npm run check` before committing and `npm run package`
before release. See `docs/development.md` for verification and release instructions.

Production boundaries are protocol, plugin, router and presenter. Protocol is pure;
effects belong to their owning adapter. `npm run check:architecture` enforces imports.
Keep runtime SDK dependencies out of the self-contained OpenCode v1 plugin.

README.md is Russian; other documentation is English. Preserve unrelated changes.
Publish GitHub release assets only for the explicitly authorized VSIX workflow;
npm and Marketplace publication require separate authorization.
