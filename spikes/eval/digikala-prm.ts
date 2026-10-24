// Spike (PRD M2, EV-PRM): measures how well BR-43 recovers declared ojrat from
// list price. Ground truth is Digikala's own price breakdown.
// Run: node spikes/eval/digikala-prm.ts
import { writeFile } from "node:fs/promises";

const API = "https://api.digikala.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const GAP_MS = 1500;
const TARGET = 150;
// Several orderings so the sample is not just bestsellers.
const SORTS = [7, 4, 20, 21];
const PAGES = 2;
const VAT = 0.1;
const PROFIT = 0.07;

const today = new Date().toISOString().slice(0, 10);
const outDir = new URL("../../docs/evidence/", import.meta.url).pathname;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(path: string): Promise<any> {
  const res = await fetch(`${API}${path}`, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

// BR-43: o = (ratio + v) / ((1+v)(1+p)) − 1, ratio = price / (w × G)
const impliedOjrat = (price: number, weight: number, g: number) =>
  ((price / (weight * g) + VAT) / ((1 + VAT) * (1 + PROFIT)) - 1) * 100;

const ids: number[] = [];
for (const sort of SORTS) {
  for (let page = 1; page <= PAGES; page++) {
    const body = await get(`/v1/categories/gold-jewelry/search/?sort=${sort}&page=${page}`);
    for (const p of body?.data?.products ?? []) if (!ids.includes(p.id)) ids.push(p.id);
    await sleep(GAP_MS);
  }
}

type Row = Record<string, string | number>;
const rows: Row[] = [];
for (const id of ids.slice(0, TARGET)) {
  await sleep(GAP_MS);
  let product: any;
  try {
    product = (await get(`/v2/product/${id}/`))?.data?.product;
  } catch {
    continue;
  }
  const price = product?.default_variant?.price;
  const d = price?.gold_price_details;
  if (!d || !d.size || !d.gold_price || !price.rrp_price) continue;
  const implied = impliedOjrat(price.rrp_price, d.size, d.gold_price);
  rows.push({
    id,
    url: `https://www.digikala.com/product/dkp-${id}/`,
    title: String(product.title_fa ?? "").replaceAll('"', "'"),
    weight_g: d.size,
    carat: d.carat,
    ojrat_declared_pct: d.gold_wage,
    profit_pct: d.profit,
    tax_pct: d.tax,
    non_gold_cost_rial: d.non_gold_parts_cost,
    non_gold_wage_rial: d.non_gold_parts_wage,
    gold_price_rial: d.gold_price,
    rrp_rial: price.rrp_price,
    selling_rial: price.selling_price,
    implied_ojrat_pct: Number(implied.toFixed(3)),
    abs_err_pp: Number(Math.abs(implied - d.gold_wage).toFixed(3)),
    fetched_at: new Date().toISOString(),
  });
}

const cols = Object.keys(rows[0] ?? {});
const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => (typeof r[c] === "string" ? `"${r[c]}"` : r[c])).join(","))].join("\n");
await writeFile(`${outDir}ev-prm-digikala-${today}.csv`, csv + "\n");

const errs = rows.map((r) => Number(r.abs_err_pp)).sort((a, b) => a - b);
const clean = rows.filter((r) => r.profit_pct === 7 && r.non_gold_cost_rial === 0 && r.non_gold_wage_rial === 0 && r.carat === "carat_18");
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
const q = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];

// Percentile bootstrap for the MAE, fixed seed for reproducibility.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const boots = Array.from({ length: 2000 }, () => mean(errs.map(() => errs[Math.floor(rand() * errs.length)]))).sort((a, b) => a - b);

const summary = {
  date: today,
  n_ids: ids.length,
  n_rows: rows.length,
  mae_pp: Number(mean(errs).toFixed(3)),
  mae_ci95_pp: [Number(q(boots, 0.025).toFixed(3)), Number(q(boots, 0.975).toFixed(3))],
  median_pp: q(errs, 0.5),
  p90_pp: q(errs, 0.9),
  within_1pp: rows.filter((r) => Number(r.abs_err_pp) <= 1).length,
  n_clean_subset: clean.length,
  mae_clean_pp: Number(mean(clean.map((r) => Number(r.abs_err_pp))).toFixed(3)),
  assumptions: { vat: VAT, profit: PROFIT, price: "rrp (list, before discount)", gold_price: "Digikala's own gold_price" },
};
await writeFile(`${outDir}ev-prm-digikala-${today}.summary.json`, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary));
