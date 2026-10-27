# v0.3.0 release evidence — 2026-10-27

## Scope and publication decision

Release the reviewed visible-notification and exact-console implementation from
clean baseline `0c9babc`. Runtime and continuation code reviews have verdict **ship**;
see [review](review-2026-10-26-visible-focus.md) and
[implementation evidence](verification-2026-10-26-visible-focus.md). All changes
remain task-owned; release preparation changes documentation only. Module boundaries
and executable contracts remain those in the
[architecture record](superpowers/plans/visible-focus/architecture.json).

The user requested "make new release" after being told that native Windows
notification clicks were unverified and holding publication. This release follows
that instruction with the limitation stated in its notes. The failed native Windows
checks remain failed in the architecture record; full acceptance is not claimed.
No desktop notification settings are changed. VS Code 1.93 support was explicitly
removed; both extensions require VS Code 1.143.1 or newer.

## Release verification

- `npm run check`: passed, 95 tests, eight negative import probes, strict types
  and documentation checks.
- `npm audit --omit=dev`: passed, zero vulnerabilities.
- `npm run package`: passed, both v0.3.0 VSIXs and SHA256SUMS.
- VSIX inspection: matching versions and `^1.143.1` host ranges, byte-identical
  embedded Router, both Windows helpers, no source/test directories, valid hashes.
- `npm run test:native`: passed with real OpenCode v1.2.0.
- `xvfb-run -a npm run test:extension`: all five isolated scenarios passed on 1.143.1.
- `OPENCODE_NOTIFY_SMOKE_PROFILES=1 xvfb-run -a npm run test:multiwindow`: passed,
  two named profiles, one B alert, no A duplicate, actual action selected A's exact
  npm/node terminal and foregrounded its window.
- Architecture planning validation: passed. Full acceptance validation continues
  to reject the two failed Windows native/desktop checks; these results are preserved.
- Code review: reuse the completed independent runtime and continuation reviews;
  no runtime code changed during release preparation.

## Publication

Release commit: `56408a5f139da91dae3fd6c53503b069519fa55c`. Annotated tag
`v0.3.0` points to that commit; both main and the tag were pushed successfully.

[CI](https://github.com/BuckanovNikita/opencode-notify/actions/runs/40506965193) and
[Release VSIX](https://github.com/BuckanovNikita/opencode-notify/actions/runs/40506990008)
completed successfully for the tagged commit. The tag workflow published
[v0.3.0](https://github.com/BuckanovNikita/opencode-notify/releases/tag/v0.3.0)
at 12:52:17 UTC, with both VSIXs and SHA256SUMS. No manual publication fallback
was needed. The published notes include the native Windows acceptance limitation
and the plugin update/restart requirement.

All three release assets were downloaded. File sizes and GitHub-reported SHA-256
digests matched; both VSIXs matched the downloaded SHA256SUMS. ZIP inspection
confirmed v0.3.0 and the 1.143.1 host minimum in both manifests, byte-identical
embedded Router, bundled plugin, and both Windows helper executables.

| Published file | SHA-256 |
| --- | --- |
| `opencode-notify-0.3.0.vsix` | `901aa914aa3cf606c5c867ced82b1ea54514a02777474d668d42a929ce55c7e0` |
| `opencode-notify-router-0.3.0.vsix` | `66faca6cd7216c8aa49ce1549bb50a82c754b9cd0cfc49b31a79a0ee8c6dfda7` |
| `SHA256SUMS` | `78097466ca5f6da91a1747c2ac5546f23674adf9115891fa6a254d17e7b6fcda` |

Temporary verification downloads were removed after inspection. Native Windows
banner/history click acceptance remains outstanding; publication does not change
that recorded result.
