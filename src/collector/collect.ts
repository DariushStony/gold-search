// K-01: twice-daily collector. Search pages, then up to 40 details
// pages in the BR-17 order, gold prices from both sources around them.
// Run: node src/collector/collect.ts
import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const TOROB_API = "https://api.torob.com";
const ROBOTS_URL = `${TOROB_API}/robots.txt`;
const SEARCH_PATH = "/v4/base-product/search/";
const DETAILS_PATH = "/v4/base-product/details/";
const UNION_URL = "https://www.estjt.ir/wp-admin/admin-ajax.php";
const TGJU_URL = "https://call1.tgju.org/ajax.json";
const TGJU_KEYS = ["geram18", "geram24", "mesghal", "sekee", "gold_740k"];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TOROB_HEADERS = { Accept: "application/json", Referer: "https://torob.com/", Origin: "https://torob.com" };

// BR-11 and TC-03: Torob walls fast clients with HTTP 490 and needs minutes of silence to clear.
const SEARCH_GAP_MS = 10_000;
const DETAILS_GAP_MS = 25_000;
const JITTER_MS = 5_000;
const GOLD_EVERY_DETAILS = 10; // keeps every offer within 60 min of a quote (DM-01)

export const QUERIES = ["دستبند طلا", "انگشتر طلا", "گردنبند طلا", "گوشواره طلا", "النگو طلا", "زنجیر طلا", "پلاک طلا", "آویز طلا", "سرویس طلا", "طلای آب شده", "طلای دست دوم"];

export type HttpResponse = { status: number; contentType: string; json(): Promise<unknown>; text(): Promise<string> };
export type Http = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => Promise<HttpResponse>;
export type Deps = {
  http: Http;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  random: () => number;
  write: (file: "gold-price.jsonl" | "torob-search.jsonl" | "runs.jsonl", row: object) => Promise<void>;
  saveDetails: (key: string, record: object) => Promise<void>;
  detailsIndex: () => Promise<Map<string, string>>; // product key → fetched_at of its details page
};
export type Options = { queries: string[]; pagesPerQuery: number; pageSize: number; detailsBudget: number };
export type Summary = { requests: number; results: number; details_fetched: number; stopped: string | null };

// Longest matching rule wins; Allow wins a tie (Google's reading of robots.txt).
export function robotsAllows(robots: string, path: string): boolean {
  let inStar = false, best = { len: -1, allow: true };
  for (const raw of robots.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    const [k, ...rest] = line.split(":");
    const key = k?.trim().toLowerCase(), value = rest.join(":").trim();
    if (key === "user-agent") inStar = value === "*";
    else if (inStar && (key === "allow" || key === "disallow") && value && path.startsWith(value)) {
      if (value.length > best.len || (value.length === best.len && key === "allow")) best = { len: value.length, allow: key === "allow" };
    }
  }
  return best.allow;
}

// BR-17, DM-10: never-fetched first, then multi-shop cards with the oldest details, then the rest, oldest first.
export function detailsQueue(seen: { id: string; multiShop: boolean }[], index: Map<string, string>, budget: number): string[] {
  const unique = [...new Map(seen.map((s) => [s.id, s])).values()];
  const byAge = (a: { id: string }, b: { id: string }) => index.get(a.id)!.localeCompare(index.get(b.id)!);
  const fresh = unique.filter((s) => !index.has(s.id));
  const multi = unique.filter((s) => index.has(s.id) && s.multiShop).sort(byAge);
  const rest = unique.filter((s) => index.has(s.id) && !s.multiShop).sort(byAge);
  return [...fresh, ...multi, ...rest].slice(0, budget).map((s) => s.id);
}

type Fetched = { kind: "ok"; body: unknown } | { kind: "challenged" | "non_json" | "network" | "error"; note: string };

export async function runCollector(deps: Deps, opts: Partial<Options> = {}): Promise<Summary> {
  const o: Options = { queries: QUERIES, pagesPerQuery: 2, pageSize: 24, detailsBudget: 40, ...opts };
  const startedAt = deps.now().toISOString();
  const summary: Summary = { requests: 0, results: 0, details_fetched: 0, stopped: null };
  let lastTorob = -Infinity;

  const torob = async (path: string, params: Record<string, string>, gapMs: number): Promise<Fetched> => {
    const waited = deps.now().getTime() - lastTorob;
    const gap = gapMs + deps.random() * JITTER_MS;
    if (waited < gap) await deps.sleep(Math.ceil(gap - Math.max(0, waited)));
    summary.requests++;
    lastTorob = deps.now().getTime();
    try {
      const res = await deps.http(`${TOROB_API}${path}?${new URLSearchParams(params)}`, { headers: { "User-Agent": UA, ...TOROB_HEADERS } });
      if (res.status === 490) return { kind: "challenged", note: "anti-bot challenge" };
      if (res.status >= 200 && res.status < 300 && !res.contentType.includes("json")) return { kind: "non_json", note: res.contentType };
      if (res.status < 200 || res.status >= 300) return { kind: "error", note: `HTTP ${res.status}` };
      return { kind: "ok", body: await res.json() };
    } catch (err) {
      return { kind: "network", note: String(err) };
    }
  };

  const gold = async () => {
    const fetchedAt = () => deps.now().toISOString();
    try {
      const res = await deps.http(UNION_URL, { method: "POST", body: "action=tablotala_timer", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" } });
      await deps.write("gold-price.jsonl", { source: UNION_URL, unit: "toman", fetched_at: fetchedAt(), body: await res.json() });
    } catch (err) {
      await deps.write("runs.jsonl", { step: "gold_price", source: "union", kind: "network", note: String(err), fetched_at: fetchedAt() });
    }
    try {
      const res = await deps.http(TGJU_URL, { headers: { "User-Agent": UA, Accept: "application/json" } });
      const current = ((await res.json()) as { current?: Record<string, unknown> })?.current ?? {};
      await deps.write("gold-price.jsonl", { source: TGJU_URL, unit: "rial", fetched_at: fetchedAt(), prices: Object.fromEntries(TGJU_KEYS.filter((k) => k in current).map((k) => [k, current[k]])) });
    } catch (err) {
      await deps.write("runs.jsonl", { step: "gold_price", source: "tgju", kind: "network", note: String(err), fetched_at: fetchedAt() });
    }
  };

  const finish = async () => {
    await gold();
    await deps.write("runs.jsonl", { step: "summary", started_at: startedAt, finished_at: deps.now().toISOString(), ...summary });
    return summary;
  };
  const stop = async (got: Exclude<Fetched, { kind: "ok" }>, where: string, row: object) => {
    await deps.write("runs.jsonl", { ...row, kind: got.kind, note: got.note, fetched_at: deps.now().toISOString() });
    if (got.kind === "error") return false;
    summary.stopped = `${got.kind} at ${where}`; // BR-12: no retry within the run
    return true;
  };

  try { // BR-10: today's robots.txt must allow both paths
    const robots = await (await deps.http(ROBOTS_URL, { headers: { "User-Agent": UA } })).text();
    if (!robotsAllows(robots, SEARCH_PATH) || !robotsAllows(robots, DETAILS_PATH)) {
      summary.stopped = "robots";
      return finish();
    }
  } catch (err) {
    summary.stopped = `network at robots.txt`;
    return finish();
  }

  const seen: { id: string; multiShop: boolean }[] = [];
  for (const q of o.queries) {
    await gold();
    for (let page = 0; page < o.pagesPerQuery; page++) {
      const got = await torob(SEARCH_PATH, { q, page: String(page), size: String(o.pageSize), sort: "", source: "next_desktop" }, SEARCH_GAP_MS);
      if (got.kind !== "ok") {
        if (await stop(got, `q="${q}" page=${page}`, { step: "search", q, page })) return finish();
        continue;
      }
      const body = got.body as { count?: number; results?: { random_key: string; shop_text?: string }[] };
      const results = Array.isArray(body.results) ? body.results : [];
      summary.results += results.length;
      for (const r of results) seen.push({ id: r.random_key, multiShop: /در\s*[۰-۹0-9]+\s*فروشگاه/.test(r.shop_text ?? "") });
      await deps.write("torob-search.jsonl", { source: SEARCH_PATH, q, page, fetched_at: deps.now().toISOString(), total_count: body.count ?? null, results });
      if (results.length < o.pageSize) break;
    }
  }

  const queue = detailsQueue(seen, await deps.detailsIndex(), o.detailsBudget);
  for (const [i, key] of queue.entries()) {
    if (i % GOLD_EVERY_DETAILS === 0) await gold();
    const got = await torob(DETAILS_PATH, { prk: key, source: "next_desktop" }, DETAILS_GAP_MS);
    if (got.kind !== "ok") {
      if (await stop(got, `details ${key}`, { step: "details", key })) return finish();
      continue;
    }
    await deps.saveDetails(key, { fetched_at: deps.now().toISOString(), source: DETAILS_PATH, body: got.body });
    summary.details_fetched++;
  }
  return finish();
}

function realDeps(root: string, runId: string): Deps {
  const day = join(root, "data/raw", runId.slice(0, 10));
  const detailsDir = join(root, "data/raw/details");
  return {
    http: async (url, init) => {
      const res = await fetch(url, { method: init?.method ?? "GET", body: init?.body, headers: init?.headers, signal: AbortSignal.timeout(20_000) });
      return { status: res.status, contentType: res.headers.get("content-type") ?? "", json: () => res.json(), text: () => res.text() };
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => new Date(),
    random: Math.random,
    write: async (file, row) => {
      await mkdir(day, { recursive: true });
      await appendFile(join(day, file), JSON.stringify({ run_id: runId, ...row }) + "\n");
    },
    saveDetails: async (key, record) => {
      await mkdir(detailsDir, { recursive: true });
      await writeFile(join(detailsDir, `${key}.json`), JSON.stringify(record));
    },
    detailsIndex: async () => {
      const index = new Map<string, string>();
      for (const f of await readdir(detailsDir).catch(() => [] as string[])) {
        if (!f.endsWith(".json")) continue;
        const { fetched_at } = JSON.parse(await readFile(join(detailsDir, f), "utf8"));
        index.set(f.slice(0, -5), fetched_at);
      }
      return index;
    },
  };
}

if (import.meta.main) {
  const runId = new Date().toISOString();
  // --smoke: one query, one page, one details page, to check the live API politely.
  const smoke = process.argv.includes("--smoke") ? { queries: [QUERIES[4]!], pagesPerQuery: 1, detailsBudget: 1 } : {};
  const summary = await runCollector(realDeps(new URL("../../", import.meta.url).pathname, runId), smoke);
  console.log(JSON.stringify({ runId, ...summary }));
}
