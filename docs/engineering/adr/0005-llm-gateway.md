# ADR-0005: LLM through AvalAI, gpt-4.1-nano, rules-only fallback

- Status: proposed
- Date: 2026-10-23
- Deciders: Dariush Hadipour
- Related: D-08, D-09, D-11; BR-29, BR-55, BR-71, BR-73; NFR-03, NFR-05; ADR-0006

## Context and problem

The LLM has two optional jobs:
- parse the part of a request the rules did not understand (BR-55);
- word the #1-vs-#2 explanation from computed numbers (BR-71).

It never produces numbers (D-09), and the product must work without it (BR-73). The owner asked for AvalAI or Hoosha (D-08). Volume is small: about 2,000 calls a month, at ~500 input and ~150 output tokens each. [estimate]

All prices below were read on 2026-10-23 from the linked pages.

## Decision drivers

- An OpenAI-compatible chat API with strict JSON-schema output, so parser output is validated by shape.
- Cost per month.
- Reachable from Iran; payment in toman.

## Considered options

| Option | Fit | Price | Source |
|---|---|---|---|
| 1. AvalAI, `gpt-4.1-nano` | OpenAI-compatible base URL `https://api.avalai.ir/v1`; strict `json_schema` on chat completions; the model is flagged `supports_response_schema` | $0.10 in / $0.40 out per 1M tokens; 0% markup on provider list prices | [auth](https://docs.avalai.ir/fa/api-reference/authentication), [structured outputs](https://docs.avalai.ir/fa/guides/structured-outputs), [pricing](https://docs.avalai.ir/fa/pricing), [models](https://api.avalai.ir/public/models) |
| 2. AvalAI, `gpt-4.1-mini` | same | $0.40 / $1.60 | same |
| 3. Hoosha | its developer API serves images, video, music and speech only; no chat completions | — | [API docs](https://docs.hoosha.com/api) |
| 4. Liara AI gateway | OpenAI-compatible with JSON schema | a plan of at least 825,000 toman a month on top of tokens | [pricing](https://liara.ir/pricing/), [docs](https://docs.liara.ir/ai/openai/) |

## Decision and why

Option 1. Hoosha cannot do the job, and Liara's plan fee alone is larger than the whole hosting bill.
- Cost: 1M input × $0.10 + 0.3M output × $0.40 = $0.22 a month. At 272,600 toman per dollar (AvalAI's dashboard rate on 2026-10-23, read from `https://api.avalai.ir/public/exchange-rate`, an endpoint its docs do not list) that is about 60,000 toman. [estimate]
- The 200,000-toman credit for a phone-verified account covers that ([pricing](https://avalai.ir/pricing/)).
- The phone must be verified before the demo: an email-only account is limited to 3 requests a minute on this model ([rate limits](https://docs.avalai.ir/fa/rate-limits)).

**Calling rules:**
- temperature 0;
- strict JSON schema of chip schema v3;
- 4 s timeout, then the rules-only result (NFR-03);
- responses cached by normalised text, so the same request gives the same chips (NFR-05);
- a listing title never enters the parser prompt (BR-74).

## Consequences

- Good: cents per month, no plan fee, standard SDK.
- Bad: AvalAI relays to providers abroad. Iran had international-internet cut-offs in January and from February to May 2026 ([overview](https://en.wikipedia.org/wiki/2026_Internet_blackout_in_Iran)). Another one would stop the LLM path. The rules-only path and the template explanation (BR-73) keep the product working; that is why rules come first (ADR-0006).
- Bad: the toman cost moves with the exchange rate.

## Confirmation

At M5, EV-QRY tune split: rules-only vs rules + `gpt-4.1-nano`.
- The LLM stays only if it raises exact-match without adding a single number missing from the text (BR-55).
- If nano falls short, try `gpt-4.1-mini` (≈ 240,000 toman a month at the same volume) and record the choice in the decision log.
