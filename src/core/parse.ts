// K-05 rules-first parser: free Persian text → chips (BR-50–BR-5A; API §4.2).
// The LLM fallback (BR-55, ADR-0005) plugs in later; this path never calls it.
import { config } from "./config.ts";
import { normalize } from "./extract.ts";

export type ChipKind =
  | "intent" | "item_type" | "form" | "budget_min" | "budget_max" | "budget_target"
  | "weight_min" | "weight_max" | "weight_target" | "weight_pref" | "karat" | "audience"
  | "recipient" | "condition" | "ojrat_max" | "ojrat_sort" | "no_stones" | "style" | "shop"
  | "torob_pay" | "in_person" | "city" | "occasion";
export type Chip = {
  kind: ChipKind;
  role: "filter" | "filter_and_sort" | "sort" | "info";
  level: "product" | "offer";
  value: string | number | boolean;
  origin: "text" | "user";
};
export type Intent = "gift" | "beauty" | "savings";
export type ParsedQuery = {
  chips: Chip[];
  intent: Intent | "unknown";
  suggest_intent: boolean;
  ask: { kind: "budget_unit" } | null;
  mode: "jewelry" | "non_jewelry" | "both";
  llm_used: boolean;
  unparsed: string | null; // CR-04: words no rule read, shown as «متوجه نشدم»
};
export type Answers = { budget_unit?: "thousand" | "million" };

const cfg = config.parse;

// API contract §3: role and level are fixed per kind.
export const ROLE: Record<ChipKind, [Chip["role"], Chip["level"]]> = {
  intent: ["filter_and_sort", "product"], item_type: ["filter", "product"], form: ["filter", "product"], karat: ["filter", "product"],
  audience: ["filter", "product"], condition: ["filter", "product"], no_stones: ["filter", "product"],
  budget_min: ["filter", "product"], budget_max: ["filter", "product"], budget_target: ["filter_and_sort", "product"],
  weight_min: ["filter", "product"], weight_max: ["filter", "product"], weight_target: ["filter_and_sort", "product"], weight_pref: ["sort", "product"],
  ojrat_max: ["filter", "product"], ojrat_sort: ["sort", "product"], style: ["sort", "product"],
  shop: ["filter", "offer"], city: ["filter", "offer"], in_person: ["filter", "offer"], torob_pay: ["filter", "offer"],
  recipient: ["info", "product"], occasion: ["info", "product"],
};

const FA = "\\u0600-\\u06FFa-z";
// A whole word, allowing colloquial suffixes such as «ی»، «م»، «مه»، «ها»، «ای»، «ان»، «یی»، «ش»، «شو».
const word = (w: string) => new RegExp(`(?<![${FA}])${w.replace(/ /g, "\\s")}(?:ی|م|مه|ها|ای|ان|یی|ش|شو)?(?![${FA}])`);
const has = (t: string, w: string) => word(w).test(t);

export const NUMBER_WORDS: Record<string, number> = {
  یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, شیش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10, یازده: 11, دوازده: 12, سیزده: 13, چهارده: 14,
  پانزده: 15, پونزده: 15, شانزده: 16, هفده: 17, هجده: 18, نوزده: 19, بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60, هفتاد: 70,
  هشتاد: 80, نود: 90, صد: 100, یکصد: 100, دویست: 200, سیصد: 300, چهارصد: 400, پانصد: 500, پونصد: 500, ششصد: 600, هفتصد: 700,
  هشتصد: 800, نهصد: 900,
};
const UNIT = "میلیونی|میلیون|تومنی|تومن|تومان|هزار|گرمی|گرم|سوتی|سوت|درصد|عیار|م|ت";
const isUnit = (tok: string | undefined) => !!tok && new RegExp(`^(?:${UNIT}|تا)$`).test(tok);

// «دو سه میلیون» → «2 3 میلیون»; «بیست و پنج تومن» → «25 تومن». Only runs that end in a unit convert,
// so «نه» (no) and «سه تا» stay words unless they are amounts.
function numberWords(t: string): string {
  const toks = t.split(" ");
  const out: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    if (!(toks[i]! in NUMBER_WORDS)) { out.push(toks[i]!); continue; }
    let j = i;
    const run: string[] = [];
    while (j < toks.length && (toks[j]! in NUMBER_WORDS || (toks[j] === "و" && toks[j + 1]! in NUMBER_WORDS && run.length > 0))) run.push(toks[j++]!);
    if (!isUnit(toks[j])) { out.push(...run); i = j - 1; continue; }
    const nums: number[] = [];
    for (let k = 0; k < run.length; k++) {
      if (run[k] === "و") { nums[nums.length - 1]! += NUMBER_WORDS[run[++k]!]!; continue; }
      nums.push(NUMBER_WORDS[run[k]!]!);
    }
    out.push(...nums.map(String));
    i = j - 1;
  }
  return out.join(" ");
}

function prep(text: string): string {
  let t = normalize(text).toLowerCase().replace(/[؟?!،,؛;|…()]/g, " ").replace(/\.(?!\d)|(?<!\d)\./g, " ").replace(/\s+/g, " ");
  for (const [from, to] of cfg.rewrite) t = t.replace(new RegExp(from, "g"), to);
  return numberWords(t.replace(/(\d)\s*-\s*(\d)/g, "$1-$2"));
}

type Amount = { kind: "budget_min" | "budget_max" | "budget_target"; toman: number | null; raw: number }; // toman null: unit unclear

function multiplier(n: number, unit: string): number | null {
  if (/^(میلیونی|میلیون|م)$/.test(unit)) return 1_000_000;
  if (unit === "هزار") return 1_000;
  if (n >= 1000) return 1; // already toman
  return n < cfg.tomanAmbiguousFrom ? 1_000_000 : null; // «تومن» or a bare number
}

function budgets(t: string): { amounts: Amount[]; rest: string } {
  const amounts: Amount[] = [];
  let rest = t;
  const UNIT_B = "(میلیونی|میلیون|تومنی|تومن|تومان|هزار|م|ت)?";
  const range = new RegExp(`(?:بین\\s*)?(\\d+(?:\\.\\d+)?)\\s*(?:تا|-|و|\\s)\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT_B}(?![${FA}])`, "g");
  for (const m of rest.matchAll(range)) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (!m[3] && !/بین/.test(m[0])) continue; // «۲ ۳» with no unit is not a budget
    if (b <= a) continue;
    const mul = multiplier(b, m[3] ?? "");
    amounts.push({ kind: "budget_min", toman: mul && a * mul, raw: a }, { kind: "budget_max", toman: mul && b * mul, raw: b });
    rest = rest.replace(m[0], " ");
  }
  const single = new RegExp(`(?:(?<![${FA}])(حدود|حدودا|حدوداً|در حد|تقریبا|حداقل|بالای|بیشتر از|از)\\s*)?(\\d+(?:\\.\\d+)?)\\s*${UNIT_B}(?![${FA}])`, "g");
  for (const m of rest.matchAll(single)) {
    const n = Number(m[2]);
    const cue = m[1] ?? "";
    const before = rest.slice(Math.max(0, m.index! - 12), m.index!);
    const budgetContext = !!m[3] || /(تا|زیر|حداکثر|بودجه|با|حدود|دارم)\s*$/.test(before + cue);
    if (!budgetContext) continue;
    const mul = multiplier(n, m[3] ?? "");
    const kind = /حدود|در حد|تقریبا/.test(cue) ? "budget_target" : /حداقل|بالای|بیشتر از|از/.test(cue) ? "budget_min" : "budget_max";
    amounts.push({ kind, toman: mul && n * mul, raw: n });
    rest = rest.replace(m[0], " ");
  }
  return { amounts, rest };
}

// CR-04: every word some rule looks for, longest first so «روز مادر» goes before «مادر».
const KNOWN: RegExp[] = [
  ...[...cfg.itemTypes, ...cfg.forms, ...cfg.styles, ...cfg.occasions, ...cfg.shops].map(([w]) => w),
  ...cfg.recipients.map(([w]) => w), ...Object.values(cfg.audience).flat(), ...cfg.cities, ...cfg.giftWords, ...cfg.savingsWords,
  ...cfg.beautyWords, ...cfg.jewelryWords, ...cfg.usedWords, ...cfg.lightWords, ...cfg.heavyWords, "حضوری", "نوزاد", "سالگرد", "سرمایه گذاری",
].sort((a, b) => b.length - a.length).map((w) => new RegExp(word(w).source, "g")).concat(
  [/کمترین\s*اجرت/, /(?:کم|بی|بدون|با)\s*اجرت/, /اجرت\s*(?:کم|پایین)/, /بدون\s*(?:سنگ|نگین)/, /ترب\s*پی|قسطی|اقساطی/, /چه\s*مدل/].map((r) => new RegExp(r.source, "g")));
const FILLER = new Set(cfg.fillerWords);

// What is left after the rules, as runs of unknown words in their order; filler alone never counts.
function unread(rest: string): string | null {
  let t = rest;
  for (const re of KNOWN) t = t.replace(re, " | ");
  const runs: string[] = [];
  let run: string[] = [];
  const flush = () => {
    while (run.length && FILLER.has(run.at(-1)!)) run.pop();
    if (run.length) runs.push(run.join(" "));
    run = [];
  };
  for (const tok of t.split(/\s+/).filter(Boolean)) {
    if (tok === "|") flush();
    else if (!FILLER.has(tok) || run.length) run.push(tok);
  }
  flush();
  return runs.length ? runs.join("، ") : null;
}

function firstMatches(t: string, list: [string, string][]): string[] {
  const hits = list.map(([w, v]) => ({ v, at: t.search(word(w)) })).filter((h) => h.at >= 0).sort((a, b) => a.at - b.at);
  return [...new Set(hits.map((h) => h.v))];
}

export function parseQuery(text: string, answers: Answers = {}): ParsedQuery {
  const full = prep(text);
  let t = full;
  const chips: Chip[] = [];
  const add = (kind: ChipKind, value: Chip["value"], origin: Chip["origin"] = "text") => {
    if (chips.some((c) => c.kind === kind && c.value === value)) return;
    const [role, level] = ROLE[kind];
    chips.push({ kind, role, level, value, origin });
  };
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    for (const m of t.matchAll(new RegExp(re.source, "g"))) fn(m);
    t = t.replace(new RegExp(re.source, "g"), " ");
  };

  // Numbers that are not money go first, so «زیر ۱۰ درصد» never reads as a budget.
  take(/اجرت\S*\s*(?:زیر|کمتر از|حداکثر)\s*(\d+(?:\.\d+)?)\s*(?:درصد|%)/, (m) => add("ojrat_max", Number(m[1])));
  if (/کمترین\s*اجرت/.test(t)) { add("ojrat_max", cfg.ojrat.low); add("ojrat_sort", "asc"); }
  const ojratQuestion = /یا\s*(?:با|بی|بدون)\s*اجرت/.test(t); // «بدون اجرت بگیرم یا با اجرت؟» compares, it does not filter
  if (!ojratQuestion && (word("بدون اجرت").test(t) || word("بی اجرت").test(t))) add("ojrat_max", cfg.ojrat.none);
  else if (!ojratQuestion && /کم\s*اجرت|اجرت\s*(?:کم|پایین)/.test(t)) add("ojrat_max", cfg.ojrat.low);
  take(/(\d{2,3})\s*عیار|عیار\s*(\d{2,3})/, (m) => {
    const k = config.extract.karatByNumber[Number(m[1] ?? m[2])];
    if (k) add("karat", k);
  });
  take(/(\d+(?:\.\d+)?)\s*گرم\s*(?:به\s*بالا|و\s*بیشتر)|(?:حداقل|بالای)\s*(\d+(?:\.\d+)?)\s*گرم/, (m) => add("weight_min", Number(m[1] ?? m[2])));
  take(/(?:تا|زیر|حداکثر)\s*(\d+(?:\.\d+)?)\s*گرم/, (m) => add("weight_max", Number(m[1])));
  take(/(\d+(?:\.\d+)?)\s*(?:گرمی|گرم)(?![؀-ۿ])/, (m) => add("weight_target", Number(m[1])));
  take(/(\d+(?:\.\d+)?)\s*(?:سانت\S*|عدد\S*|درصد|سوتی|سوت)/, () => {});
  take(/(\d+)\s*تا(?=\s+[^\d\s])(?!\s*(?:میلیون|تومن|تومان|م|ت)\b)/, () => {}); // «دوتا دستبند» is a count

  const { amounts, rest } = budgets(t);
  t = rest;
  let ask: ParsedQuery["ask"] = null;
  for (const a of amounts) {
    let toman = a.toman;
    let origin: Chip["origin"] = "text";
    if (toman === null || toman < cfg.minBudgetToman) {
      if (!answers.budget_unit) { ask = { kind: "budget_unit" }; continue; }
      toman = a.raw * (answers.budget_unit === "million" ? 1_000_000 : 1_000);
      origin = "user";
    }
    add(a.kind, toman, origin);
  }

  // «گردنبند با پلاک»: a type named after «با» is a part of the piece, not another piece.
  const parts = new Set(cfg.itemTypes.filter(([w]) => new RegExp(`با\\s*${w}`).test(full)).map(([, v]) => v)); // before amounts are cut out
  const types = firstMatches(t, cfg.itemTypes);
  for (const v of types) if (!parts.has(v) || types.length === 1) add("item_type", v);
  const forms = firstMatches(t, cfg.forms);
  for (const v of forms) add("form", v);
  if (cfg.usedWords.some((w) => has(t, w))) add("condition", "used");
  if (cfg.heavyWords.some((w) => has(t, w))) add("weight_pref", "heavy");
  else if (cfg.lightWords.some((w) => has(t.replace(/هدیه\s*\S+/g, " "), w))) add("weight_pref", "light"); // «هدیه کوچیک» is a modest gift
  if (/بدون\s*(?:سنگ|نگین)/.test(t)) add("no_stones", true);
  for (const v of firstMatches(t, cfg.styles)) add("style", v);
  for (const v of firstMatches(t, cfg.shops)) add("shop", v);
  if (/ترب\s*پی|قسطی|اقساطی/.test(t)) add("torob_pay", true);
  if (has(t, "حضوری")) add("in_person", true);
  for (const c of cfg.cities) if (has(t, c)) add("city", c);

  // BR-5A: who it is for; «دختر» alone is a woman, «نوزاد دختر» a baby girl.
  const baby = has(t, "نوزاد");
  const babyGirl = baby && /نوزاد\s*دختر|دختر\s*نوزاد/.test(t), babyBoy = baby && /نوزاد\s*پسر|پسر\s*نوزاد/.test(t);
  let impliedAudience: string | null = null;
  for (const [w, v, aud] of cfg.recipients) {
    if (!has(t, w)) continue;
    if (v === "دختر" && baby) continue;
    if (v === "دوست" && /دوستان/.test(t) && !/دوستم/.test(t)) continue;
    if (v === "دوست" && chips.some((c) => c.value === "دوست‌دختر")) continue;
    add("recipient", v);
    impliedAudience ??= aud;
  }
  if (/برای\s*خودم|خودم\s*(?:بخوام|میخوام)/.test(t)) add("recipient", "خودم");
  const stated = (Object.entries(cfg.audience) as [string, string[]][]).find(([, ws]) => ws.some((w) => has(t, w)))?.[0];
  const audience = babyGirl ? "kids_girl" : babyBoy ? "kids_boy" : baby ? "kids" : stated ?? (has(t, "روز زن") ? "women" : impliedAudience);
  if (audience) add("audience", audience);

  const occasions = firstMatches(t, cfg.occasions);
  const giftWord = cfg.giftWords.some((w) => has(t, w));
  for (const o of occasions) add("occasion", o === "تولد" && baby ? "تولد_نوزاد" : o);
  if (baby && (giftWord || occasions.length === 0) && !occasions.length) add("occasion", "تولد_نوزاد");

  // BR-53: explicit gift words or occasions, then savings cues, then someone else as recipient, then wearing cues.
  const recipients = chips.filter((c) => c.kind === "recipient").map((c) => c.value);
  const jewelryNamed = cfg.jewelryWords.some((w) => has(t, w));
  const savings = cfg.savingsWords.some((w) => t.includes(w)) || forms.length >= 2 || (forms.length > 0 && jewelryNamed) ||
    (forms.length > 0 && /بخرم\s*یا|یا\s*\S*\s*بخرم|بهتره|کدوم/.test(t));
  const ojratOrUsed = chips.some((c) => c.kind === "ojrat_max" || c.kind === "condition");
  const items = chips.filter((c) => c.kind === "item_type").length;
  const beauty = cfg.beautyWords.some((w) => t.includes(w)) || items >= 2 || /چه\s*مدل/.test(t) ||
    (!ojratOrUsed && chips.some((c) => c.kind === "style"));
  let intent: ParsedQuery["intent"] = "unknown";
  if (giftWord || occasions.length > 0) intent = "gift";
  else if (savings) intent = "savings";
  else if (recipients.some((r) => r !== "خودم")) intent = "gift";
  else if (beauty) intent = "beauty";
  if (intent !== "unknown") add("intent", intent);

  const jewelry = chips.some((c) => c.kind === "item_type") || jewelryNamed;
  const mode = forms.length === 0 ? "jewelry" : jewelry ? "both" : "non_jewelry";
  return { chips, intent, suggest_intent: intent === "unknown", ask, mode, llm_used: false, unparsed: unread(t) };
}
