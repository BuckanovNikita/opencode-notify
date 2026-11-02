# Compatibility implementation checklist

The supplied user plan is the specification; this file records execution.

1. Record inspected architecture and validate planning contracts.
2. Add failing dual-entrypoint and v2 lifecycle regression tests, then implement
   adapters sharing notification configuration, formatting and transport.
3. Lower VS Code manifests/types to 1.90 and verify API/setup compatibility.
4. Parameterize pinned OpenCode and VS Code smoke tests; integrate and package.
5. Update Russian READMEs, English development docs, changelog and dated evidence.
6. Run required checks; obtain fresh independent final review; reconcile acceptance.
7. Commit task-owned changes, annotate v0.4.0 and push commit/tag after acceptance.

Steps 2 and 3 depend on step 1; step 4 follows both; release follows acceptance.
Read-only API investigations run independently. Parent owns integration and checks.

## Progress

- Initial inspection: clean tree at d7bdc92; existing executable import contracts
  include negative probes. No runtime SDK dependency is needed.
- Design and architecture recorded before implementation.
- Implementation integrated: shared sender; separate v1/v2 lifecycle handling;
  exact v2 session metadata and permission reply schemas verified with real runtime.
- Parent verification: check (107 tests), audit, package, all pinned OpenCode
  smokes, both installed-host matrices and both shared/named-profile multiwindow
  cases pass. Artifact content and checksums inspected.
- Original 1.90 multiwindow failure isolated to native/truncated consent handling;
  custom-dialog fixture correction preserves production behavior and strict final
  origin-window/terminal assertions.
- Fresh independent review requested after integration and verification.
- Fresh independent review: ready to merge, no findings; complete diff reconciled
  with the architecture record and dated evidence. Manual remote/native acceptance
  and future upstream versions retain the explicit evidence limits.
- Implementation and local acceptance complete; authorized commit/tag publication
  follows acceptance validation. No GitHub Release or package publication.
