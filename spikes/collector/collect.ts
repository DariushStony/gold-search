// Spike (D-12): throwaway collector that builds a dated price history for gold
// jewelry before the real pipeline exists. Run: node spikes/collector/collect.ts
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const TOROB_API = "https://api.torob.com";
const GOLD_PRICE_URL = "https://call1.tgju.org/ajax.json";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Torob answers bots with HTTP 490 + arCAPTCHA, not 429, and the wall needs
// minutes of silence to clear, so pace slowly and stop at the first sign of it.
const GAP_MS = 10_000;
const JITTER_MS = 5_000;
const PAGES_PER_QUERY = 2;
const PAGE_SIZE = 24;

const QUERIES = [
  "دستبند طلا",
  "انگشتر طلا",
  "گردنبند طلا",
  "گوشواره طلا",
  "النگو طلا",
  "زنجیر طلا",
  "پلاک طلا",
  "آویز طلا",
  "سرویس طلا",
  "طلای آب شده",
  "طلای دست دوم",
];

const GOLD_KEYS = ["geram18", "geram24", "mesghal", "sekee", "nim", "rob", "gerami", "ons", "price_dollar_rl"];

type Fetched =
  | { kind: "ok"; status: number; body: unknown }
  | { kind: "challenged" | "non_json" | "network" | "error"; status: number; note: string };

const startedAt = new Date();
const runId = startedAt.toISOString();
const dir = join(new URL("../../data/raw/", import.meta.url).pathname, runId.slice(0, 10));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pace = () => sleep(GAP_MS + Math.random() * JITTER_MS);

async function write(file: string, row: Record<string, unknown>) {
  await appendFile(join(dir, file), JSON.stringify({ run_id: runId, ...row }) + "\n");
}

async function getJson(url: string, headers: Record<string, string>): Promise<Fetched> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(20_000) });
    const type = res.headers.get("content-type") ?? "";
    if (res.status === 490) return { kind: "challenged", status: res.status, note: "anti-bot challenge" };
    if (res.ok && !type.includes("json")) return { kind: "non_json", status: res.status, note: type };
    if (!res.ok) return { kind: "error", status: res.status, note: res.statusText };
    return { kind: "ok", status: res.status, body: await res.json() };
  } catch (err) {
    return { kind: "network", status: 0, note: String(err) };
  }
}

async function collectGoldPrice() {
  const got = await getJson(GOLD_PRICE_URL, { Accept: "application/json" });
  if (got.kind !== "ok") {
    await write("runs.jsonl", { step: "gold_price", ...got, fetched_at: new Date().toISOString() });
    return;
  }
  const current = (got.body as { current?: Record<string, unknown> }).current ?? {};
  const prices = Object.fromEntries(GOLD_KEYS.filter((k) => k in current).map((k) => [k, current[k]]));
  await write("gold-price.jsonl", { source: GOLD_PRICE_URL, unit: "rial", fetched_at: new Date().toISOString(), prices });
}

// Only endpoints api.torob.com/robots.txt allows: /v4/base-product/search and /details.
async function collectListings(): Promise<{ requests: number; results: number; stopped: string | null }> {
  const headers = { Accept: "application/json", Referer: "https://torob.com/", Origin: "https://torob.com" };
  let requests = 0;
  let results = 0;
  for (const q of QUERIES) {
    for (let page = 0; page < PAGES_PER_QUERY; page++) {
      if (requests > 0) await pace();
      const params = new URLSearchParams({ q, page: String(page), size: String(PAGE_SIZE), sort: "", source: "next_desktop" });
      const url = `${TOROB_API}/v4/base-product/search/?${params}`;
      const got = await getJson(url, headers);
      requests++;
      const fetchedAt = new Date().toISOString();
      if (got.kind !== "ok") {
        await write("runs.jsonl", { step: "search", q, page, ...got, fetched_at: fetchedAt });
        // BR-12: 490, non-JSON or no network ends the run; other HTTP errors skip one page.
        if (got.kind !== "error") return { requests, results, stopped: `${got.kind} at q="${q}" page=${page}` };
        continue;
      }
      const body = got.body as { count?: number; results?: unknown[] };
      const rows = Array.isArray(body.results) ? body.results : [];
      results += rows.length;
      await write("torob-search.jsonl", { source: url, q, page, fetched_at: fetchedAt, total_count: body.count ?? null, results: rows });
      if (rows.length < PAGE_SIZE) break;
    }
  }
  return { requests, results, stopped: null };
}

await mkdir(dir, { recursive: true });
await collectGoldPrice();
const listings = await collectListings();
// A second quote bounds the run, so every offer gets a G within 60 min of its fetch (DM-01).
await collectGoldPrice();
await write("runs.jsonl", {
  step: "summary",
  started_at: runId,
  finished_at: new Date().toISOString(),
  ...listings,
});
console.log(JSON.stringify({ runId, ...listings }));
