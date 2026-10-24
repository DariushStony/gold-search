// Spike (PRD M2, EV-MCH): proposes Torob ↔ Digikala candidate pairs for human
// "same item?" judgement. One Digikala search per Torob gold product; the best
// title match is kept. Pairs are enriched with high-similarity ones so the set
// has enough true matches.
// Run: node spikes/eval/mch-candidates.ts
import { readFile, writeFile } from "node:fs/promises";

const DK = "https://api.digikala.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const GAP_MS = 1500;
const TOP_BY_SIMILARITY = 60;
const RANDOM_REST = 40;
const root = new URL("../../", import.meta.url).pathname;

let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const digits = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
// Words every gold title shares carry no identity signal.
const STOP = new Set(["طلا", "طلای", "۱۸", "18", "عیار", "زنانه", "مردانه", "مدل", "کد", "گرم", "و", "با", "برای", "طرح", "جدید"]);
const tokens = (s: string) => new Set(digits(s).replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t)));
const jaccard = (a: Set<string>, b: Set<string>) => {
  const inter = [...a].filter((x) => b.has(x)).length;
  return inter / Math.max(a.size + b.size - inter, 1);
};

const labels = (await readFile(`${root}docs/evidence/ev-mat-labels-2026-10-22.csv`, "utf8")).split("\n").slice(1).filter(Boolean);
const goldKeys = new Set(labels.filter((l) => /,gold,(owner|ai),/.test(l)).map((l) => l.match(/,([0-9a-f-]{36}),/)?.[1]));

type Torob = { key: string; title: string; price: number; image: string; url: string };
const torob = new Map<string, Torob>();
for (const line of (await readFile(`${root}data/raw/2026-10-22/torob-search.jsonl`, "utf8")).split("\n").filter(Boolean)) {
  for (const r of JSON.parse(line).results ?? []) {
    if (!goldKeys.has(r.random_key) || torob.has(r.random_key)) continue;
    torob.set(r.random_key, { key: r.random_key, title: r.name1 ?? "", price: r.price ?? 0, image: r.image_url ?? "", url: `https://torob.com${r.web_client_absolute_url ?? ""}` });
  }
}

type Pair = { torob: Torob; dk: { id: number; title: string; price: number; image: string; url: string }; similarity: number };
const best: Pair[] = [];
for (const t of torob.values()) {
  await sleep(GAP_MS);
  const res = await fetch(`${DK}/v1/search/?q=${encodeURIComponent(t.title)}&page=1`, { headers: { "User-Agent": UA, Accept: "application/json" } }).catch(() => null);
  if (!res?.ok) continue;
  const products = ((await res.json())?.data?.products ?? []).slice(0, 3);
  const tt = tokens(t.title);
  let top: Pair | null = null;
  for (const p of products) {
    const sim = jaccard(tt, tokens(p.title_fa ?? ""));
    if (!top || sim > top.similarity) {
      top = {
        torob: t,
        dk: {
          id: p.id,
          title: p.title_fa ?? "",
          price: Math.round((p.default_variant?.price?.selling_price ?? 0) / 10),
          image: p.images?.main?.url?.[0] ?? "",
          url: `https://www.digikala.com/product/dkp-${p.id}/`,
        },
        similarity: Number(sim.toFixed(3)),
      };
    }
  }
  if (top) best.push(top);
}

best.sort((a, b) => b.similarity - a.similarity);
const high = best.slice(0, TOP_BY_SIMILARITY);
const rest = best.slice(TOP_BY_SIMILARITY).map((p) => [rand(), p] as const).sort((a, b) => a[0] - b[0]).slice(0, RANDOM_REST).map(([, p]) => p);
const pairs = [...high, ...rest].map((p, i) => ({ pair: i + 1, stratum: i < high.length ? "high_similarity" : "random", ...p }));
await writeFile(`${root}data/eval/ev-mch-pairs.jsonl`, pairs.map((p) => JSON.stringify(p)).join("\n") + "\n");
console.log(JSON.stringify({ torob_gold: torob.size, with_candidate: best.length, pairs: pairs.length, high: high.length, random: rest.length }));
