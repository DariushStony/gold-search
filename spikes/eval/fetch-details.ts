// Spike (PRD M2): fetches Torob product details for every row of the EV-MAT
// sheet so rows can be labelled from the full page. Resumable: skips keys
// already saved. Stops on the first anti-bot answer (BR-12).
// Run: node spikes/eval/fetch-details.ts docs/evidence/ev-mat-sheet-2026-10-22.csv
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

const TOROB_API = "https://api.torob.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const GAP_MS = 25_000;
const JITTER_MS = 4_000;

const sheet = process.argv[2];
if (!sheet) throw new Error("usage: fetch-details.ts <ev-mat-sheet.csv>");
const outDir = new URL("../../data/raw/details/", import.meta.url).pathname;
await mkdir(outDir, { recursive: true });

const keys = (await readFile(sheet, "utf8"))
  .split("\n")
  .slice(1)
  .map((line) => line.match(/,([0-9a-f-]{36}),/)?.[1])
  .filter((k): k is string => Boolean(k));

const exists = (p: string) => access(p).then(() => true, () => false);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let fetched = 0;
let skipped = 0;
for (const key of keys) {
  const file = join(outDir, `${key}.json`);
  if (await exists(file)) {
    skipped++;
    continue;
  }
  if (fetched > 0) await sleep(GAP_MS + Math.random() * JITTER_MS);
  const url = `${TOROB_API}/v4/base-product/details/?prk=${key}&source=next_desktop`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", Referer: "https://torob.com/", Origin: "https://torob.com" },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const type = res?.headers.get("content-type") ?? "";
  if (!res || res.status === 490 || !type.includes("json")) {
    console.log(JSON.stringify({ stopped: "challenged or network", status: res?.status ?? 0, fetched, skipped, remaining: keys.length - fetched - skipped }));
    process.exit(0);
  }
  if (res.ok) {
    await writeFile(file, JSON.stringify({ fetched_at: new Date().toISOString(), source: url, body: await res.json() }));
  }
  fetched++;
}
console.log(JSON.stringify({ done: true, fetched, skipped, total: keys.length }));
