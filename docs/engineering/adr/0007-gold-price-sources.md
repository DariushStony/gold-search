# ADR-0007: Union board primary, tgju fallback, G stored per fetch

- Status: accepted (2026-10-25): implemented
- Date: 2026-10-23
- Deciders: Dariush Hadipour
- Related: BR-01–BR-06, BR-48; market research §4.1 [S-40], [S-41]; D-24

## Context and problem

Shops price with different gold rates (Eli = union, Technolife = tgju, Digikala = its own; market research §4.1). Premium comparisons need one reference G, and a listing fetched hours ago must be compared with the G of that moment.

## Decision drivers

- The rate shops cite (union) as reference.
- A second source to cross-check (D-24: "gold price from two sources").
- No unlicensed redistribution of a source's content.

## Considered options

1. Union board primary, tgju fallback and cross-check.
2. tgju only.
3. A paid price API.

## Decision and why

Option 1. The union board is the reference shops cite [S-40]; tgju covers failures and gives the 740 basis for used gold [S-41]. Each offer stores the quote id of its fetch time (BR-48). Only derived numbers are shown, with attribution; for a commercial product a licence would be needed (PRD §14).

## Consequences

- Good: the reference-price agreement metric (PRD §4.1) comes for free from the logs.
- Bad: two scrapers to maintain; the union endpoint is undocumented.

## Confirmation

Weekly report: share of market-hours fetches where union and tgju differ by < 1%, with a Wilson interval.
