// Hard sentences whose key fact the rules miss (builder-labelled proxy, D-14): rules alone vs rules + LLM (ADR-0005).
// Run: node --env-file=.env eval/ev-hard.ts [--model=gpt-4.1-nano]
import { ROOT, readCsv, throttled } from "./lib.ts";
import { parseQuery, type ParsedQuery } from "../src/core/parse.ts";
import { avalai, parser } from "../src/server/llm.ts";
import { config } from "../src/core/config.ts";

const key = process.env.AVALAI_API_KEY;
if (!key) throw new Error("AVALAI_API_KEY is not set (put it in .env and run with --env-file=.env)");
const model = process.argv.find((a) => a.startsWith("--model="))?.slice(8) ?? config.llm.model;
const client = avalai(key, model);
const ms: number[] = [];
const timed = throttled(async (m: Parameters<typeof client>[0]) => { const t = Date.now(); try { return await client(m); } finally { ms.push(Date.now() - t); } });
const withLlm = parser(timed);

const hits = (p: ParsedQuery, targets: string[]) => targets.every((t) => { const [k, v] = t.split("="); return p.chips.some((c) => c.kind === k && String(c.value) === v); });
let rulesOk = 0, llmOk = 0, used = 0;
const extra: string[] = [];
const rowsOut: { id: string; text: string; targets: string[]; rules: boolean; llm: boolean; chips: string[]; unparsed: string | null }[] = [];
const rows = readCsv(`${ROOT}docs/evidence/ev-qry-hard-2026-10-24.csv`);
for (const r of rows) {
  const targets = r.targets!.split(";");
  const rules = parseQuery(r.text!);
  const both = await withLlm(r.text!);
  rulesOk += Number(hits(rules, targets));
  llmOk += Number(hits(both, targets));
  used += Number(both.llm_used);
  const fromRules = new Set(rules.chips.map((c) => `${c.kind}=${c.value}`));
  for (const c of both.chips) if (typeof c.value === "number" && !fromRules.has(`${c.kind}=${c.value}`) && !targets.includes(`${c.kind}=${c.value}`)) extra.push(`${r.id} ${c.kind}=${c.value}`);
  rowsOut.push({ id: r.id!, text: r.text!, targets, rules: hits(rules, targets), llm: hits(both, targets), chips: both.chips.map((c) => `${c.kind}=${c.value}`), unparsed: both.unparsed });
  console.error(`${r.id} ${hits(both, targets) ? "ok  " : "miss"} ${both.chips.map((c) => `${c.kind}=${c.value}`).join(" ")} | unread: ${both.unparsed}`);
}
const sorted = [...ms].sort((a, b) => a - b);
console.log(JSON.stringify({ model, n: rows.length, rules_only: `${rulesOk}/${rows.length}`, rules_plus_llm: `${llmOk}/${rows.length}`, llm_called: used,
  numbers_not_in_targets: extra, latency_ms: { median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) }, rows: rowsOut }, null, 1));
