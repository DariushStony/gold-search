# Labeling guide

| | |
| --- | --- |
| Status | draft |
| Version | 0.4 |
| Owner | Dariush Hadipour |
| Last updated | 2026-10-22 |
| Inputs | [eval plan](eval-plan.md), [PRD](../product/prd.md) §9 glossary, [market research](../product/market-research.md) §5 |
| Standard | Written annotation guideline with examples; double-labelled subset for agreement (Cohen's κ) |

> Purpose: anyone labelling an evaluation row makes the same call. When in doubt, choose **unsure** and write why; never guess.

## 1. General rules

1. Label the **listing as sold**, not what the shop probably meant.
2. Open the product page (column `url`) when the title is not enough.
3. Write the reason in `notes` for every label that is not obvious from the title.
4. Labelling protocol (D-20): an AI annotator labels every row from the Torob details page (specs, shops, prices) following this guide, separately from the product's own rules. The owner independently reviews 30 random rows (seed 42). Agreement is reported as Cohen's κ; if κ < 0.8, every test-split row is human-reviewed.

## 2. EV-MAT — material

| Label | Use when | Examples |
|---|---|---|
| `gold` | solid gold jewelry of a stated or standard karat | «انگشتر طلا ۱۸ عیار زنانه وزن ۱.۲۵ گرم» |
| `mixed` | a non-gold body (cord, leather, beads, silver) carrying a small gold part | «دستبند نخی با گوی طلا»، «دستبند چرم پلاک طلا» |
| `not_gold` | plated, gold-filled, Xuping, steel, brass, silver, imitation, even if the title says «۱۸ عیار» | «دستبند ژوپینگ ۱۸ عیار»، «گردنبند استیل رنگ ثابت»، «انگشتر نقره آبکاری طلا» |
| `unsure` | page and title do not let you decide | — |

Tie-breakers:
- «طلا روس» alone: decide by the page and price. Rose-gold 18k jewelry at a price near the gold value is `gold`; costume pieces are `not_gold` ([S-35] in market research).
- Gold-plated silver is `not_gold`.
- Small stones or diamonds **set in** a gold piece: `gold`, tick `has_stones`. Pearls (مروارید), shell (صدف) or beads that form a visible part of the piece's body: `mixed` (owner audit, 2026-10-22).
- Very light, very cheap «طلا» pieces with no stated weight and no details (e.g. «فوق سبک» at ~3M toman): `unsure` until the product page confirms.
- A price far below the gold value of the stated weight is evidence, not proof: write it in `notes` and use the page.

## 3. EV-EXT — attributes (same rows)

| Field | Rule |
|---|---|
| `weight_g` | net gold weight as written on the page or title; convert «سوت» (1/1000 g); blank if not stated anywhere |
| `karat` | 18 / 21 / 24 as written («۷۵۰» = 18); blank if not stated |
| `ojrat_pct` | only if the shop states it; blank otherwise |
| `condition` | `new` or `used` («دست دوم»، «کارکرده»، «قدیمی») |
| `has_stones` | true if the page lists stones or non-gold parts |

Field tie-breakers (added after the first labelling pass):
- A jewelry weight written as a whole number ≥ 100 «گرم» (e.g. «۲۵۰ گرم» for a pendant) is read as thousandths of a gram (سوت) **only if** the price fits that reading; write `weight unit read as سوت` in `notes`. If no reading fits the price, leave weight blank.
- Variant ranges (e.g. «۱٫۵۲ تا ۲٫۱۲ گرم» across sizes): leave `weight_g` blank and write the range in `notes`.
- `not_gold` rows: leave `karat` and `weight_g` blank, even if the title states them.
- «بدون اجرت» counts as a stated ojrat of `0`.
- A product page that groups costume and real-gold shops under one product: label by the majority of offers and write `mixed shops` in `notes`.

## 4. EV-QRY — writing and labelling requests

- Write requests the way a real person types them: colloquial, with typos allowed, Persian or Finglish digits.
- 20 per intent (gift, beauty/keep, savings). At least 20% must come from other people, collected verbatim with their permission and without names.
- Label each request with the chip schema v2 of PRD BR-50 (D-23). Leave a chip empty if the request does not say it.
  - `intent`: gift / beauty / savings / unknown. Low-ojrat, used or cheap words alone are **not** savings (BR-53). For `unknown`, set `expected_ask=suggest_intent` (non-blocking, D-26).
  - `item_type` (with sub-type, e.g. «دستبند زنجیری»; sets as «ست دستبند و انگشتر»), `form` only for non-jewelry forms the person names (سکه / آب‌شده / شمش / ارز); never write «جواهر».
  - Budget: `budget_max` for «تا / زیر / X دارم / با X»; `budget_min`+`budget_max` for ranges; `budget_target` for «حدود X» (the system filters ±15% and sorts by closeness); ambiguous units → `expected_ask=budget_unit`.
  - Weight: numbers only when the person gives a number (`weight_target` for «X گرمی» — filter ±10% and sort; `weight_min` for «X به بالا»); vague words → `weight_pref` light / heavy, sort only (BR-54).
  - `audience`: women / men / kids_girl / kids_boy / kids; kids only when «نوزاد» or «بچه» is said; «دختر» alone is women. `recipient`: the person named (مادر، پدر، همسر، دوست‌دختر، نامزد، خواهر، دختر، همکار، نوزاد، دوست، خودم).
  - `ojrat_max` (%): «بدون اجرت» → 2, «کم‌اجرت / اجرت کم / اجرت پایین» → 10, «زیر X درصد» → X; «کمترین اجرت» → 10 plus `ojrat_sort=asc`. `no_stones`. «ارزون» is not a chip.
  - `style`: concrete design words only; never subjective words like «شیک»، «خاص»، «مد روز»، «لاکچری» (BR-58), and never «نشان» (it means an engagement ring: use `occasion=نامزدی`).
  - `shop`, `torob_pay`, `in_person`, `city`, `occasion` (the person's own word: «روز زن»، «سالگرد ازدواج»).

## 5. EV-RNK — graded relevance

Judge each result for the request's intent, without knowing which system returned it.

| Grade | Meaning |
|---|---|
| 3 | exactly what this person asked for; would click to buy |
| 2 | fits the request with a small compromise (slightly over budget, close style) |
| 1 | same item type but misses an important condition |
| 0 | wrong item, not gold, or misleading |

Intent-specific reading: for **savings**, a piece with a much higher premium than an available alternative is at most 1; for **gift**, ojrat does not lower the grade.

## 6. EV-MCH — same item

`same` only if the two listings are the same physical design from the same maker: same gallery or brand, same item type, weight within ±0.02 g, and matching model code or images. Otherwise `different` or `unsure`.

## Revision history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-22 | First draft for Gate 2 |
| 0.2 | 2026-10-22 | Field tie-breakers from the first labelling pass; D-20 protocol |
| 0.3 | 2026-10-23 | EV-QRY chip schema v2 from the owner's review (D-23) |
| 0.4 | 2026-10-23 | Chip schema v3 from the owner's second review (D-26) |
