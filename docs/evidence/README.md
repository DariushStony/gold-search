# Evidence: datasets we collected ourselves

| | |
| --- | --- |
| Status | live |
| Owner | Dariush Hadipour |
| Last updated | 2026-10-24 (M4 release) |
| Standard | D-14: every own number ships with its method, date and raw file |

Each file below backs numbers in [market-research.md](../product/market-research.md). Third-party sources are listed in that document's sources table instead.

| File | What | Collected | Method | Limits |
|---|---|---|---|---|
| `digikala-gold-top100-2026-10-22.csv` | Digikala's top-100 gold-jewelry bestsellers: rank, id, category, weight (g), ojrat (%), price (toman), the gold rate Digikala used, title, product URL | 2026-10-22 | `api.digikala.com/v1/categories/gold-jewelry/search/?sort=7` (bestsellers), pages 1–5; weight and ojrat from each product's `gold_price_details` at `/v2/product/{id}/` | One snapshot. Digikala's bestseller window and ranking are not disclosed. "Women's" is read from the category label (e.g. «آویز طلا زنانه»). |
| `gtrends-ir-a-5y-weekly.csv` | Google Trends, Iran, web search, weekly, 2021-10-17 to 2026-10-18: خرید طلا، دستبند طلا، گردنبند طلا، آویز طلا، پلاک طلا | 2026-10-22 | trends.google.com explore (the same request the UI makes) | Values are relative (0–100) within this comparison only. Zero weeks in 2025-06, 2026-01 and 2026-03/04 are internet shutdowns, excluded from means. |
| `gtrends-ir-b-5y-weekly.csv` | Same, for دستبند طلا، طلای آب شده، سرویس طلا، النگو طلا، حلقه ازدواج | 2026-10-22 | Same | Same |
| `ev-prm-digikala-2026-10-22.csv` (+ `.summary.json`) | EV-PRM: 130 Digikala gold products with declared ojrat, profit, tax, non-gold parts, gold rate, list and sale price, and our implied ojrat (BR-43) | 2026-10-22 | `spikes/eval/digikala-prm.ts`: ids from `/v1/categories/gold-jewelry/search/` with sorts 7, 4, 20, 21, pages 1–2; details from `/v2/product/{id}/`; list price and Digikala's own gold rate | Exploratory, no tune/test split yet. 44 of 130 have non-gold parts (D-19). |
| `ev-mat-sheet-2026-10-22.csv` | EV-MAT / EV-EXT labelling sheet: 300 Torob products (210 tune, 90 test), empty label columns | 2026-10-22 | `spikes/eval/sample-ev-mat.ts`: snapshot `data/raw/2026-10-22`, stratified by query, seed 42 | One snapshot, 10 queries. Labels follow `docs/qa/labeling-guide.md`. |
| `ev-mat-audit-2026-10-22.csv` | Owner's blind audit of 30 random rows (seed 42) against the AI first-pass labels | 2026-10-22 | owner labelled in a click-through page without seeing AI labels (D-20) | 4-class agreement 83.3%, Cohen's κ 0.72; gold-vs-rest κ 0.67; excluding «unsure» (n=26) κ 0.78. Below the 0.8 bar ⇒ test split gets full human review. |
| `ev-mat-labels-2026-10-22.csv` | Final EV-MAT labels: test split (90) labelled by the owner; tune split (210) by the AI annotator; both labels kept per row | 2026-10-22/23 | owner click-through review (blind); AI first pass from title, price and 42 details pages | Test split: 12 «unsure» excluded from scores. AI vs owner on test: 76.7%, κ 0.64 (D-21). Weight/karat columns are AI first pass, pending details pages. |
| `ev-qry-authored-2026-10-23.csv` | EV-QRY: 60 authored requests (20 per intent) with chip labels | 2026-10-23 | written to cover colloquial budgets («۲۰ تومن»، «۱۰م»)، Finglish، typos, weight words, occasions, galleries | Authored, not real users; labels by the AI annotator, pending owner confirmation. |
| `ev-qry-real-2026-10-23.csv` | EV-QRY: 38 real requests copied verbatim from public ninisite.com threads, with source URL and date, no usernames | 2026-10-23 | web search of public threads; text matched against the saved page | 25 of 38 are from 1393–1401, so budgets reflect old prices; labels by the AI annotator, pending owner confirmation. |
| `ev-qry-review-2026-10-23.csv` | Owner's verdict (ok / wrong + note) on every EV-QRY v1 label | 2026-10-23 | click-through page | 80/98 ok (authored 53/60, real 27/38). Notes drove chip schema v2 (D-23); both EV-QRY files now hold v2 labels. |
| `ev-qry-review-v2-2026-10-23.csv` | Owner's second verdict on the 58 rows relabelled with schema v2 | 2026-10-23 | click-through page | 39/58 ok. Notes drove schema v3 (D-26); both EV-QRY files now hold v3 labels. |
| `ev-mch-labels-2026-10-23.csv` | EV-MCH: 100 Torob ↔ Digikala candidate pairs with the owner's same / different / unsure judgement | 2026-10-23 | `spikes/eval/mch-candidates.ts`: one Digikala search per Torob gold product, best title match; top 60 by similarity + 40 random | 1 same, 96 different, 3 unsure. Too few positives to measure recall. |
| `offer-freshness-2026-10-23.csv` (+ `.summary.json`) | Representative offer and refresh evidence (BR-17, BR-84, D-28): for each of 280 Torob products with a details page, the search-card price vs the cheapest in-stock online offer; per run, the share of cards that name several shops; offer counts per details page | 2026-10-23 | `spikes/eval/offer-freshness.ts` over `data/raw/*/torob-search.jsonl` and `data/raw/details/` (300 pages); card = the search fetch closest in time to the details fetch | 3 collector runs only. Card and details fetches are not simultaneous, so some differences are real price changes. |
| `ev-ext-labels-2026-10-24.csv` | EV-EXT ground truth: weight, karat and ojrat for all 300 EV-MAT rows, with evidence text. Tune split by an independent AI annotator that never saw the code; test split audited by the owner (87 ok, 3 wrong: E285 karat removed; E212 and E227 weight kept out of scoring as disputed, since the snapshot's specs state a weight the owner could not see on the live page) | 2026-10-24 | annotator read title, specs and shop titles from `data/raw/details/`; owner used a click-through page; every test value was checked to appear in the raw text | Weights of non-gold items are recorded too; filter by the EV-MAT label if needed. |
| `m4-release-2026-10-24.json` | M4 release scores on the test splits: EV-MAT, EV-EXT, EV-PRM, with intervals, targets and the EV-MAT error causes | 2026-10-24 | the three eval scripts with `--split=test --release`, run once | EV-MAT missed its target (84.6%); that test split is now retired (eval plan §2). |
| `ev-mat-tune-owner-2026-10-24.csv` | The owner's own material labels for 12 tune-split products, plus two definitions: gold with a stone is gold; a string or leather bracelet with a gold bead is gold (CR-03) | 2026-10-24 | blind click-through page; the AI label was hidden | 11 of 12 differ from the AI annotator's label, mostly «mixed» vs «gold»; the owner stopped here (D-34). |
| `gold-sources-2026-10-23.csv` | Every 18k gold quote from the union board and tgju collected on 2026-10-23, with each source's own quote time | 2026-10-23 | `src/collector/collect.ts`, copied from `data/raw/2026-10-23/gold-price.jsonl` | On the evening of 1 Aban the union board showed 26,245,500 toman and tgju 27,223,100 (stamped the previous day): 3.7% apart. |

## Not yet reproducible

- **Torob gold-search sample (n=93, 2026-10-20):** labels and counts were recorded, but the raw rows were not saved. Treat its numbers as preliminary. It will be replaced by a labelled sample drawn from the scheduled collector (`spikes/collector`), published here with every row and label.

## Occasion uplift method (Google Trends)

uplift = max(event week, week before) ÷ mean(5 weeks before + 3 weeks after), per year, per term.
