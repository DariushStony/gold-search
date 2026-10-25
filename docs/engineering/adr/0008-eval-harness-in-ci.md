# ADR-0008: Evaluation harness in CI with metric gates

- Status: accepted, not yet implemented (2026-10-25): evaluations run with pnpm eval on the owner's machine; CI runs pnpm check and the build only
- Date: 2026-10-23
- Deciders: Dariush Hadipour
- Related: D-04, D-14; PRD §4; eval plan

## Context and problem

The product's claims are numeric (accuracy, coverage, error). A change that lowers a number must not ship unnoticed, and every published number must be reproducible.

## Decision drivers

- Statistical honesty (test split scored once per release; intervals).
- Reproducibility from committed fixtures and labels.

## Considered options

1. Harness scripts in the repo run in CI on frozen fixtures, with gates at the PRD targets.
2. Manual notebook runs before release.

## Decision and why

Option 1.
- **Every push:** the harness runs on the **tune** split only. The job fails if a tune metric is lower than on `main`, unless the change cites a decision-log entry that accepts the trade-off. Fixtures are frozen, so any drop is a real change in output.
- **Release tags** (M4, M5, Gate 3): the **test** split is scored. The gate is the point estimate against the PRD §4.1 target, and the 95% interval is published next to it on the methodology page, with n, date and `pipeline_version`.
- A pass on n = 90 means "consistent with the target", not "proven". At 95% accuracy the 95% half-width is about ±4.5 points (eval plan §3).
- If anything is changed after the test split was seen, a fresh test sample is drawn (eval plan §2).

## Consequences

- Good: numbers in the video are the numbers CI produced.
- Bad: fixtures must be refreshed deliberately; a refresh is a recorded decision.

## Confirmation

The release checklist links the CI run that produced each methodology number.
