# Tracking plan (analytics contract)

| | |
| --- | --- |
| Status | frozen (D-29); changes only through a Change Request |
| Version | 0.4 |
| Owner | Dariush Hadipour (Data role) |
| Last updated | 2026-10-23 |
| Inputs | [PRD](../product/prd.md) v1.4 §4.2, §15; [API contract](api-contract.md) v0.4 §4.6 |
| Standard | Event names in snake_case as `<object>_<past-tense verb>`; each event answers one PRD metric; closed value lists; no personal data |

## 1. Principles

- An event exists only to answer a metric in PRD §4.2 or a need in PRD §15.
- PRD §4.1 product-quality metrics are **not** measured with events: they come from the evaluation harness ([eval plan](../qa/eval-plan.md)) and the collector run log.
- No IP address, user agent, cookie, account, or free text other than the search request itself.
- Destination: `events.sqlite` on the host disk (ADR-0003, ADR-0004); no third-party analytics.
- Every event's owner is the Data role, held by Dariush Hadipour. The owner approves any new event or property through a Change Request after the freeze.

**Envelope on every event** (API contract §4.6):

| Field | Type | Set by | Why |
|---|---|---|---|
| `event_id` | uuid | client | idempotent writes |
| `at` | ISO 8601 time, UTC | client | ordering |
| `session_id` | uuid | client, in `sessionStorage`: new per tab, gone when the tab closes, never a cookie | "per search session" denominators in PRD §4.2 without identifying anyone |
| `snapshot_id` | string \| null | client, from `/status` or the search response; null only if neither has answered yet | which data the user saw |
| `pipeline_version` | string | server, from `snapshot_id` | which rules produced the labels |
| `query_id` | uuid \| null | client, from the search response | joins events of one search |

## 2. Events

Types: `string`, `int`, `number` (decimal), `bool`; finite domains list every allowed value.

| Event | Owner | Fires when | Properties | Metric it feeds (PRD) |
|---|---|---|---|---|
| `query_submitted` | Data | `/search` returns | `text` (string, ≤ 300 chars), `intent` (gift \| beauty \| savings \| unknown), `chip_kinds` (string array of the 23 chip schema v3 kinds, API contract §3), `mode` (jewelry \| non_jewelry \| both), `llm_used` (bool), `results_real` (int), `results_mixed` (int), `results_review` (int), `excluded_count` (int), `archive_mode` (bool) | §4.2 denominators (gold search sessions); §15 intent mix and non-gold share removed |
| `chip_edited` | Data | user removes, edits or adds a chip, or answers the budget-unit question | `kind` (one of the 23 v3 kinds), `action` (remove \| edit \| add \| answer), `origin_before` (text \| user \| none) | §4.2 chip edit rate |
| `intent_suggestion_used` | Data | user taps a suggested intent chip | `intent` (gift \| beauty \| savings) | §15 how often intent is missing |
| `breakdown_opened` | Data | SC-03 opens | `product_id` (string), `rank` (int, 1-based), `label` (real \| mixed \| review) | §15 use of the price breakdown |
| `offer_clicked` | Data | «دیدن در فروشگاه» | `product_id` (string), `rank` (int, 1-based), `label` (real \| mixed \| review), `intent` (gift \| beauty \| savings \| unknown), `premium_pct` (number \| null), `torob_pay` (bool), `channel` (online \| in_person), `representative` (bool: the card's offer, or another shop picked in SC-03), `stale` (bool) | §4.2 qualified click-out rate; Torob Pay share |
| `savings_row_clicked` | Data | a savings-card row is tapped | `form` (jewelry \| used \| molten \| digital \| torob_gold), `own_product` (bool) | §4.2 Torob Gold referral rate |
| `label_reported` | Data | «برچسب اشتباه است» | `product_id` (string), `shown_label` (real \| mixed \| review), `suggested_label` (real \| mixed \| not_gold) | §4.2 wasted-click share; §15 label error signal |

`origin_before = none` is for `action = add`. `rank` counts only the main list; the «نیاز به بررسی»، «وزنشان اعلام نشده» and «اجرت قابل محاسبه نیست» sections rank from 1 on their own.

## 3. Privacy rules (never send)

IP, user agent, cookies, names, phone numbers, emails, account ids, precise location. The request text is stored only in `query_submitted`. `session_id` cannot link two tabs or two visits.

## 4. Change log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-23 | First draft from PRD §15 and chip schema v3 |
| 0.2 | 2026-10-23 | Technical review (D-28): envelope with `session_id`, `snapshot_id`, `pipeline_version`; aligned with API contract §4.6; `mode`, `results_mixed`, `archive_mode`; click-out channel, representative and stale; budget-unit answer as `chip_edited` |
| 0.4 | 2026-10-23 | Independent review: `snapshot_id` nullable before the first answer; `chip_kinds` is a string array (allowed by API §4.6); no `default` chip origin; weight section in rank note |
| 0.3 | 2026-10-23 | Freeze readiness: one naming convention (`click_out` → `offer_clicked`, `savings_card_link` → `savings_row_clicked`, `intent_suggested_used` → `intent_suggestion_used`, `label_reported_wrong` → `label_reported`); owner per event; every property typed; §4.1 metrics come from the harness, not events. `results_shown` from the Gate 2 API draft was dropped in 0.2: its counts ride on `query_submitted` |
