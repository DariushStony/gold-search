# ADR-0004: Host on Liara (Zamin plan), snapshots on its disk

- Status: proposed
- Date: 2026-10-23
- Deciders: Dariush Hadipour
- Related: D-11, D-17; NFR-06, NFR-13; TDD §8, §11; ADR-0002, ADR-0003

## Context and problem

The live demo must stay up from submission until Torob announces results (NFR-06), at the lowest cost (D-11). Users are in Iran. Snapshots arrive from the owner's machine twice a day (ADR-0002), and the events log needs persistent storage (ADR-0003). The app needs Node 22+ for built-in `node:sqlite` and TypeScript.

All prices below were read on 2026-10-23 from the linked pages.

## Decision drivers

- Monthly cost.
- Documented support for every piece the app needs: Next.js, Node 22+, a persistent disk, a way to upload files to that disk without redeploying, and a free subdomain.
- Reachable from Iran, and not blocked by an international-internet cut-off.

## Considered options

| Option | Price for 0.5 GB RAM, 0.5 vCPU | What its docs confirm | Source |
|---|---|---|---|
| 1. Liara, Next.js platform, Zamin plan | 750,000 toman/month, or 1,041/hour; 5 GB SSD; traffic unlimited | Node 20/22/24 (22 default); disks; FTP/FTPS upload to a disk; cron; free `*.liara.run` subdomain | [pricing](https://liara.ir/pricing/), [hardware plans](https://docs.liara.ir/paas/details/plans/hardware-plans/), [Node version](https://docs.liara.ir/paas/nextjs/how-tos/choose-version/), [disks](https://docs.liara.ir/paas/disks/about/), [disk FTP](https://docs.liara.ir/paas/disks/ftp-access/), [subdomain](https://docs.liara.ir/paas/domains/default-subdomain/), [traffic](https://liara.ir/landing/هاست-نکست-جی-اس-next/) |
| 2. Chabokan cloud hosting | 420,660 toman/month before tax | Next.js guide; disk and cron not checked | [pricing](https://chabokan.net/pricing/cloud-hosting/), [Next.js](https://docs.chabokan.net/cloud-hosting/nextjs/) |
| 3. Hamravesh Darkube | ≈ 459,000 toman/month from per-resource prices [estimate] | not checked | [pricing](https://hamravesh.com/pricing) |
| 4. ArvanCloud container | unknown: the pricing page returned a bot check | disks and domains documented | [docs](https://docs.arvancloud.ir/fa/cloud-container/) |
| 5. A VPS | not priced | needs OS upkeep by one person | — |

## Decision and why

Option 1.
- It is the only option whose docs confirm every need, including **FTPS upload to the disk**. That lets the owner's machine publish a snapshot without a public write endpoint (TDD §8).
- Options 2 and 3 are about 290,000–330,000 toman a month cheaper, but their disk and cron support was not checked. Saving that sum is not worth a risk to the live demo.
- Billing is hourly, so three weeks cost about 1,041 × 24 × 21 ≈ 525,000 toman. [estimate]

Settings:
- Next.js platform, Node 22.
- One 1 GB disk mounted for `snapshots/` and `events.sqlite`, taken from the plan's 5 GB ([create disk](https://docs.liara.ir/paas/disks/create/)).
- SQLite on the disk is a documented pattern ([SQLite](https://docs.liara.ir/paas/nextjs/how-tos/connect-to-db/sqlite/)).
- The host has no noindex switch, so the app sends `X-Robots-Tag: noindex` on every response through Next.js `headers()` ([Next.js headers](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)). This keeps the demo out of search results.

## Consequences

- Good: one vendor, documented paths, no ops, about 750,000 toman a month.
- Bad: the basic bundle has **no backups** ([software plans](https://docs.liara.ir/paas/details/plans/software-plans/)). Snapshots can be rebuilt from raw on the owner's machine; the owner pulls `events.sqlite` weekly.
- Bad: 0.5 GB RAM is not yet measured. If the app needs more, the Mars plan costs 1,300,000 toman a month (same pricing page).
- Unknown: whether the prices include VAT.
- Unknown: the host's free tier is suspended "until international internet is reconnected" ([free host page](https://liara.ir/products/free-cloud-host/)). That does not affect a paid plan.

## Confirmation

- At M4, measure the app's RSS with the fixture snapshot loaded; it must stay under 400 MB. M4 result: loading the whole 2026-10-23 snapshot (539 products, 3,758 rows) into Node adds about 10 MB of RSS; the full Next.js app is measured at M5.
- At M7, `GET /status` is checked hourly from outside for NFR-06.
