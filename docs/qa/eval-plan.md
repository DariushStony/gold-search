# Evaluation plan

| | |
| --- | --- |
| Status | draft (stage 03) |
| Version | 0.3 |
| Owner | Dariush Hadipour |
| Last updated | 2026-10-25 |
| Inputs | [PRD](../product/prd.md) §4, §11, §20; [labeling guide](labeling-guide.md) |
| Standard | ISO/IEC/IEEE 29119-3 (test plan terms); held-out evaluation with confidence intervals |

> Purpose: how every quality number in the PRD (§4.1) is produced, so anyone can re-run it and get the same result. Numbers are reported only on the **test** split.

## 1. Datasets

| ID | Measures (PRD) | Population | Sample | Ground truth | Size rationale |
|---|---|---|---|---|---|
| EV-MAT | material label accuracy, macro-F1 (BR-30–BR-39) | Torob gold-jewelry search results from scheduled snapshots | stratified random by query, seed 42, one row per Torob product | AI annotator from title, details page and price; 30-row human audit with Cohen's κ (D-20; [guide](labeling-guide.md) §1–2) | 210 tune / 90 test. The test split is owner-labelled (D-21); 12 «unsure» rows are left out, so 78 are scored. At 95% accuracy the 95% Wilson half-width is about ±4.8 points on 78 rows |
| EV-EXT | weight / karat extraction (BR-20–BR-28) | same rows as EV-MAT | same | human reading of title and product page | same |
| EV-PRM | implied-ojrat error (BR-43) | Digikala gold-jewelry products across 4 sort orders | first 150 unique ids (script order) | Digikala's declared `gold_wage` | bootstrap CI on MAE; n≈150 |
| EV-QRY | query understanding (BR-50–BR-57) | Persian gold requests | 98: 60 authored (written as 20 per intent; after the owner's review the labels are 20 gift, 20 beauty, 12 savings, 8 unknown) + 38 real requests copied verbatim from public forum threads (39%; ninisite.com, 1393–1405) | chip schema filled by the AI annotator, every row confirmed or rejected by the owner | per-intent breakdown needs ≥ 20 each; `unknown` intent rows test BR-53 |
| EV-RNK | ranking quality (BR-60–BR-67) | real queries from EV-QRY | ≥ 30 queries × top-10 pooled from both systems, judged in one blind session at M5 (D-25) | graded relevance 0–3, judged blind to system ([guide](labeling-guide.md) §5) | bootstrap over queries |
| EV-MCH | Torob ↔ Digikala matching (BR-81–BR-83, after MVP); decision evidence for D-24, not a release metric | Torob listings with a Digikala offer + same-gallery candidates | ≥ 100 pairs, half expected matches | human judgement of "same physical item" | precision CI at ≥ 95% |

## 2. Splits and leakage

- Each dataset is split 70% **tune** / 30% **test** with seed 42, by product (EV-MAT, EV-EXT, EV-MCH), by query (EV-QRY, EV-RNK) or by product id (EV-PRM).
- Thresholds, keyword lists and ranking weights are changed only while looking at **tune**. Every change is logged in the decision log.
- **Test** is scored only on release tags: M4, M5 and Gate 3 (ADR-0008). If anything is changed after the test split was seen, a fresh test sample is drawn and the old one is retired.
- CI on every push scores the **tune** split only and fails on a drop versus `main` unless a decision-log entry accepts it (ADR-0008).

## 3. Metrics and intervals

| Metric | Definition | Interval |
|---|---|---|
| Accuracy (real vs rest) | share of test rows where system label "real" equals human "gold" | Wilson 95% |
| Macro-F1 | mean F1 over gold / mixed / not-gold (system "suspicious" counts as not-"real") | bootstrap 95% (2,000 resamples, seed 42) |
| Extraction accuracy | exact match of weight (±0.005 g) and karat, on rows where the human found a value | Wilson 95% |
| Weight recall | share of rows where the human found a weight in title or specs and the system found the same weight; PRD target ≥ 95% | Wilson 95% |
| Weight coverage | share of human-gold rows where the system found a weight; reported only, since its ceiling is what sellers wrote (PRD §4.1) | Wilson 95% |
| Implied-ojrat MAE | mean |implied − declared| in percentage points | bootstrap 95% |
| Query exact-match | share of queries where every chip equals the label | Wilson 95%; per intent |
| NDCG@5 | standard, gains 0–3, against Torob's own order for the same query | paired bootstrap over queries; report Δ and its 95% CI |
| Reference-price agreement | share of market-hours fetches where union and tgju differ by < 1% (D-24) | Wilson 95% |
| Explanation faithfulness | share of numbers in explanation text that equal a computed field | exact count |
| Offer freshness | share of representative offers in results with age ≤ 24 h at `finished_at` (BR-14, BR-17); per run, from the run log | Wilson 95% |
| Card–details agreement | share of products whose search-card price equals the cheapest in-stock details offer (BR-84; `spikes/eval/offer-freshness.ts`); weekly monitor | Wilson 95% |

**How a release passes.** For each PRD §4.1 target, the point estimate on the test split must meet the target. The 95% interval is published next to it. With test splits of 78–90 rows a pass means "consistent with the target", not "proven": at 95% the half-width is about ±4.5 to ±4.8 points. NDCG@5 is the exception: its target is itself an interval (Δ's 95% CI above zero).

## 4. Baselines

| Dataset | Baseline |
|---|---|
| EV-MAT | keyword rule: title contains «طلا» and none of the negative words in BR-31 |
| EV-EXT | title-only regex (no product page, no matching) |
| EV-PRM | none: the target is the error itself |
| EV-QRY | rules only, no LLM (D-09) |
| EV-RNK | Torob's own order for the same query and snapshot |
| EV-MCH | title-token Jaccard ≥ 0.6 |

## 5. Publication

- Every row, label and system output goes to `docs/evidence/` as CSV, with the snapshot date and script that produced it (D-14).
- A summary table per release goes to the methodology page (BR-122): metric, n, value, 95% interval, date.

## Revision history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-22 | First draft for Gate 2 |
| 0.2 | 2026-10-23 | Technical review (D-28): EV-MAT interval width corrected (±4.8 on 78 scored test rows, not ±2.5); release vs push rules; pass rule; weight recall vs coverage; offer freshness and card–details agreement |
| 0.3 | 2026-10-25 | EV-QRY intent counts after the owner's review (20/20/12/8), not the authoring plan (20 per intent) |
