# ADR-0012: Demo on Hamravesh Darkube, built from a private Git repo

- Status: accepted (2026-10-25), live at zarsanj.darkube.ir since 2026-10-25
- Date: 2026-10-25
- Deciders: Dariush Hadipour
- Related: supersedes ADR-0011 (Vercel); ADR-0004 (Liara); ADR-0005; BR-14, BR-16, BR-111; NFR-06

## Context and problem

The owner chose Hamravesh's Darkube for the online demo instead of Vercel (ADR-0011), before the first deploy. Darkube runs in Iran, so reviewers in Iran can reach it, and the Iranian sources (union board, tgju, AvalAI) are close.

## Options

| Way to deploy | Fit | Source |
|---|---|---|
| 1. Git repo with a Dockerfile | Darkube builds the Dockerfile; GitHub or HamGit; you choose the branch; it redeploys on every push | [Git source](https://docs.hamravesh.com/products/darkube/create/git-repo/intro/), [GitHub](https://docs.hamravesh.com/products/darkube/create/git-repo/github/) |
| 2. Docker image | the image must be public, so the code and data would be public | [Docker image](https://docs.hamravesh.com/products/darkube/create/docker-image/intro/) |

## Decision

Option 1, from a private GitHub repo, branch `main`, auto-deploy on.
- **Image (multistage, 2026-10-25):** `deps` installs the dev tools from the lockfile; `build` runs typecheck, lint and tests, then bundles the server (`dist/server.js`) and the page (`dist/web`) with esbuild; `runtime` (`node:24-alpine`, user `node`) holds only `dist` and the snapshot, about 2.2 MB on top of Node. A failing test stops the deploy. The build now needs the npm registry; if Darkube's builder cannot reach it, the fallback is the previous single stage, which ran the sources with no install. `.dockerignore` is an allowlist, so `.env`, raw data and videos never reach the build.
- **Data:** the snapshot is committed as `deploy/snapshot.sqlite` (about 2 MB). `pnpm snapshot:release` copies the latest snapshot there and commits it. A push then redeploys. Only the owner's machine can reach Torob, so it stays the collector.
- **No disk:** a Darkube disk ends zero-downtime updates and has no documented upload path ([disks](https://docs.hamravesh.com/products/darkube/manage/disk/)). Analytics events go to the app log instead (`EVENTS_FILE=-`). They contain no personal data (BR-111).
- **Settings:** `PORT=8000`, `WEB_DIR=/app/dist/web`, `TRUST_PROXY=1` (the client is the first `X-Forwarded-For` entry behind the ingress), and `AVALAI_API_KEY` as a Darkube environment variable that the owner adds.
- **Gold price:** if the live sources fail, the newest quote in the snapshot stands in, with its own time.
- **Plan:** the smallest the console offers. Iran datacenter prices: 595,000 toman per vCPU, 290,000 per GB RAM and 16,500 per GB SSD a month ([pricing](https://hamravesh.com/pricing)). The app adds about 10 MB of memory over Node for a snapshot (ADR-0004 M4 result).

## Risks

- **Base image pull:** Docker Hub refuses Iranian IPs. Darkube's builder must pull `node:24-alpine` through a mirror; if the first build fails on the pull, the fix is Hamravesh's mirror image name from their support.
- **Data in the repo:** the snapshot holds Torob listings. The repo is private now; when it is made public at submission, the data goes with it.
- **Freshness:** prices age between releases. Prices older than 24 hours show as stale, and the archive banner appears after 48 hours (BR-14, BR-16).

## Confirmation

After the first deploy:
- the page opens from Iran without a VPN;
- `GET /api/v1/status` shows a live gold source;
- `POST /api/v1/parse` on a hard sentence returns `llm_used: true`;
- the app log shows `query_submitted` events.

Checked locally on 2026-10-25: the image builds, and the container serves the page, the gold price (tgju), AI chips, search (11 results) and events to stdout.
