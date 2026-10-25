# ADR-0011: Demo on Vercel, deployed from the owner's machine with the snapshot inside

- Status: superseded by ADR-0012 (2026-10-25): the owner chose Hamravesh before the first deploy
- Date: 2026-10-25
- Deciders: Dariush Hadipour
- Related: ADR-0004 (Liara, still the fallback), ADR-0005, ADR-0010; BR-16, BR-111; NFR-06

## Context and problem

The owner wants the online demo on Vercel, with pnpm, Prettier and oxlint in the project. ADR-0004 chose Liara for reachability from Iran and a persistent disk, at about 750,000 toman a month. Vercel's Hobby plan has no fee, but its functions run abroad on a read-only disk.

## Decision

- **Platform:** one Vercel Function (`api/index.js`) serves every path through the same handler as `pnpm demo` (`createHandler` in `src/server/app.ts`). `vercel.json` rewrites all paths except `robots.txt` to it. Region `fra1`.
- **Runtime:** Node 24, Vercel's default ([Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)), which has `node:sqlite`. `pnpm build` turns `src/` into plain JS in `dist/` with `rewriteRelativeImportExtensions`, so the function does not depend on Node stripping TypeScript.
- **Data:** the snapshot ships with each deploy (`includeFiles`). `pnpm deploy` runs from the owner's machine, which is the only place the collector can reach Torob. A new snapshot means a new deploy.
- **Upload:** `.vercelignore` is an allowlist. The CLI uploads every file not excluded there and does not read `.gitignore` ([.vercelignore](https://vercel.com/docs/deployments/vercel-ignore)), so without it `.env`, raw data and videos would be uploaded.
- **Read-only disk:** analytics events go to the function log (`eventsFile: null`) instead of `data/events/events.jsonl`. They contain no personal data (BR-111).
- **Rate limit:** behind Vercel every request comes from its proxy, so the client is the first `X-Forwarded-For` entry (`trustProxy: true`). Otherwise all visitors would share one 30-a-minute budget.
- **Gold price:** if the union board and tgju cannot be reached from the function, the newest quote in the snapshot stands in, with its own time shown.
- **AI:** `AVALAI_API_KEY` is a Vercel environment variable that the owner adds. It never enters the repo or the upload.

## Risks

- **Reachability from Iran:** a user reported that a Vercel site would not open from Iran, with no official answer on whether Vercel or Iran's filtering is the cause ([thread](https://community.vercel.com/t/website-not-accessible-need-clarification-on-ip-restrictions/12398)). Torob's reviewers may need a VPN. Liara (ADR-0004) stays the fallback.
- **Iranian sources from abroad:** the union board, tgju and AvalAI may refuse traffic from `fra1`. The demo still works: the gold price falls back to the snapshot and sentence reading falls back to rules only (BR-73).
- **Freshness:** prices age between deploys. Prices older than 24 hours show as stale, and the archive banner appears after 48 hours (BR-14, BR-16).

## Confirmation

After the first deploy:
- the page opens from Iran, with and without a VPN;
- `GET /api/v1/status` shows a live gold source, or the snapshot's quote with its time;
- `POST /api/v1/parse` on a hard sentence returns `llm_used: true`;
- the function log shows `query_submitted` events.
