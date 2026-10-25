# ADR-0006: Rules-first parser with schema-bound LLM fallback

- Status: accepted (2026-10-25): implemented
- Date: 2026-10-23
- Deciders: Dariush Hadipour
- Related: D-09, D-23, D-26; BR-50–BR-5A, BR-55, BR-73, BR-74; EV-QRY

## Context and problem

Requests are colloquial Persian with Finglish, typos and money slang («۲۰ تومن»، «۵ ت»). The owner's reviews of EV-QRY showed that real sentences are harder than authored ones (AI labels 71.1% vs 88.3% correct; `docs/evidence/ev-qry-review-2026-10-23.csv`).

## Decision drivers

- Measurable accuracy (EV-QRY ≥ 90%).
- Numbers must never be invented (D-09).
- Works when the LLM is down (BR-73); low cost.

## Considered options

1. Rules only.
2. LLM only, free text out.
3. Rules first; LLM only for unparsed spans, with a JSON schema limited to the v3 chips and a check that every number appears in the user's text.

## Decision and why

Option 3. Rules handle the frequent, checkable parts (item types, money units, karat, ojrat phrases); the LLM covers the long tail (recipient phrasing, occasions, style words). The schema stops it inventing chips; the number check stops it inventing values. EV-QRY reports rules-only vs rules + LLM, so the LLM stays only if it adds measured accuracy.

## Consequences

- Good: deterministic for most requests; cheap; testable.
- Bad: two code paths to maintain.

## Confirmation

EV-QRY test split: rules-only and rules + LLM exact-match with Wilson intervals, per intent, reported on the methodology page.
