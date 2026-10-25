# API contract

| | |
| --- | --- |
| Status | frozen (D-29); changes only through a Change Request |
| Version | 0.9 |
| Owner | Dariush Hadipour (Tech Lead role) |
| Last updated | 2026-10-25 |
| Inputs | [PRD](../product/prd.md) v1.4 §10, §11, §12, §15; [IA and flows](../design/ia-user-flows.md) v0.5; [content guide](../design/content-guide.md) v1.2; [data model](data-model.md) v0.4; [tracking plan](tracking-plan.md) v0.4 |
| Standard | OpenAPI 3.1 (generated from the route schemas at build time); errors as RFC 9457 problem details |

> The OpenAPI file is generated from code, and a test fails if it disagrees with the shapes below.

## 1. Conventions

- Base path `/api/v1`. JSON only. Breaking changes need `/api/v2`.
- Money: integer **toman**. Weight: grams (number, 3 decimals). Percentages: number, e.g. `34.2` means 34.2%.
- Times: ISO 8601 in UTC. The client formats Jalali dates and Tehran time (BR-49).
- Every computed number carries its inputs (BR-46): see `Breakdown.inputs`.
- Every price carries `source` and `fetched_at` (BR-13).
- Lists are paged with `page` (0-based) and `size` (max 20).
- **Determinism (NFR-05).** A response is pinned to one snapshot. The same chips on the same `snapshot_id` return the same order. Ages (BR-14) are measured against the snapshot's `finished_at`, not the request time. Only the fields marked *live* below depend on the request time.
- **Naming.** Paths in kebab-case nouns; JSON fields in snake_case; problem types in kebab-case.
- **Field names vs the data model.** Money fields drop the `_toman` suffix because money is always toman here (`offer.price_toman` → `Offer.price`, `gold_quote.value_toman` → `g_toman`). Every other field keeps the data model's name.
- **Idempotency and retries.** `POST /parse`, `POST /search`, `POST /products/{id}` and `POST /excluded` use POST only because the body carries chips. They change nothing on the server and are safe to retry. `POST /events` is idempotent on `event_id`. The API has no PUT, PATCH or DELETE.
- **Caching.** `GET /status`: `Cache-Control: max-age=60`. Every POST: `no-store`.

## 2. Authentication and limits

- **Scheme: none.** Every operation is public, with no accounts and no personal data (PRD §14). There is no credential, so no credential lifetime.
- **Per-operation access:** every operation in §4 is open to anyone. Only `POST /events` writes, and it only appends.
- Snapshots are not published over this API; they arrive over FTPS to the host disk (TDD §8).
- Rate limit per IP, in memory, never stored: 30 requests/min on `/parse`, `/search`, `/products` and `/excluded`; 120/min on `/status` and `/events`. Over the limit → `429` `rate-limited`.
- Every response sends `X-Robots-Tag: noindex`, which keeps the demo out of search results (ADR-0004).

## 3. Shared types

```ts
type Intent = "gift" | "beauty" | "savings";

type ChipKind =
  | "intent" | "item_type" | "form" | "budget_min" | "budget_max" | "budget_target"
  | "weight_min" | "weight_max" | "weight_target" | "weight_pref" | "karat" | "audience"
  | "recipient" | "condition" | "ojrat_max" | "ojrat_sort" | "no_stones" | "style" | "shop"
  | "torob_pay" | "in_person" | "city" | "occasion";            // schema v3 (BR-50, D-26)

type Chip = {
  kind: ChipKind;
  role: "filter" | "filter_and_sort" | "sort" | "info";        // fixed per kind: table below
  level: "product" | "offer";                                   // fixed per kind: table below
  value: string | number | boolean;
  origin: "text" | "user";                                      // BR-56: from the sentence, or added, edited or answered by the user
  llm?: true;                                                   // CR-05: read from the sentence by the LLM (BR-55), not the rules
  span?: [number, number];                                      // where in the text; absent for origin "user" unless answered
};
```

**Role and level per chip kind.** `/parse` sets both from this table; `/search` ignores the values a client sends and uses the table.

| Kind | Role | Level | Rule |
|---|---|---|---|
| `intent` | filter_and_sort | product | BR-53, BR-61, BR-62, BR-63 |
| `item_type`, `form`, `karat`, `audience`, `condition`, `no_stones` | filter | product | BR-50, BR-57, BR-59, BR-60 |
| `budget_min`, `budget_max` | filter | product, on the representative offer's price | BR-52, BR-60, BR-84 |
| `budget_target` | filter_and_sort | product, on the representative offer's price | BR-52 |
| `weight_min`, `weight_max` | filter | product | BR-54, BR-60 |
| `weight_target` | filter_and_sort | product | BR-54 |
| `weight_pref` | sort | product | BR-54 |
| `ojrat_max` | filter | product, on the representative offer's breakdown | BR-59 |
| `ojrat_sort` | sort | product | BR-59 |
| `style` | sort | product | BR-58, BR-62 |
| `shop`, `city`, `in_person`, `torob_pay` | filter | offer | BR-60, BR-84 |
| `recipient`, `occasion` | info | product | BR-5A |

```ts
type GoldPrice = {
  g_toman: number;                     // 18k, per gram
  source: "union" | "tgju";            // BR-01, BR-03
  quoted_at: string;
  fetched_at: string;
  other: { source: "union" | "tgju"; g_toman: number; quoted_at: string } | null;  // the second source, for BR-04
  uncertain: boolean;                  // BR-04: the two differ by more than 1%
  market_open: boolean;                // A-01: a source changed its quote in the last 30 min; false ⇒ «قیمت پایان بازار» (BR-05)
};

type SnapshotInfo = { id: string; finished_at: string; pipeline_version: string; archive_mode: boolean };   // BR-16

type Breakdown = {                     // one per offer (BR-48)
  gold_value: number;                  // BR-40, at the G of this offer's fetch
  premium_pct: number;                 // BR-41, same G
  implied_ojrat_pct: number | null;    // BR-43; null when partial_reason is set
  declared_ojrat_pct: number | null;   // BR-24
  parts: { gold: number; ojrat: number; profit: number; vat: number } | null;   // toman; sum = offer price; never negative; null when partial_reason or no_split_reason is set
  no_split_reason: "below_gold_value" | "thin_margin" | null;   // CR-10: splitting would need a negative ojrat (price under the gold value, or margin under the assumed profit)
  breakeven_g: number;                 // BR-45; does not depend on G
  resale_value: number;                // BR-42 at the same G as the price (CR-07)
  resale_loss_pct: number;             // CR-07: 1 − resale ÷ price, buying and selling at once; holds whatever gold has done since
  required_rise_pct: number;           // breakeven_g ÷ the same G − 1 (BR-45, CR-07)
  vat_overcharge: boolean;             // BR-47
  partial_reason: "non_gold_parts" | null;   // BR-2A
  inputs: {
    weight_g: number; weight_source: "spec" | "title" | "llm"; weight_conflict: boolean;   // PRD §12: title and specs disagree
    karat: number; karat_assumed: boolean;                                                // BR-23
    g_at_fetch: { toman: number; source: "union" | "tgju"; quoted_at: string };
    g_live: { toman: number; source: "union" | "tgju"; quoted_at: string } | null;
    vat: number; profit: number;       // BR-44, A-02
  };
};

type Offer = {
  shop: string | null;                 // null = search card that says «در N فروشگاه» and matched no details offer (BR-84)
  city: string | null;                 // Torob `shop_name2`
  channel: "online" | "in_person";     // Torob tab «خرید اینترنتی» or «خرید حضوری»
  price: number;
  url: string;                         // Torob's own redirect to the shop; the Torob product page when shop is null (BR-110)
  source: "torob_search" | "torob_details";
  fetched_at: string;
  stale: boolean;                      // older than 24 h before snapshot.finished_at; always false in archive mode (BR-14, BR-16)
  torob_pay: boolean;                  // BR-112
  shop_stars: number | null;           // Torob's star score; null when Torob shows none (marketplace, new shop, in person) (BR-62, CR-09)
  shop_months: number | null;          // time on Torob; 0 for «فروشگاه جدید», null when not shown (BR-62, CR-09)
  breakdown: Breakdown | null;
  no_breakdown_reason: "weight_unknown" | "no_gold_quote" | null;   // BR-37; DM-01 (no quote within 60 min of the fetch)
};

type Label = "real" | "mixed" | "not_gold" | "review";

type ComponentName = "budget_fit" | "weight_fit" | "type_style_fit" | "seller_trust"
  | "newness" | "low_premium" | "weight_known" | "freshness";   // formulas in PRD BR-62

type ProductCard = {
  id: string;                          // Torob random_key
  title: string; image_url: string | null; item_type: string | null; gallery: string | null;
  label: Label; reasons: string[];     // BR-38
  weight_unknown: boolean;             // BR-37
  sample: boolean;                     // BR-15: sample data, shown with «نمونه»
  offer: Offer;                        // the representative offer (BR-84)
  offer_count: number;                 // eligible offers after offer-level filters
  price_range: [number, number];       // min and max over eligible offers (BR-80, BR-92)
  score: number;
  components: { name: ComponentName; weight: number; value: number }[];   // BR-62, BR-66; weight 0 for a style or weight the sentence did not ask for (CR-09)
};
```

## 4. Resources

### 4.1 `GET /status`

What every page needs before any search: the reference gold price and the snapshot state, so the header and the archive banner (BR-16) show on every page. Also used by the hourly uptime check (NFR-06).

```ts
type StatusResponse = {
  gold_price: GoldPrice | null;        // live; null when no source answers (PRD §12)
  snapshot: SnapshotInfo | null;       // null before the first publish
  snapshot_age_h: number | null;
  gold_price_age_min: number | null;
};
```

`200` always, even when parts are null.

### 4.2 `POST /parse`

Free text → chips (BR-50–BR-5A). Called while typing, after a pause (BR-51).

```ts
type ParseRequest = {
  text: string;                                          // ≤ 300 chars
  answers?: { budget_unit?: "thousand" | "million" };    // reply to ask.budget_unit
};
type ParseResponse = {
  chips: Chip[];
  intent: Intent | "unknown";        // read-only, derived from the intent chip
  suggest_intent: boolean;           // BR-53: show three optional intent chips; never blocks
  ask: { kind: "budget_unit"; span: [number, number] } | null;   // BR-52: the only blocking question
  mode: "jewelry" | "non_jewelry" | "both";                      // BR-57, from form chips
  llm_used: boolean;                 // BR-55
  unparsed: string | null;           // CR-04: words no rule read, shown as TX-100; null when every word was read
};
```

`200` → `ParseResponse`. `422` → `invalid-request`. If the LLM fails, the rules-only result comes back with `llm_used: false` (BR-73), never an error.

**Budget-unit flow (BR-52).** The block is in the client: while `ask` is set, the UI shows «منظورتان هزار تومان است یا میلیون؟» with two buttons and does not call `/search`. The tap calls `/parse` again with the same text and `answers.budget_unit`; the budget chip comes back with `origin: "user"`. The server cannot see an unanswered question, since an unanswered amount simply has no chip.

### 4.3 `POST /search`

```ts
type SearchRequest = { chips: Chip[]; snapshot_id?: string; page?: number; size?: number };
type SearchResponse = {
  query_id: string;                  // uuid for analytics joins; the server keeps no state under it
  snapshot: SnapshotInfo;
  gold_price: GoldPrice | null;      // live; null when no source answers (PRD §12)
  intent: Intent | "unknown";        // derived from the chips
  suggest_intent: boolean;           // BR-53
  mode: "jewelry" | "non_jewelry" | "both";   // BR-57
  results: ProductCard[];            // "real" (+ "mixed" for gift), BR-61; empty when mode = non_jewelry
  review: ProductCard[];             // «نیاز به بررسی»
  weight_unknown_bucket: ProductCard[];   // BR-54: a weight filter is on and these have no weight
  ojrat_unknown: ProductCard[];      // BR-59: an ojrat filter is on and these cannot be checked
  sponsored: ProductCard[];          // BR-64, never mixed into results
  excluded_count: number;            // BR-39
  explanation: { text: string; numbers: number[]; template: boolean } | null;   // BR-70–BR-73
  savings_card: {
    notice: "non_jewelry_not_ranked" | null;    // BR-57
    rows: { form: "jewelry" | "used" | "molten" | "digital" | "torob_gold"; round_trip_cost_pct: number | null;
            source: string; source_url: string | null; url: string | null; as_of: string; own_product: boolean }[];
  } | null;                          // BR-100–BR-102, BR-121; present for savings intent or mode ≠ jewelry
  relax: { chip_index: number; kind: ChipKind; results_if_removed: number } | null;   // BR-67: index into the request's chips
};
```

- The intent comes only from the chips; there is no separate `intent` field in the request.
- A product with no weight goes to `weight_unknown_bucket` when a weight filter is on; if an ojrat filter is also on, it goes there and not to `ojrat_unknown`.
- `snapshot_id` omitted ⇒ the active snapshot. A pinned id that has been rotated out ⇒ `410` `snapshot-expired`; the client retries without it.
- `200` → `SearchResponse`. `422` → `invalid-request`. `503` → `no-snapshot`.

### 4.4 `POST /products/{id}`

Detail for SC-03. The body repeats the search inputs, so offer-level filters pick the same representative offer and the score matches the card (BR-84).

```ts
type ProductRequest = { chips: Chip[]; snapshot_id: string };
type ProductResponse = ProductCard & {
  offers: Offer[];                   // every eligible offer, cheapest first (BR-80, BR-92)
  history: { date: string; shop: string; premium_pct: number; g_toman: number }[];   // BR-90
  shop_avg: { shop: string; days: 7 | 30; premium_pct: number; n: number }[];       // BR-91; only n ≥ 5
};
```

`200`; `404` → `not-found` (unknown id, or no eligible offer under these chips); `410` → `snapshot-expired`; `422` → `invalid-request`.

### 4.5 `POST /excluded`

Non-gold products removed from a search, with reasons (BR-39). The server is stateless, so the request repeats the search inputs.

```ts
type ExcludedRequest = { chips: Chip[]; snapshot_id: string; page?: number; size?: number };
type ExcludedResponse = { total: number; items: { id: string; title: string; price: number; shop: string | null; reasons: string[] }[] };
```

`200`; `410` → `snapshot-expired`; `422` → `invalid-request`.

### 4.6 `POST /events`

```ts
type Event = {
  event_id: string;                  // uuid; idempotent
  name: "query_submitted" | "chip_edited" | "intent_suggestion_used" | "breakdown_opened"
      | "offer_clicked" | "savings_row_clicked" | "label_reported";
  at: string;
  session_id: string;                // random uuid in sessionStorage; dies with the tab; never a cookie
  snapshot_id: string | null;        // null before the first search (e.g. chip edits on SC-01)
  query_id: string | null;
  props: Record<string, string | number | boolean | null | string[]>;   // per event: tracking plan §2
};
```

`202`. The server adds `pipeline_version` from `snapshot_id` (null when `snapshot_id` is null). Properties never contain personal data (BR-111).

The methodology page (SC-05, BR-122) is not an API resource: it is a static page built at each release from the evaluation harness output (ADR-0008).

## 5. Error model (RFC 9457)

| type | status | when | client does | user text ([content guide](../design/content-guide.md) §5) |
|---|---|---|---|---|
| `invalid-request` | 422 | body fails validation (text over 300 chars, unknown chip kind, missing `snapshot_id` where required) | show the message; keep the user's text | TX-80 (text too long), TX-81 (other) |
| `not-found` | 404 | unknown product id, or no eligible offer under the chips | go back to results | TX-82 |
| `snapshot-expired` | 410 | pinned snapshot was rotated out (data model §3) | retry once without `snapshot_id` | none |
| `rate-limited` | 429 | over the per-IP limit | wait `Retry-After` seconds | TX-83 |
| `no-snapshot` | 503 | `/search` before any snapshot was published | show the message | TX-84 |
| `internal` | 500 | anything else | offer «دوباره امتحان کنید» | TX-85 |

Problem body: `{ "type": "https://<host>/problems/<type>", "title": string, "status": number, "detail": string }`. `detail` is for logs; the client shows the content-guide text, never `detail`.

Not errors:
- No gold price: `gold_price: null` in `/status` and `/search`, shown with TX-40 and TX-41 (PRD §12).
- The LLM gateway down: responses degrade to rules and templates (BR-73).

## 6. Sequences

1. **Page load:** `GET /status` → header gold price, archive banner (BR-16).
2. **Typing:** debounce → `POST /parse` → chips render → user edits chips (FL-05). If `ask` is set: answer → `POST /parse` with `answers`.
3. **Search:** `POST /search` with chips → results. `mode: non_jewelry` → savings card only (FL-09).
4. **Detail and click-out:** `POST /products/{id}` with the same chips and `snapshot_id` → `POST /events` (`breakdown_opened`) → «دیدن در فروشگاه» → `POST /events` (`offer_clicked`) → navigate to `offer.url`.
5. **Excluded:** «{n} مورد غیرطلا کنار گذاشته شد» → `POST /excluded` with the same chips and `snapshot_id` (FL-06).

## 7. Compatibility

- Additive fields do not change the version. Removing or renaming a field, or changing a unit, needs `/api/v2`.
- `/api/v1` stays up until the review period ends (NFR-06). If a `/api/v2` ever ships, v1 keeps running alongside it for at least 14 days, and its responses carry a `Deprecation` header with the end date.
- After the stage-04 freeze, any change to this contract needs a Change Request.
- OpenAPI is generated from the route schemas; a test fails if this document's shapes disagree with it.

## 8. Examples

One example per operation. Product and prices are real Torob data from the 2026-10-22 snapshot. The live gold price of 27,100,000, the ids and the excluded item are made up for the example.

**`GET /status`** → `200`

```json
{ "gold_price": { "g_toman": 27100000, "source": "union", "quoted_at": "2026-10-23T08:00:00Z", "fetched_at": "2026-10-23T08:01:00Z",
    "other": { "source": "tgju", "g_toman": 27120000, "quoted_at": "2026-10-23T07:59:00Z" }, "uncertain": false, "market_open": true },
  "snapshot": { "id": "2026-10-22T06:45:04.950Z", "finished_at": "2026-10-22T07:05:00Z", "pipeline_version": "0.1.0", "archive_mode": false },
  "snapshot_age_h": 25.0, "gold_price_age_min": 1 }
```

**`POST /parse`** `{ "text": "۶۰ میلیون دارم، النگوی کم‌اجرت که موقع فروش کمتر ضرر کنم" }` → `200`

```json
{ "chips": [
    { "kind": "item_type", "role": "filter", "level": "product", "value": "النگو", "origin": "text", "span": [16, 21] },
    { "kind": "budget_max", "role": "filter", "level": "product", "value": 60000000, "origin": "text", "span": [0, 14] },
    { "kind": "ojrat_max", "role": "filter", "level": "product", "value": 10, "origin": "text", "span": [23, 30] },
    { "kind": "intent", "role": "filter_and_sort", "level": "product", "value": "savings", "origin": "text", "span": [44, 56] } ],
  "intent": "savings", "suggest_intent": false, "ask": null, "mode": "jewelry", "llm_used": false, "unparsed": null }
```

**`POST /parse`** `{ "text": "یه انگشتر زیر ۳۰۰" }` → `200` with `"ask": { "kind": "budget_unit", "span": [10, 17] }` and no budget chip. Then `{ "text": "یه انگشتر زیر ۳۰۰", "answers": { "budget_unit": "million" } }` → the `budget_max` chip `300000000` with `"origin": "user"`.

**`POST /search`** `{ "chips": [ …the four chips above… ] }` → `200` (one result shown)

```json
{ "query_id": "5b0f0c6e-0000-4000-8000-000000000001",
  "snapshot": { "id": "2026-10-22T06:45:04.950Z", "finished_at": "2026-10-22T07:05:00Z", "pipeline_version": "0.1.0", "archive_mode": false },
  "gold_price": { "g_toman": 27100000, "source": "union", "quoted_at": "2026-10-23T08:00:00Z", "fetched_at": "2026-10-23T08:01:00Z", "other": null, "uncertain": false, "market_open": true },
  "intent": "savings", "suggest_intent": false, "mode": "jewelry",
  "results": [ {
    "id": "20dabcf0-56fe-42bd-b4e7-c3d55938929a", "title": "النگو طلا ۱۸ عیار آیینه ای بدون اجرت",
    "image_url": "https://image.torob.com/base/images/IT/2a/IT2ajv_0QOEDEu73.jpg", "item_type": "النگو", "gallery": null,
    "label": "real", "reasons": ["واژه‌ی طلا و عیار در عنوان؛ قیمت با ارزش طلا سازگار است"], "weight_unknown": false, "sample": false,
    "offer": { "shop": "فرنیا گلد", "city": "تهران", "channel": "online", "price": 49179516,
      "url": "https://api.torob.com/v4/product-page/redirect/…", "source": "torob_search", "fetched_at": "2026-10-22T06:47:12Z",
      "stale": false, "torob_pay": false, "shop_stars": 5, "shop_months": 6, "no_breakdown_reason": null,
      "breakdown": { "gold_value": 45928900, "premium_pct": 7.1, "implied_ojrat_pct": -0.5, "declared_ojrat_pct": null,
        "parts": null, "no_split_reason": "thin_margin",
        "breakeven_g": 29320061, "resale_value": 45316515, "resale_loss_pct": 7.9, "required_rise_pct": 8.5, "vat_overcharge": false, "partial_reason": null,
        "inputs": { "weight_g": 1.7, "weight_source": "spec", "weight_conflict": false, "karat": 18, "karat_assumed": false,
          "g_at_fetch": { "toman": 27017000, "source": "union", "quoted_at": "2026-10-22T06:40:00Z" },
          "g_live": { "toman": 27100000, "source": "union", "quoted_at": "2026-10-23T08:00:00Z" }, "vat": 10, "profit": 7 } } },
    "offer_count": 1, "price_range": [49179516, 49179516], "score": 0.916,
    "components": [ { "name": "budget_fit", "weight": 0.105, "value": 1 }, { "name": "seller_trust", "weight": 0.105, "value": 0.625 },
      { "name": "type_style_fit", "weight": 0, "value": 1 }, { "name": "low_premium", "weight": 0.632, "value": 0.929 },
      { "name": "weight_known", "weight": 0.105, "value": 1 }, { "name": "freshness", "weight": 0.053, "value": 1 } ] } ],
  "review": [], "weight_unknown_bucket": [], "ojrat_unknown": [], "sponsored": [], "excluded_count": 3,
  "explanation": null,
  "savings_card": { "notice": null, "rows": [ { "form": "jewelry", "round_trip_cost_pct": 7.1, "source": "این نتایج", "source_url": null, "url": null, "as_of": "2026-10-22", "own_product": false } ] },
  "relax": null }
```

Notes on the example:
- `shop_stars` 5 and `shop_months` 6 are illustrative: seller trust 0.5 × 1 + 0.5 × 6 ÷ 24 = 0.625.
- The breakdown follows BR-40 to BR-45 from the inputs shown. The price is 7.1% over the gold value, less than the assumed 7% profit plus VAT, so the implied ojrat is slightly negative: `parts` is null with `no_split_reason: "thin_margin"`, and the page shows one amount for ojrat, profit and VAT (CR-10).
- The score is the BR-62 savings weights times the component values (0.916). The sentence names no style, so `type_style_fit` has weight 0 and the other savings weights are divided by 0.95 (CR-09).
- The jewelry savings row is the median premium of the results (BR-100).
- `explanation` is null because there is only one result (PRD §12).

**`POST /products/20dabcf0-56fe-42bd-b4e7-c3d55938929a`** `{ "chips": [ … ], "snapshot_id": "2026-10-22T06:45:04.950Z" }` → `200`: the card above plus `"offers": [ …one Offer… ]`, `"history": [ { "date": "2026-10-22", "shop": "فرنیا گلد", "premium_pct": 7.1, "g_toman": 27017000 } ]`, `"shop_avg": []` (fewer than 5 observations, BR-91).

**`POST /excluded`** `{ "chips": [ … ], "snapshot_id": "2026-10-22T06:45:04.950Z" }` → `200`

```json
{ "total": 3, "items": [ { "id": "…", "title": "النگو ژوپینگ طرح طلا", "price": 850000, "shop": "…", "reasons": ["در عنوان آمده: ژوپینگ"] } ] }
```

**`POST /events`** → `202`

```json
{ "event_id": "9a1c…", "name": "offer_clicked", "at": "2026-10-23T08:02:10Z", "session_id": "c41e…",
  "snapshot_id": "2026-10-22T06:45:04.950Z", "query_id": "5b0f0c6e-0000-4000-8000-000000000001",
  "props": { "product_id": "20dabcf0-56fe-42bd-b4e7-c3d55938929a", "rank": 1, "label": "real", "intent": "savings",
    "premium_pct": 7.1, "torob_pay": false, "channel": "online", "representative": true, "stale": false } }
```

**An error:** `POST /parse` with a 400-character text → `422`

```json
{ "type": "https://<host>/problems/invalid-request", "title": "Invalid request", "status": 422, "detail": "text: max 300 characters" }
```

## Revision history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-22 | First draft for Gate 2 |
| 0.2 | 2026-10-23 | Technical review (D-28): representative offer and per-offer breakdown; live vs fetch-time G; nullable gold price; chip `level` and `origin: user`; intent only in chips; budget-unit flow; `mode` for BR-57; stateless `POST /excluded`; events aligned with the tracking plan, with `session_id`; `410 snapshot-expired`; `/healthz` |
| 0.3 | 2026-10-23 | Freeze readiness: naming, field mapping to the data model, retry safety and caching per operation; explicit auth statement; user text per error; deprecation rule; event names; one example per operation (§8) |
| 0.4 | 2026-10-23 | Freeze review fixes: product detail is `POST /products/{id}` with chips (offer filters and score match the card); `GET /status` replaces `/gold-price` and `/healthz` and carries the snapshot state for the archive banner; methodology is a static page, not an endpoint; role and level fixed per chip kind; `origin` is text or user; budget question blocks only in the client (no 422); `partial_reason` only for non-gold parts; `parts`, `no_breakdown_reason`, `weight_conflict`, `sample`, `weight_unknown_bucket`; savings rows with `source_url` and `url`; `relax` names the chip and the results it would bring back; event `snapshot_id` nullable and `string[]` props; error example on `/parse`; `gold-price-unavailable` dropped (null instead) |
| 0.5 | 2026-10-24 | CR-04: `unparsed` on the `/parse` response |
| 0.6 | 2026-10-24 | CR-05: optional `llm` flag on chips the LLM added |
| 0.7 | 2026-10-25 | CR-07: resale and rise at the fetch-time G, new `resale_loss_pct` |
| 0.9 | 2026-10-25 | CR-10: `no_split_reason`; `parts` is never negative |
| 0.8 | 2026-10-25 | CR-09: `shop_stars` and `shop_months` replace `shop_score_pct`; weight 0 in `components` for a style or weight the sentence did not ask for |
