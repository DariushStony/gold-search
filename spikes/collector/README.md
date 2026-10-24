# Collector spike (throwaway)

Decision D-12: start a slow, scheduled collection early so the product has a real price history, not one frozen crawl. This is a spike: it will be replaced by the real pipeline after the TDD.

## What it collects each run

| Source | What | File |
|---|---|---|
| tgju public JSON | 18k and 24k gram price, mesghal, coins, ounce, USD (rial) | `data/raw/<date>/gold-price.jsonl` |
| Torob API `/v4/base-product/search` | first 2 pages of 11 gold queries (≈ 22 requests) | `data/raw/<date>/torob-search.jsonl` |
| — | per-step errors and a run summary | `data/raw/<date>/runs.jsonl` |

Every row carries `run_id`, `source` URL and `fetched_at`.

## Rules it follows

- Only endpoints that `https://api.torob.com/robots.txt` allows (`/v4/base-product/search`, `/v4/base-product/details`). `torob.com/search/` and `/v4/base-product/price-history` are disallowed and never called.
- 10–15 s between Torob requests.
- Torob answers bots with HTTP 490 and a CAPTCHA page. On the first 490 the run stops and logs it; it never retries.
- `data/` is git-ignored: raw third-party data is not committed.

## Run

```bash
node spikes/collector/collect.ts
```

Scheduled twice a day on the owner's machine.
