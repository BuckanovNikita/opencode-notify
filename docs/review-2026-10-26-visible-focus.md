# Independent review — visible notifications — 2026-10-26

## Scope and verdict

Fresh read-only review of the complete task-owned working diff from `0c9babc`,
including untracked files, by GPT-6 Astra at requested high effort. No child
reviewer edited files or delegated further. An earlier Sol reviewer failed due
model capacity without a verdict. Runtime model realization is not observable.

Final code verdict: **ship**. Release acceptance remains held by the desktop gaps
in [verification](verification-2026-10-26-visible-focus.md).

## Findings and correction evidence

1. **P2: old presenter focus hints were rejected.** A preserved newer Router can
   receive `{terminalId, directory}` from an older presenter. The original new
   command required a complete notification and returned silently. A pure validated
   focus-target parser now accepts those explicit IDs without inferring a source
   from directory-only inputs. Protocol regression failed before the correction.
2. **P2: concurrent registration duplicated one terminal.** Overlapping identical
   retries appended to the same binding and produced a false ambiguous picker.
   Source inspection now builds candidates locally and commits only an empty
   binding. The concurrent-three-registration regression failed before correction.

The reviewer independently reran 17 focused tests, both original reproductions,
and closed-source checks after correction. All passed. Parent full check then
passed 94 tests. Subsequent real named-profile validation exposed a separate focus
state timing race: the command can resolve before the state event reaches the
extension. Parent added a bounded 500 ms wait and delayed-state regression. The
reviewer reran four activation tests and inspected the full 95-test parent check;
no new findings. No unresolved actionable code findings were reported.

## Architecture and acceptance

Dependencies and effect ownership match the four declared modules. Pure protocol
validation remains separate; plugin registration, workspace process inspection,
local IPC/native callbacks and window effects stay within their owning adapters.
Eight negative probes enforce dependency boundaries. No runtime SDK was introduced.

Documentation, the complete diff, new test harnesses and the task architecture
record were reconciled by the parent after review. Native callbacks alone do not
prove Windows foreground/terminal activation. At that review, the minimum-host URI and real Windows click checks remained
failed or not run and blocked release acceptance. The user subsequently removed
1.93 support; the continuation below supersedes that host gate.

## Continuation review

A fresh read-only GPT-6.1 Sol reviewer at requested high effort inspected the
support-range change and test harnesses after parent verification. The initial
verdict was **fix-first**: native UI Automation could match the identical VS Code
action; Windows single-window host discovery did not handle versioned resources;
and multiwindow cleanup left task-owned native history entries. Host discovery,
cleanup and the Windows shell provider filter passed scoped rereview. The reviewer
independently ran the final driver self-test (duplicate Code action rejected),
actual Windows archive resolution, syntax checks, architecture probes and whitespace
checks, and inspected all five successful host scenario exits. Final continuation
code verdict: **ship**. Native banner/history acceptance remains a separate release
gate. Runtime model realization is not observable.
