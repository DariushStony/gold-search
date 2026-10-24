// Spike (stage 03, D-28): evidence for the representative-offer rule (BR-84)
// and the refresh policy (BR-17). Compares each search card's price with the
// cheapest in-stock offer on the same product's details page, and counts how
// many cards name several shops per run.
// Run: node spikes/eval/offer-freshness.ts
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const raw = new URL("../../data/raw/", import.meta.url).pathname;
const out = new URL("../../docs/evidence/", import.meta.url).pathname;
const STAMP = "2026-10-23";

const wilson = (k: number, n: number, z = 1.96) => {
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [+(100 * (c - h)).toFixed(1), +(100 * (c + h)).toFixed(1)];
};
const pct = (k: number, n: number) => +((100 * k) / n).toFixed(1);
const MULTI = /در\s*[۰-۹0-9]+\s*فروشگاه/;

type Card = { run: string; at: string; price: number; shop_text: string };
const cards = new Map<string, Card[]>();
const runs = new Map<string, { products: Set<string>; multi: Set<string> }>();
for (const day of (await readdir(raw)).sort()) {
  const text = await readFile(join(raw, day, "torob-search.jsonl"), "utf8").catch(() => "");
  for (const line of text.split("\n").filter(Boolean)) {
    const page = JSON.parse(line);
    for (const r of page.results ?? []) {
      const card = { run: page.run_id, at: page.fetched_at, price: r.price ?? 0, shop_text: r.shop_text ?? "" };
      cards.set(r.random_key, [...(cards.get(r.random_key) ?? []), card]);
      const run = runs.get(page.run_id) ?? { products: new Set(), multi: new Set() };
      run.products.add(r.random_key);
      if (MULTI.test(card.shop_text)) run.multi.add(r.random_key);
      runs.set(page.run_id, run);
    }
  }
}

const rows: string[] = ["key,details_fetched_at,card_fetched_at,hours_apart,card_price,cheapest_in_stock_online,equal,within_1pct,card_names_several_shops,in_stock_offers,in_person_offers"];
let n = 0, equal = 0, within1 = 0, offers = 0, inStock = 0, inPerson = 0, withInPerson = 0, withScore = 0, unreliable = 0, products = 0;
const detailsDir = join(raw, "details");
for (const file of (await readdir(detailsDir)).filter((f) => f.endsWith(".json")).sort()) {
  const key = file.slice(0, -5);
  const { fetched_at, body } = JSON.parse(await readFile(join(detailsDir, file), "utf8"));
  const online = body.products_info?.result ?? [];
  const store = body.products_in_store_info?.result ?? [];
  products++;
  if (store.length) withInPerson++;
  for (const o of [...online, ...store]) {
    offers++;
    if (o.shop_score) withScore++;
    if (o.is_price_unreliable) unreliable++;
  }
  const stocked = online.filter((o: any) => o.availability && o.price > 0).map((o: any) => o.price as number);
  const storePriced = store.filter((o: any) => o.price > 0).length;
  inStock += stocked.length + storePriced;
  inPerson += storePriced;
  const seen = cards.get(key);
  if (!stocked.length || !seen) continue;
  const t = Date.parse(fetched_at);
  const card = seen.reduce((a, b) => (Math.abs(Date.parse(b.at) - t) < Math.abs(Date.parse(a.at) - t) ? b : a));
  const min = Math.min(...stocked);
  const eq = card.price === min, w1 = Math.abs(card.price / min - 1) <= 0.01;
  n++; equal += +eq; within1 += +w1;
  rows.push([key, fetched_at, card.at, (Math.abs(Date.parse(card.at) - t) / 36e5).toFixed(2), card.price, min, eq, w1, MULTI.test(card.shop_text), stocked.length + storePriced, storePriced].join(","));
}

const perRun = [...runs].sort().map(([run, r]) => ({ run, products: r.products.size, several_shops: r.multi.size, share_pct: pct(r.multi.size, r.products.size), ci95: wilson(r.multi.size, r.products.size) }));
const summary = {
  stamp: STAMP,
  script: "spikes/eval/offer-freshness.ts",
  card_vs_details: { n, equal, equal_pct: pct(equal, n), equal_ci95: wilson(equal, n), within_1pct: within1, within_1pct_pct: pct(within1, n), within_1pct_ci95: wilson(within1, n) },
  runs: perRun,
  details_pages: { products, offers, in_stock_or_in_person_priced: inStock, in_person_priced: inPerson, products_with_in_person_tab: withInPerson, products_with_in_person_tab_pct: pct(withInPerson, products), offers_with_shop_score: withScore, offers_with_shop_score_pct: pct(withScore, offers), offers_price_unreliable: unreliable },
};
await writeFile(join(out, `offer-freshness-${STAMP}.csv`), rows.join("\n") + "\n");
await writeFile(join(out, `offer-freshness-${STAMP}.summary.json`), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
