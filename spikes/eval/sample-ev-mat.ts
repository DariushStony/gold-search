// Spike (PRD M2): draws the EV-MAT / EV-EXT labelling sheet from collector
// snapshots. Stratified by query, seed 42, one row per Torob product.
// Run: node spikes/eval/sample-ev-mat.ts [size]
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SIZE = Number(process.argv[2] ?? 300);
const TEST_SHARE = 0.3;
const raw = new URL("../../data/raw/", import.meta.url).pathname;
const out = new URL("../../docs/evidence/", import.meta.url).pathname;

let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const shuffle = <T>(xs: T[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

type Item = { query: string; key: string; title: string; subtitle: string; price: number; shop: string; url: string; fetched_at: string; is_adv: boolean };
const byKey = new Map<string, Item>();
for (const day of (await readdir(raw)).sort()) {
  const file = join(raw, day, "torob-search.jsonl");
  const text = await readFile(file, "utf8").catch(() => "");
  for (const line of text.split("\n").filter(Boolean)) {
    const page = JSON.parse(line);
    for (const r of page.results ?? []) {
      const key = r.random_key;
      if (!key || byKey.has(key)) continue;
      byKey.set(key, {
        query: page.q,
        key,
        title: r.name1 ?? "",
        subtitle: r.name2 ?? "",
        price: r.price ?? 0,
        shop: r.shop_text ?? "",
        url: r.web_client_absolute_url ? `https://torob.com${r.web_client_absolute_url}` : "",
        fetched_at: page.fetched_at,
        is_adv: Boolean(r.is_adv),
      });
    }
  }
}

const groups = new Map<string, Item[]>();
for (const it of byKey.values()) groups.set(it.query, [...(groups.get(it.query) ?? []), it]);
const total = byKey.size;
const picked: Item[] = [];
for (const [, items] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const quota = Math.round((items.length / total) * SIZE);
  picked.push(...shuffle(items).slice(0, quota));
}
const sample = shuffle(picked).slice(0, SIZE);
const testCut = Math.round(sample.length * (1 - TEST_SHARE));

const esc = (s: string) => `"${s.replaceAll('"', "'")}"`;
const header = "row,split,query,random_key,title,subtitle,price_toman,shop,url,fetched_at,is_adv,label,weight_g,karat,ojrat_pct,condition,has_stones,notes";
const lines = sample.map((it, i) =>
  [i + 1, i < testCut ? "tune" : "test", esc(it.query), it.key, esc(it.title), esc(it.subtitle), it.price, esc(it.shop), it.url, it.fetched_at, it.is_adv, "", "", "", "", "", "", ""].join(","),
);
const date = new Date().toISOString().slice(0, 10);
await writeFile(join(out, `ev-mat-sheet-${date}.csv`), [header, ...lines].join("\n") + "\n");
console.log(JSON.stringify({ unique_products: total, queries: groups.size, sampled: sample.length, tune: testCut, test: sample.length - testCut }));
