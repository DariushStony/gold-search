# ADR-0005: LLM through AvalAI, gpt-4.1-mini, rules-only fallback

- Status: accepted (2026-10-24, after the confirmation run below; the model moved from nano to mini)
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

## Confirmation result (2026-10-24)

Run once on AvalAI with a level-1, phone-verified account ([evidence](../../evidence/ev-llm-2026-10-24.json)). The LLM is called only when the rules leave words unread (BR-55), and its answer is checked in code: defined chips and values only, rules keep their values, every number must appear in the text.

| | Rules only | + `gpt-4.1-nano` | + `gpt-4.1-mini` |
|---|---|---|---|
| Hard set: key fact read (12 sentences the rules miss; builder-labelled proxy, [file](../../evidence/ev-qry-hard-2026-10-24.csv)) | 0/12 | 5/12 in both runs | 8/12 and 7/12 in two runs |
| EV-QRY tune split, exact match (69 sentences) | 98.6% | 94.2% | 98.6% |
| Median latency of an LLM call | — | 1.3 s | 0.7 to 0.8 s |

- **Decision:** `gpt-4.1-mini`. It reads more of the hard sentences and loses nothing on the tune split. Nano lost 4.4 points there by adding chips the sentences did not ask for (for example «طلای سفید» from «طلای سنگین», `no_stones` from «بدون اجرت»).
- **Not used:** `claude-haiku-5-5` through AvalAI ignored the JSON schema and took 4.0 s on one sentence.
- **Repeatability:** temperature 0 still varied once (H09 «بله برون»: نامزدی, then عروسی), so answers are cached by normalised text (NFR-05).
- **Cost:** one call is about 900 prompt and 20 to 40 output tokens. At 2,000 calls a month: 2,000 × (900 × $0.40 + 40 × $1.60) / 1M ≈ $0.85, about 227,000 toman at 267,850 toman a unit. [estimate] Only requests with unread words call the model; that was 41 of 69 tune sentences.
- **Not yet measured:** the EV-QRY test split, which stays closed until after the interview (D-33, D-34).
- **Prompt v2 (same day):** the owner's own sentences («جشن بله برون»، «بدو اجرت»، «خانمم») got no chip, so the prompt gained a short glossary of everyday phrasings and a typo note. Hard set: 10/12 in two runs; tune split still 98.6%. The glossary was written after seeing the hard set, so the hard set is now a tuning set, not a held-out measure.
- **Visible in the demo:** a chip the LLM added carries `llm: true` and shows «با AI» (CR-05).
