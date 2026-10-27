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

The release commit, annotated tag, workflow outcome and downloaded asset hashes
will be recorded after remote publication is verified.
