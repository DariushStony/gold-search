# ADR-0009: Collector politeness: allowed paths, pacing, stop on 490

- Status: accepted (2026-10-25): implemented and tested (AC-DC-01 to AC-DC-03)
- Date: 2026-10-23
- Deciders: Dariush Hadipour
- Related: BR-10–BR-12, BR-17; TDD TC-02, TC-03; market research §6

## Context and problem

Torob's terms have no anti-scraping clause, but robots.txt limits the API to search and details, and the site enforces an anti-bot wall (market research §6; `docs/evidence/torob-robots-2026-10-21.txt`).

## Decision drivers

- Respect the site's stated rules.
- Never try to get around the anti-bot wall.
- Still build a price history.

## Considered options

1. Allowed paths only; 10–15 s gaps for search, 25 s for details; at most 40 details pages a run (the low end of the observed wall, TC-03), in the BR-17 order; stop the run on the first 490, non-JSON answer or network error; resume next run.
2. Faster crawling with retries or rotating addresses.

## Decision and why

Option 1. Option 2 would mean working around a protection the site chose; it is rejected outright. History comes from many slow runs, not from fast ones.

## Consequences

- Good: low load on Torob; defensible in an interview.
- Bad: details for new products arrive over several runs, and the other shops of multi-shop products refresh about once a day (TDD §7).

## Confirmation

Unit tests feed a 490, a non-JSON answer and a network error on request 3 and check that exactly 3 requests were made (AC-DC-03, AC-DC-09). Run logs show gaps ≥ 10 s (AC-DC-02) and at most 40 details requests (AC-DC-08).
