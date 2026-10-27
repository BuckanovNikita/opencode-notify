# Visible notifications implementation ledger

Source: the user-approved visible notifications and exact console focus plan.
Baseline: clean `0c9babc` on main; all baseline checks passed before implementation.

## Architecture and ownership

See [design](../specs/2026-10-26-visible-focus-design.md) and
[architecture record](visible-focus/architecture.json). Impact: `modules`.
The parent owns protocol, plugin, integration tests, checker, documentation and
release. After shared contracts land, a Router agent owns router source/tests and
a Presenter agent owns presenter source/tests and notification setting metadata.
These independent workstreams are explicitly authorized by the accepted plan.
No child delegates further. Parent integration and verification precede fresh
independent review. Work occurs in the clean requested checkout; preserve all
concurrent changes and stage task-owned files only.

## Tasks

- [x] Establish validated backward-compatible source, relay and activation contracts.
- [x] Register plugin instances without breaking completion or delivery on failure.
- [x] Implement Router bindings, process identity checks, lifecycle and exact focus.
- [x] Implement presenter peers, both mode, origin activation and Windows callbacks.
- [x] Integrate module imports and negative probes; extend isolated host/native tests.
- [x] Run check, package, OpenCode smoke, minimum/current extension-host tests and
  Windows smoke; record desktop acceptance without overstating automated evidence.
- [x] Update Russian README, English guide, changelog and dated evidence.
- [x] Reconcile architecture and obtain fresh independent review; record blocked acceptance.
- [ ] Pass real Windows desktop acceptance (the user removed the 1.93 gate).
- [ ] Follow authorized release only after all required acceptance gates pass.

## Verification ledger

The parent established shared protocol and plugin registration. Router source
tracking and presenter delivery ran independently; a third bounded agent owned
Windows native callbacks. All implementation agents requested gpt-6.1-sol/medium;
runtime model realization is not observable. No child delegated further.

Parent integration, check/package/native and isolated-host validation preceded fresh
review. The first reviewer failed due model capacity without a verdict. A fresh
GPT-6 Astra reviewer found two P2 issues: legacy focus-command compatibility and
concurrent registration duplicating a binding. Both were reproduced and fixed,
then independently rereviewed with a code verdict of ship. Real two-profile testing
then exposed delayed focus state; a bounded focus wait and regression test were
added before final desktop reruns.

See [dated verification](../../verification-2026-10-26-visible-focus.md) for actual
commands, desktop evidence and remaining gaps. Native desktop acceptance is a
release gate, not a claim inferred from packaging or headless tests. Version/tag
publication remains held while required acceptance is incomplete.

## Continuation: supported host range

The user explicitly removed the VS Code 1.93 support requirement. The supported
minimum becomes the already verified 1.143.1. Preserve the earlier 1.93 evidence
as history, but remove that version from the active acceptance gate. Both
extension manifests, the test harness, default host test version and current
documentation will agree. Keep the origin URI fallback for foreground failures
on supported hosts. Continue real Windows acceptance and release preparation.

- [x] Raise the host minimum to 1.143.1 and prepare matching 0.3.0 package metadata.
- [x] Diagnose actual Windows banner/history activation with scoped desktop tests;
  retain the failed native click checks as acceptance gaps.
- [x] Verify the revised support range, reconcile evidence and obtain scoped review.
- [ ] Release only after the remaining Windows acceptance gate passes.

Continuation review corrected three harness issues: verified shell-provider
selection prevents a duplicate VS Code alert from passing native acceptance;
shared host discovery supports versioned Windows archives; exact-message cleanup
removes only task-owned toast history. Final scoped code review is ship. The
Windows app action passed on two named profiles with exact console selection;
native shell clicks remain inaccessible and block release. No global notification
preferences were changed; the request to temporarily disable Do not disturb
remains unanswered. See dated evidence for the final failed desktop diagnostic.

## Publication instruction — 2026-10-27

After the outstanding native Windows click verification was reported, the user
requested: "make new release". Proceed with v0.3.0 publication under that current
instruction, explicitly disclosing the remaining acceptance gap. This does not
change failed checks into passes or authorize changing desktop notification settings.
The earlier release hold is superseded for this publication; Windows acceptance
remains outstanding. No runtime or dependency changes are needed for this step.

- [x] Rerun release checks, package inspection and isolated host smoke.
- [x] Commit the reviewed changes, tag v0.3.0, push and verify published VSIXs.

See [release evidence](../../verification-2026-10-27-release-v0.3.0.md).
