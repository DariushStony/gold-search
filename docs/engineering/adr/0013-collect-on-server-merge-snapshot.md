# ADR-0013: Collect on the server, and merge each run into the current snapshot

- Status: accepted (2026-10-25)
- Date: 2026-10-25
- Deciders: Dariush Hadipour
- Related: supersedes the collection part of ADR-0002 and the data part of ADR-0012; ADR-0003 (SQLite snapshots); ADR-0009 (polite crawling); CR-16, CR-17; BR-10–BR-17; DM-01

## Context and problem

Fresh data depended on the owner's machine: a scheduler ran the collector there twice a day, and the live site only changed when the owner ran `pnpm snapshot:release` and pushed. The demo must stay fresh for weeks of review without that machine (NFR-06).

ADR-0002 expected Torob to wall a datacenter address the way it walls some networks. CR-16 measured it: one search request from the Darkube app (egress 95.128.194.46) on 2026-10-25 at 17:01 UTC got HTTP 200 with 26 results in 909 ms.

A snapshot is built from every raw file collected so far: about 380 details pages from several runs (21 MB of raw data on 2026-10-25). One run fetches the search pages and at most 40 details pages. A container has no raw history and, on Darkube, no disk (ADR-0012), so a snapshot built from one run alone would be poorer than the one it replaces.

## Decision drivers

- No dependency on the owner's machine, and nothing new for the owner to set up or pay for.
- The served snapshot never gets worse: a failed or partial run keeps what is there.
- Same politeness as today (ADR-0009, BR-10–BR-12): robots.txt checked first, at least 10 s between searches and 25 s between details pages, stop on the first HTTP 490.
- Raw Torob responses stay out of the public repo.

## Options

| Option | Good | Bad |
|---|---|---|
| 1. Hamravesh Object Storage for raw data | The pipeline is unchanged; raw data survives restarts | The owner creates a bucket and keys and pays for it; S3 signing code; one more service to trust |
| 2. **Each run merges into the current snapshot** | No new service; the snapshot stays one file | The snapshot must carry the inputs it was built from; a restart falls back to the snapshot in the image |
| 3. GitHub Actions on a schedule | Free | Runners are outside Iran, where Torob walls traffic (ADR-0002); every run becomes a commit and a deploy |
| 4. Keep the owner's machine | Works today | The problem this ADR exists to solve |

## Decision

Option 2.

- **The snapshot carries its inputs (schema v3).** Two new tables: `source_card`, every search card seen, and `source_details`, the newest details page per product, trimmed to the fields the pipeline reads (specs and the shops' offers). Gold quotes are already in `gold_quote`. These are the same facts the snapshot already publishes in `product` and `offer`, not the raw API responses.
- **Merge.** A build takes the inputs of a base snapshot plus a raw directory: cards are joined, the newer details page wins, quotes are joined, and the newest finished run becomes the snapshot's run. Building from a base plus new raw gives the same snapshot as building from all the raw at once, and a test holds that.
- **Schedule.** In production (`NODE_ENV=production`, unless `COLLECT=off`) the server runs the collector at 10:15 and 18:15 Tehran time into a temporary directory, builds a new snapshot from the served one plus that run, and swaps it in memory. Runs never overlap. If a slot passed after the snapshot it starts with was built, as after a deploy, the first run starts two minutes after the server does.
- **Swap rules.** A run that stopped before any search page (robots.txt, network, a wall at the first request) builds nothing. A new snapshot replaces the served one only if it loads and keeps at least 90% of its products. Otherwise the served one stays and the reason is reported.
- **Visibility.** `GET /status` reports the last run (start, end, requests, details fetched, why it stopped, whether it swapped) and the next one.
- **Page.** A product opened after a swap may carry the old snapshot id. The page then asks again without it instead of failing silently.

## Consequences

- Good: the live site refreshes twice a day with no one involved, and every card price is fresh after each run.
- Good: nothing runs on the owner's machine any more. Its scheduled job and `pnpm snapshot:release` were removed on 2026-10-25; the committed `deploy/snapshot.sqlite` stays as the seed every restart merges into.
- Bad: a restart or deploy goes back to the snapshot in the image until the next run. Card prices recover in one run; details pages refill at 40 per run.
- Bad: the snapshot grows with `source_card` (about 550 rows per run) and `source_details` (one row per product). On 2026-10-25 it went from 2.0 MB to 7.5 MB, and it grows by a few hundred KB a day.
- Bad: sustained collection from the datacenter is untested. A single request worked; a full run is about 60 requests over 45 minutes. A wall stops the run and keeps the served snapshot.
- Neutral: Torob's terms on automated collection are unchanged by where the collector runs. The same robots.txt rules and pacing apply.

## Confirmation

- Test: a snapshot built from raw days 1–2, then merged with day 3, equals one built from days 1–3.
- Test: a run that stopped at robots.txt builds nothing; a snapshot with under 90% of the products is not swapped.
- After deploy: the first scheduled run appears in `GET /status` with `swapped: true`, and the snapshot's run id changes.
