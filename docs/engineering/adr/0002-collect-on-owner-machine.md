# ADR-0002: Collect and derive on the owner's machine, publish snapshots

- Status: accepted (2026-10-25): implemented, collection runs on the owner's machine
- Date: 2026-10-23
- Deciders: Dariush Hadipour
- Related: D-11, D-12, D-17; BR-10–BR-16; TDD TC-01, TC-03

## Context and problem

Torob's API walls traffic from some networks (HTTP 490) and answers a direct home connection; even then, the details endpoint walls after tens of requests and needs about 30 minutes to clear (collector logs, 2026-10-21/22). Server egress from a datacenter is likely scored the same way. Cost must stay minimal (D-11).

## Decision drivers

- Get data at all (TC-01).
- Zero cost for collection.
- The live site must never go empty (BR-16).

## Considered options

1. Collector + pipeline on the owner's machine (scheduled), upload a finished snapshot file to the host's disk over FTPS (ADR-0004; TDD §8).
2. Collector on the server.
3. Owner saves pages manually from a browser.

## Decision and why

Option 1. It is the only option already shown to work (2026-10-22 run: 21 requests, 450 products, no wall). The server only serves; it never calls Torob. Manual saving stays as the fallback in PRD §12.

## Consequences

- Good: free; same IP as a normal user; collection and serving are decoupled.
- Bad: depends on the owner's machine being on and reaching Torob over a direct connection. The 2026-10-22 evening run got only network errors (TDD TC-05). Mitigations: stop on the first network error (BR-12), resumable fetching, archive mode (BR-16).

## Confirmation

`GET /status` reports snapshot age; ≥ 14 days of history exist before Gate 3 (PRD M7).
