// EV-MAT: material labels (BR-30–BR-39) against the human/AI labels in
// docs/evidence/ev-mat-labels-2026-10-22.csv. Run: node eval/ev-mat.ts [--split=test --release] [--show]
import { extract, specsFromDetails } from "../src/domains/catalog/extract.ts";
import { labelProduct } from "../src/domains/catalog/label.ts";
import { config } from "../src/core/config.ts";
import { ROOT, readCsv, details, wilson, splitFromArgs, pct } from "./lib.ts";

const G_2026_10_22 = 27_055_000; // tgju geram18 of the 2026-10-22 06:45 run (data/raw/2026-10-22/gold-price.jsonl)
type Truth = "gold" | "mixed" | "not_gold";

const split = splitFromArgs();
// Experiment switches, tune split only: --floor=0.05 --scan-specs --low=0.8 --high=3 (defaults come from config)
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const cfg = {
  ...config,
  label: {
    ...config.label,
    ...(arg("floor") ? { minWeightFloorG: Number(arg("floor")) } : {}),
    ...(process.argv.includes("--scan-specs") ? { scanSpecs: true } : {}),
    ...(arg("low") ? { lowRatio: Number(arg("low")) } : {}),
    ...(arg("high") ? { highRatio: Number(arg("high")) } : {}),
  },
};
if (split === "test" && cfg.label !== config.label && process.argv.some((a) => /^--(floor|scan-specs|low|high)/.test(a)))
  throw new Error("No experiment switches on the test split");
const rows = readCsv(`${ROOT}docs/evidence/ev-mat-labels-2026-10-22.csv`).filter((r) => r.split === split && r.label !== "unsure");

const baseline = (title: string): Truth => (title.includes("طلا") && !/آبکاری|ژوپینگ|استیل|نقره|بدل|رنگ ثابت|طرح طلا/.test(title) ? "gold" : "not_gold");

let realOk = 0,
  baseOk = 0;
const confusion = new Map<string, number>();
const misses: string[] = [];
for (const r of rows) {
  const d = details(r.random_key!);
  const specs = d ? specsFromDetails(d.body) : {};
  const offerTitles = d
    ? [...(d.body.products_info?.result ?? []), ...(d.body.products_in_store_info?.result ?? [])]
        .filter((o: any) => o.price > 0)
        .map((o: any) => String(o.name1 ?? ""))
    : [];
  const title = r.title!;
  const attrs = extract({ title, specs, shop: r.shop!.replace(/^در /, "") });
  const out = labelProduct({ title, specs, attributes: attrs, price: Number(r.price_toman), g_at_fetch: G_2026_10_22, offer_titles: offerTitles }, cfg);
  const truth = r.label as Truth;
  confusion.set(`${truth}→${out.label}`, (confusion.get(`${truth}→${out.label}`) ?? 0) + 1);
  if ((truth === "gold") === (out.label === "real")) realOk++;
  else
    misses.push(
      `${r.row} truth=${truth} got=${out.label} | ${title} | ${out.reasons.join("؛ ")} | ratio=${out.price_ratio?.toFixed(2) ?? "-"} | ${r.ai_evidence}`,
    );
  if ((truth === "gold") === (baseline(title) === "gold")) baseOk++;
}

const n = rows.length;
const f1 = (["gold", "mixed", "not_gold"] as Truth[]).map((c) => {
  let tp = 0,
    fp = 0,
    fn = 0;
  for (const [k, v] of confusion) {
    const [t, g] = k.split("→");
    const gT = g === "real" ? "gold" : g === "mixed" ? "mixed" : "not_gold"; // eval plan §3: review counts as not real
    if (t === c && gT === c) tp += v;
    else if (gT === c) fp += v;
    else if (t === c) fn += v;
  }
  return tp === 0 ? 0 : (2 * tp) / (2 * tp + fp + fn);
});
const [lo, hi] = wilson(realOk, n);
console.log(
  JSON.stringify(
    {
      split,
      n,
      real_vs_rest_accuracy: pct((100 * realOk) / n),
      ci95: [pct(lo), pct(hi)],
      macro_f1: (f1.reduce((a, b) => a + b, 0) / 3).toFixed(3),
      baseline_accuracy: pct((100 * baseOk) / n),
      confusion: Object.fromEntries(confusion),
    },
    null,
    1,
  ),
);
if (process.argv.includes("--show") && split === "tune") console.log(misses.join("\n"));
