// EV-QRY: query understanding (BR-50–BR-5A). A query counts only if every chip
// matches its label. Run: node eval/ev-qry.ts [--split=test --release] [--show]
import { parseQuery } from "../src/core/parse.ts";
import { ROOT, readCsv, wilson, splitFromArgs, pct } from "./lib.ts";

const COLS = ["intent", "item_type", "form", "budget_min", "budget_max", "budget_target", "weight_min", "weight_max", "weight_target",
  "weight_pref", "karat", "audience", "recipient", "condition", "ojrat_max", "ojrat_sort", "no_stones", "style", "shop", "torob_pay",
  "in_person", "city", "occasion", "expected_ask"] as const;

// Eval plan §2: 70/30 by query, seed 42. BigInt keeps the generator exact; plain JS numbers lose
// precision in seed × 1103515245, and the exact split is the one the rules were written against.
function testIds(ids: string[]): Set<string> {
  let seed = 42n;
  const rand = () => Number((seed = (seed * 1103515245n + 12345n) % 2n ** 31n)) / 2 ** 31;
  const a = [...ids].sort();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return new Set(a.slice(0, Math.round(a.length * 0.3)));
}

const split = splitFromArgs();
const all = [...readCsv(`${ROOT}docs/evidence/ev-qry-authored-2026-10-23.csv`), ...readCsv(`${ROOT}docs/evidence/ev-qry-real-2026-10-23.csv`)];
const test = testIds(all.map((r) => r.id!));
const rows = all.filter((r) => (split === "test") === test.has(r.id!));

const norm = (v: string) => v.split("؛").map((x) => x.trim().toLowerCase()).filter(Boolean).sort().join("؛");
let exact = 0;
const byIntent = new Map<string, [number, number]>();
const colErrors = new Map<string, number>();
const misses: string[] = [];
for (const r of rows) {
  const p = parseQuery(r.text!);
  const got: Record<string, string> = Object.fromEntries(COLS.map((c) => [c, ""]));
  for (const c of p.chips) got[c.kind] = norm([got[c.kind], String(c.value)].filter(Boolean).join("؛"));
  got.intent = p.intent;
  got.expected_ask = p.ask ? p.ask.kind : p.suggest_intent ? "suggest_intent" : "";
  const wrong = COLS.filter((c) => norm(got[c] ?? "") !== norm(r[c] ?? ""));
  const ok = wrong.length === 0;
  if (ok) exact++;
  const k = r.intent || "unknown";
  const [h, n] = byIntent.get(k) ?? [0, 0];
  byIntent.set(k, [h + Number(ok), n + 1]);
  for (const c of wrong) colErrors.set(c, (colErrors.get(c) ?? 0) + 1);
  if (!ok) misses.push(`${r.id} ${wrong.map((c) => `${c}: want «${r[c] ?? ""}» got «${got[c]}»`).join("; ")} | ${r.text!.slice(0, 90)}`);
}
const [lo, hi] = wilson(exact, rows.length);
console.log(JSON.stringify({
  split, n: rows.length, exact_match: pct((100 * exact) / rows.length), ci95: [pct(lo), pct(hi)], target: "≥ 90",
  by_intent: Object.fromEntries([...byIntent].map(([k, [h, n]]) => [k, `${h}/${n}`])),
  errors_by_chip: Object.fromEntries([...colErrors].sort((a, b) => b[1] - a[1])),
}, null, 1));
if (process.argv.includes("--show") && split === "tune") console.log(misses.join("\n"));
