# Implementation plan

| | |
| --- | --- |
| Status | draft (stage 03) |
| Version | 0.3 |
| Owner | Dariush Hadipour |
| Last updated | 2026-10-23 |
| Inputs | [PRD](../product/prd.md) §11, §16, §18; [API contract](api-contract.md); [eval plan](../qa/eval-plan.md) |
| Standard | Epics with IDs that trace to requirements; relative sizes (S, M, L); an L is split before it starts |

## 1. Epics

| ID | Epic | Requirements | Size | Milestone | Depends on |
|---|---|---|---|---|---|
| E-01 | Data collection: from spike to a scheduled pipeline with run logs; robots check; details queue in the BR-17 order; gold quotes around every query; raw → snapshot | BR-10–BR-17 | M | M0 → M4 | — |
| E-02 | Gold reference price: union primary, tgju fallback, history per fetch | BR-01–BR-06, BR-48 | S | M4 | — |
| E-03 | Attribute extraction from Torob title and specs | BR-20–BR-29, BR-2A | M | M4 | E-01 |
| E-04 | Material labels with reasons | BR-30–BR-39 | M | M4 | E-02, E-03 |
| E-05 | Price math: breakdown, resale, break-even, VAT check | BR-40–BR-47 | S | M4 | E-02, E-03 |
| E-06 | Query parsing and live chips: rules first, LLM fallback; budget-unit question; `mode` for coins and bars | BR-50–BR-59, BR-5A | M | M5 | — |
| E-07 | Representative offer, intent ranking with the BR-62 formulas, grounded explanation | BR-60–BR-67, BR-70–BR-74, BR-84 | M | M5 | E-04, E-05, E-06 |
| E-08 | Same product across Torob shops (offer set and merge, DM-08) and premium history | BR-80, BR-84, BR-90–BR-92 | S | M6 | E-03, E-05, ≥ 14 days of snapshots |
| E-09 | Savings card, click-out events, Torob Pay badge | BR-100–BR-102, BR-110–BR-112 | S | M6 | E-05, E-07 |
| E-10a | Web app: search, chips and results (SC-01, SC-02) | BR-39, BR-51, BR-56, BR-64, BR-66, BR-120 | M | M5 | E-06, E-07 |
| E-10b | Web app: detail, excluded and methodology (SC-03 – SC-05) | BR-38, BR-46, BR-121, BR-122 | M | M6 | E-08, E-09, E-11 |
| E-11 | Evaluation harness and datasets EV-MAT, EV-EXT, EV-PRM, EV-QRY, EV-RNK, EV-MCH | PRD §4.3; eval plan | M | M2 → M7 | E-01 |
| E-12 | Hosting on Liara (ADR-0004), snapshot upload over FTPS and the server-side watcher (TDD §8), noindex header, archive mode, uptime check on `GET /status` | BR-16, NFR-06, NFR-13 | S | M7 | E-10a |

Every MVP BR in PRD §11 belongs to at least one epic (checked by script). The UI epics E-10a and E-10b repeat rules whose visible part they build. BR-81–BR-83 (Torob ↔ Digikala matching) are after the MVP (D-24) and have no epic.

## 2. Order

1. **M2 (now):** E-11 datasets and baselines; E-01 keeps collecting.
2. **M3:** TDD and ADRs (stage 03).
3. **M4:** E-01 queue and upload, E-02 and E-05, then E-03 and E-04. Tune thresholds on the tune split (eval plan §2). Measure RAM on the fixture (ADR-0004).
4. **M5:** E-06, then E-07 and E-10a.
5. **M6:** E-08, E-09, E-10b.
6. **M7:** E-12, methodology page, ≥ 14 days of history; Gate 3.
7. **M8:** video and submission (D-01).

## 3. People and time

| Who | What | Estimate |
|---|---|---|
| Owner | label EV-MAT and EV-EXT (300 rows, about 30 s each) | ~2.5 h |
| Owner | judge EV-RNK (30 queries × 10 results) | ~2.5 h |
| Owner | check EV-MCH pairs (100) | ~1 h |
| Owner | collect ≥ 12 real requests from 3–5 people for EV-QRY | — |
| Owner | approve Gate 2, Gate 3 and the submission | — |
| Builder | everything else in §1 | relative sizes only (D-07: time is not the constraint) |

Estimates for labelling are guesses until the first 30 rows are timed.

## 4. Risks to the plan

| Risk | Effect | Response |
|---|---|---|
| Torob 490 from some networks | gaps in snapshots, E-08 history delayed | collect over a direct connection; archive mode (BR-16) |
| Labelling takes longer than estimated | M2 slips | label EV-MAT test split first (90 rows), tune split next |
| Weight is missing from most titles (21% of real gold, S-39) and Digikala cannot fill it (D-22, D-24) | breakdown unavailable for many listings | read Torob specs via `/details`; show «وزن نامعلوم» honestly (BR-37) |
| LLM gateway access | E-06 fallback unmeasured | rules path ships first; LLM measured as an add-on (D-09) |

## Revision history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-22 | First draft for Gate 2 |
| 0.3 | 2026-10-23 | M4: snapshot upload moved from E-01 to E-12, since there is no host before M7 |
| 0.2 | 2026-10-23 | Technical review (D-28): BR-17 and upload in E-01; BR-57–BR-59 and BR-5A in E-06; BR-84 in E-07 and E-08; host named in E-12 |
