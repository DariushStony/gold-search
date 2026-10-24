# Test strategy

| | |
| --- | --- |
| Status | draft (stage 03) |
| Version | 0.2 |
| Owner | Dariush Hadipour |
| Last updated | 2026-10-23 |
| Inputs | [PRD](../product/prd.md) §4, §11, §13, §20; [TDD](../engineering/tdd.md) §10; [eval plan](eval-plan.md); [test cases](test-cases.md) |
| Standard | ISO/IEC/IEEE 29119-3 test strategy; ISTQB terms |

## 1. Scope and objectives

Show that every MVP business rule behaves as its acceptance criterion says, and that the quality numbers in PRD §4.1 hold on held-out data. Out of scope: Torob's own systems, load beyond the review period.

## 2. Risk-based priorities

| Priority | Area | Why |
|---|---|---|
| P1 | Material labels, price math, crawl politeness, explanation grounding, prompt-injection | wrong numbers or labels hurt users and shops; politeness protects access |
| P2 | Query parsing, ranking, archive mode | visible quality; measured by EV-QRY and EV-RNK |
| P3 | History, savings card, analytics | supporting features |

## 3. Test levels and types

| Level | What | Tool |
|---|---|---|
| Unit | each BR, at least one test (NFR-12) | `node:test` |
| Evaluation | EV-MAT, EV-EXT, EV-PRM, EV-QRY (now), EV-RNK (M5): tune split on every push, test split on release tags, with intervals | harness (ADR-0008) |
| Integration | collector → pipeline → publish → serve on a fixture | `node:test` + temp dirs |
| End-to-end | main scenarios TC-FL-*, TC-SEC-01, TC-TR-01 | Playwright |
| Non-functional | latency budgets (NFR-01–NFR-03), WCAG AA checks (NFR-09) | Playwright timing, axe |

## 4. Automation

Everything above except the owner's human judgements runs in CI. Human judgements (labels, relevance) are collected through click-through pages and committed as evidence files.

## 5. Environments and data

- Fixture snapshot from `data/raw/2026-10-22`; fixture gold price G = 27,017,000 toman.
- Device matrix: mobile 360 × 800 and desktop 1280 × 800; Chrome and Safari.

## 6. Entry, exit and suspension

| | Criteria |
|---|---|
| Entry (stage 06) | contracts frozen (stage 04); fixture snapshot published |
| Exit (Gate 3) | all P1 tests pass; PRD §4.1 targets met on test splits or the gap is recorded and accepted by the owner |
| Suspension | Torob API shape changes; a fixture refresh is needed (recorded decision) |

## 7. Defects

Logged as GitHub issues with the BR/AC ID; a defect that contradicts the PRD becomes a PRD question, not a silent fix.

## 8. Roles

Owner: human judgements, UAT, Gate 3 approval. Builder: everything else.

## Revision history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-23 | First draft for stage 03 |
| 0.2 | 2026-10-23 | Push vs release scoring (ADR-0008, D-28) |
