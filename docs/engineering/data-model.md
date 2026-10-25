# Data model

| | |
| --- | --- |
| Status | draft (stage 03) |
| Version | 0.6 |
| Owner | Dariush Hadipour |
| Last updated | 2026-10-25 |
| Inputs | [PRD](../product/prd.md) v1.4 §9–§11; [API contract](api-contract.md); observed Torob API fields in `data/raw/` (2026-10-21 to 2026-10-23) |
| Standard | Entity tables with types, provenance and the business rule each field serves; integrity rules with IDs (DM-xx) |

> Three layers. **Raw** is what the collector fetched, untouched. **Snapshot** is what the pipeline derives from all raw files up to one run; it is immutable and versioned. **Live** is what the server keeps between snapshots (gold price, events). Money is integer toman, weight is grams, percentages are numbers (34.2 = 34.2%), times are ISO 8601 UTC.

## 1. Raw layer (git-ignored `data/raw/` on the owner's machine, or a temporary folder on the server for one run, ADR-0013)

| File | One row per | Key fields | Source |
|---|---|---|---|
| `<date>/torob-search.jsonl` | search page | `run_id`, `q`, `page`, `fetched_at`, `results[]` (Torob: `random_key`, `name1`, `name2`, `price`, `price_prefix`, `shop_text`, `web_client_absolute_url`, `image_url`, `is_adv`) | `api.torob.com/v4/base-product/search` |
| `details/<random_key>.json` | product page | `fetched_at`, `body.structural_specs`, `body.products_info.result[]` (online tab) and `body.products_in_store_info.result[]` (in-person tab), each offer with `shop_name`, `shop_name2` (city), `name1`, `price`, `availability`, `is_price_unreliable`, `page_url`, `shop_score_percentile` (0 on every offer so far, not read), `score_info` (star score and «N سال در ترب», CR-09), `show_torobpay_badge`, `is_adv` | `api.torob.com/v4/base-product/details` |
| `<date>/gold-price.jsonl` | fetch | `fetched_at`, `source`, `unit`; union rows keep the response `body`, tgju rows keep `prices{}`. Fetched before each search query, every 10 details pages and at the end of every run | union board, tgju |
| `<date>/runs.jsonl` | step or run | `run_id`, `step`, `kind`, `status`, `requests`, `stopped` (`challenged` \| `non_json` \| `network` \| null) | collector |

Raw files are never edited. A pipeline bug is fixed by re-deriving the snapshot.

**What the raw data looks like** (300 details pages, 2026-10-22; [evidence](../evidence/offer-freshness-2026-10-23.summary.json)):
- 3,667 offers, of which 877 have a price: 667 in stock online plus 210 in the in-person tab. The other 2,790 are out of stock with price 0.
- 103 of 300 products (34.3%) have an in-person tab.
- 3,457 offers (94.3%) carry a Torob shop score.
- The search card's price equals the cheapest in-stock online offer for 83.6% of 280 products, and is within 1% for 95.7%.
- Spec keys seen include «وزن», «عیار», «اجرت», «اجرت ساخت», «سود», «جنس», «متعلقات» and «جنسیت», so declared ojrat and profit can come from specs.

## 2. Snapshot layer (one SQLite file per run, published to the server)

`snapshot-<run_id>.sqlite`, schema version in `meta.schema_version` (starts at 1; 2 from CR-09, when `shop_stars` and `shop_months` replaced `shop_score_pct`; 3 from CR-17, when the snapshot started carrying its inputs).

### 2.1 Tables

| Table | Fields | Rules served |
|---|---|---|
| `meta` | `schema_version`, `run_id`, `started_at`, `finished_at`, `requests`, `stopped_reason`, `pipeline_version`, `details_budget`, `details_fetched` | BR-12, BR-14, BR-16, BR-17 |
| `gold_quote` | `id`, `source` (`union` \| `tgju`), `kind` (`18k` \| `24k` \| `mesghal` \| `740`), `value_toman`, `quoted_at`, `fetched_at` | BR-01–BR-06, BR-48 |
| `product` | `id` (Torob `random_key`), `title`, `subtitle`, `image_url`, `category_path`, `torob_url`, `card_shop_count` (1 or N from `shop_text`), `sample` (bool, BR-15; true only for fixture or demo rows), `first_seen_at`, `last_seen_at`, `details_fetched_at` | BR-17, BR-80 |
| `offer` | `id`, `product_id`, `source` (`torob_search` \| `torob_details`), `shop` (nullable), `city`, `channel` (`online` \| `in_person`), `title` (the shop's own `name1`), `price_toman`, `url`, `torob_pay`, `is_adv`, `price_unreliable`, `shop_stars` (nullable), `shop_months` (nullable) (CR-09), `fetched_at`, `gold_quote_id` (nullable) | BR-13, BR-14, BR-48, BR-64, BR-84, BR-92, BR-112 |
| `attribute` | `product_id`, `name`, `value`, `provenance` (`spec` \| `title` \| `llm`), `confidence` (0–1), `evidence` (the matched text). Names: `weight_g`, `weight_conflict` (title and specs disagree; specs win, PRD §12), `karat`, `declared_ojrat_pct`, `declared_profit_pct`, `gallery`, `item_type`, `subtype`, `style_tags`, `audience`, `condition`, `has_non_gold_parts`, `non_gold_kind` (`stones` \| `cord` \| `beads` \| `declared`), `non_gold_cost_toman` | BR-20–BR-29, BR-2A, BR-58, BR-60 |
| `label` | `product_id`, `label` (`real` \| `mixed` \| `not_gold` \| `review`), `reasons` (JSON array), `price_ratio`, `weight_unknown` | BR-30–BR-39, BR-84 |
| `breakdown` | `offer_id`, `gold_value`, `premium_pct`, `implied_ojrat_pct`, `declared_ojrat_pct`, `parts` (JSON: gold, ojrat, profit, vat in toman; null when partial), `breakeven_g`, `vat_overcharge`, `partial_reason` (`non_gold_parts` \| null; an assumed karat is an input flag, not a partial breakdown), `vat`, `profit` | BR-40–BR-48, BR-2A |
| `history` | `product_id`, `shop` ("" for a card that names no shop), `observed_on` (Tehran date), `price_toman`, `premium_pct`, `g_toman` | BR-90, BR-91 |
| `source_card` | `product_id`, `run_id`, `fetched_at`, `name1`, `name2`, `price`, `shop_text`, `url`, `image_url`, `is_adv`: every search card seen, so a later build can start from this snapshot (ADR-0013) | BR-13, DM-05 |
| `source_details` | `product_id`, `fetched_at`, `body`: the newest details page, trimmed to the specs and the shops' offers | DM-08, ADR-0013 |

Indexes: `offer(product_id)`, `attribute(product_id, name)`, `history(product_id)`, `history(shop, observed_on)`.

`resale_value` and `required_rise_pct` are **not stored**: they need the live G and are computed per request (BR-42, BR-45). Excluded listings are not stored separately either: `POST /excluded` reads `label = not_gold` with the same product-level filters.

### 2.2 Integrity rules

| ID | Rule |
|---|---|
| DM-01 | Every `offer` has `fetched_at`; an offer without it is not written (BR-13). `gold_quote_id` is the 18k quote nearest in time to `fetched_at`, at most 60 minutes away; otherwise it is null and the offer has no `breakdown` (60 min is a design choice). The collector fetches gold before each search query, every 10 details pages and at the end, because a run on a sleeping machine stretched over 2 h on 2026-10-23 (`data/raw/2026-10-23/runs.jsonl`). |
| DM-02 | Every `attribute` value has `provenance` and `evidence`. An `llm` value is written only if every number in it appears in `evidence` (BR-29). |
| DM-03 | `label.reasons` is never empty (BR-38). |
| DM-04 | `breakdown` exists for every offer whose product has a known weight and whose offer has a `gold_quote_id`. When the product has non-gold parts without declared costs, `partial_reason = non_gold_parts` and `implied_ojrat_pct` is null; such offers count as «اجرت قابل محاسبه نیست» for ojrat filters (BR-59), score 0 on `low_premium`, and stay out of the savings list (BR-2A). Declared non-gold costs are subtracted first. |
| DM-05 | `history` holds one row per product × shop × day: the last observation of that day. |
| DM-06 | A snapshot is immutable once published; corrections ship as a new snapshot with a higher `pipeline_version`. |
| DM-07 | No personal data in any table (PRD §14). |
| DM-08 | Offer set (BR-84). Only offers with a price are written: in stock online, or in-person with a price. For each product, the set holds the latest details offers plus one offer from the latest search card that saw the product. That search offer merges into the details offer of the same shop; if the card names no shop («در N فروشگاه»), it merges into the details offer with the same price. The merged offer keeps the newer price and `fetched_at` and the details offer's shop, city and url. An unmerged multi-shop card stays with `shop = null` and the Torob product page as `url`. |
| DM-09 | Labels and attributes are per product, from the base product's title and specs. If any written offer's own `title` has a BR-31 word, the label is `review` with reason «عنوان یک فروشگاه با بقیه نمی‌خواند» (BR-84). |
| DM-10 | `product.details_fetched_at` drives the details queue of the next run (BR-17): never fetched first, then multi-shop cards (oldest first), then the rest (oldest first). |

### 2.3 Sizes

- Measured: 439–461 products per run from 21 search pages (3 runs; [evidence](../evidence/offer-freshness-2026-10-23.summary.json)), and 2.9 priced offers per product on average (877 over 300 details pages; median 1).
- Estimate: a snapshot is a few MB. History grows by roughly 450 × 3 ≈ 1,300 rows a day.

## 3. Live layer (server)

| Store | Fields | Rules served |
|---|---|---|
| In-memory gold price cache | the latest `union` **and** `tgju` quotes, both fetched on every refresh so BR-04 can compare them; refreshed every 2 minutes; `market_open` = at least one source changed its quote in the last 30 minutes (A-01) | BR-01–BR-05 |
| Snapshot store (persistent disk) | `snapshots/<run_id>.sqlite` + `<run_id>.sha256`; the active one plus the 2 before it are kept (3 files); older ones are deleted, and requests pinned to them get `410 snapshot-expired` | BR-16, DM-06, NFR-05 |
| Active snapshot pointer | newest complete snapshot that passed checks; archive mode when its `finished_at` is older than 48 h | BR-16 |
| `events.sqlite` (persistent disk, append-only) | `event_id` (unique), `name`, `at`, `session_id`, `snapshot_id`, `pipeline_version`, `query_id`, `props` (JSON, no personal data) | BR-111, PRD §15, [tracking plan](tracking-plan.md) |

## 4. PRD domain model → storage

| PRD §10 entity | Where it lives |
|---|---|
| GoldQuote | `gold_quote` (snapshot); gold price cache (live) |
| Offer | `offer` + `breakdown` |
| Product | `product` |
| Attributes | `attribute` (one row per name) |
| MaterialLabel | `label` |
| PriceBreakdown | `breakdown`: every number at the G from when the price was fetched, including resale, loss and rise (CR-07); today's G is only an input shown for context |
| Match | not stored; after the MVP (D-24) |
| Query, RankedResult | query-time objects (§5) |
| Run | `meta` (snapshot) and `runs.jsonl` (raw) |
| Snapshot states (PRD §10) | snapshot store and active pointer (§3) |

## 5. Query-time objects (not stored)

Built per request from the snapshot and the live gold price ([API contract](api-contract.md) §3):
- `Query`: chips v3 and the derived intent.
- `RankedResult`: product, representative offer, score, components, explanation.
- `SavingsCard`.
- Live breakdown fields: `resale_value` and `required_rise_pct`.

## Revision history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-23 | First draft for stage 03 |
| 0.2 | 2026-10-23 | Technical review (D-28): offer channel, city, availability, shop score and own title; offer set and merge rule (DM-08); per-product labels with offer-title check (DM-09); details queue (DM-10); partial breakdown instead of none (DM-04); live G fields not stored; gold quote within 60 min (DM-01); attributes for subtype, style tags, declared ojrat and profit; snapshot retention 3; both gold sources on every refresh; measured sizes |
| 0.3 | 2026-10-23 | Freeze readiness: PRD domain → storage map (§4); PRD v1.2 |
| 0.5 | 2026-10-23 | M4 build: `parts` column; history shop "" for unnamed cards; gold fetched around every query (DM-01) |
| 0.4 | 2026-10-23 | Independent review: `partial_reason` only for non-gold parts; `weight_conflict` attribute; `sample` flag; PRD v1.3 |
| 0.6 | 2026-10-25 | CR-09: offer `shop_stars` and `shop_months` from Torob's `score_info`; schema version 2; the label check uses the nearest quote within 72 hours |
| 0.7 | 2026-10-25 | CR-17: schema version 3 with `source_card` and `source_details`; a build may merge a base snapshot with new raw files (ADR-0013) |
