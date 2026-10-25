import { config } from "./config.ts";

export type Provenance = "spec" | "title" | "llm";
export type Found<T> = { value: T; provenance: Provenance; evidence: string };
export type NonGoldKind = "stones" | "cord" | "beads" | "declared";
export type ProductText = { title: string; specs: Record<string, string>; shop: string | null };

export type Attributes = {
  weight_g: Found<number> | null;
  weight_conflict: boolean;
  karat: Found<number> | null;
  declared_ojrat_pct: Found<number> | null;
  declared_profit_pct: Found<number> | null;
  gallery: Found<string> | null;
  item_type: Found<string> | null;
  audience: Found<"women" | "men" | "kids"> | null;
  condition: Found<"used"> | null; // absent means new (BR-26)
  style_tags: Found<string>[];
  non_gold: Found<NonGoldKind> | null;
  non_gold_cost_toman: Found<number> | null;
};

const cfg = config.extract;
const FA = "\\u0600-\\u06FF";
const NUM = "(\\d+(?:\\.\\d+)?)";

export function normalize(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/‌/g, " ")
    .replace(/(\d)٬(\d)/g, "$1$2")
    .replace(/(\d)\s*[٫/]\s*(\d)/g, "$1.$2")
    .replace(/\s+/g, " ")
    .trim();
}

// A Persian word, optionally followed by «ی», with no Persian letter on either side.
const word = (w: string) => new RegExp(`(?<![${FA}])${w.replace(/ /g, "\\s")}(?:ی)?(?![${FA}])`);
const inRange = (g: number) => g >= cfg.weightRangeG[0] && g <= cfg.weightRangeG[1];
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function weightsInText(text: string): { grams: number; evidence: string }[] {
  let rest = text;
  const out: { grams: number; evidence: string }[] = [];
  const take = (re: RegExp, toGrams: (m: RegExpMatchArray) => number) => {
    for (const m of rest.matchAll(new RegExp(re, "g"))) out.push({ grams: round3(toGrams(m)), evidence: m[0] });
    rest = rest.replace(new RegExp(re, "g"), " ");
  };
  take(new RegExp(`${NUM}\\s*گرم\\s*و\\s*(\\d+)\\s*سوت`), (m) => Number(m[1]) + Number(m[2]) / 1000);
  take(new RegExp(`${NUM}\\s*(?:میلی\\s*گرم|mg)`, "i"), (m) => Number(m[1]) / 1000);
  take(new RegExp(`وزن\\s*:?\\s*${NUM}\\s*سوت`), (m) => sotToGrams(m[1]!));
  take(new RegExp(`وزن\\s*:?\\s*${NUM}(?:\\s*گرم)?`), (m) => Number(m[1]));
  take(new RegExp(`${NUM}\\s*(?:گرمی|گرم|گ)(?![${FA}])`), (m) => Number(m[1]));
  take(new RegExp(`${NUM}\\s*سوت`), (m) => sotToGrams(m[1]!));
  return out;
}

// «۷۵۰ سوت» is 0.75 g, but sellers also write «۰/۶۳۰ سوت» for 0.63 g: a decimal sot value is grams.
const sotToGrams = (n: string) => (n.includes(".") ? Number(n) : Number(n) / 1000);

function weightValue(part: string): number {
  const m = part.match(new RegExp(`${NUM}\\s*(سوت|میلی\\s*گرم|mg|گرم)?`, "i"));
  if (!m) return NaN;
  const unit = (m[2] ?? "").toLowerCase();
  return round3(unit === "سوت" ? sotToGrams(m[1]!) : unit === "mg" || unit.startsWith("میلی") ? Number(m[1]) / 1000 : Number(m[1]));
}

function weightFromSpecs(specs: Record<string, string>): Found<number> | null {
  for (const [key, raw] of Object.entries(specs)) {
    const k = normalize(key);
    let v = normalize(raw);
    const inValue = v.match(/^وزن\s*:?\s*/); // e.g. key «پلاک طلا دوطرفه», value «وزن: ۰/۶۳۰سوت»
    if (inValue) v = v.slice(inValue[0].length);
    else if (!/وزن|weight/i.test(k) || cfg.weightSpecKeyIgnore.some((w) => k.includes(w))) continue;
    const values = v
      .split(",")
      .map(weightValue)
      .filter((g) => Number.isFinite(g));
    const distinct = [...new Set(values)];
    if (distinct.length === 1 && inRange(distinct[0]!)) return { value: distinct[0]!, provenance: "spec", evidence: `${key}: ${raw}` };
  }
  return null;
}

function karatFrom(text: string): number | null {
  const byWord = text.match(/(\d{2})\s*عیار/) ?? text.match(/عیار\s*(\d{2,3})(?!\d)/);
  if (byWord && cfg.karatByNumber[Number(byWord[1])]) return cfg.karatByNumber[Number(byWord[1])]!;
  const byFineness = text.match(/(?<![\d.])(750|875|995|999)(?![\d.])(?!\s*سوت)/);
  return byFineness ? cfg.karatByNumber[Number(byFineness[1])]! : null;
}

// Keys named «عیار» first; then any spec value that states a karat, unless it is a plating karat.
function karatFromSpecs(specs: Record<string, string>): Found<number> | null {
  for (const [key, raw] of Object.entries(specs)) {
    if (!normalize(key).includes("عیار")) continue;
    const v = normalize(raw);
    const k = karatFrom(v) ?? cfg.karatByNumber[Number(v.match(/^\d+/)?.[0])] ?? null;
    if (k) return { value: k, provenance: "spec", evidence: `${key}: ${raw}` };
  }
  for (const [key, raw] of Object.entries(specs)) {
    const v = normalize(raw);
    if (!v.includes("عیار") || cfg.platingWords.some((w) => v.includes(w))) continue;
    const k = karatFrom(v);
    if (k) return { value: k, provenance: "spec", evidence: `${key}: ${raw}` };
  }
  return null;
}

function percentFromSpecs(specs: Record<string, string>, keyWord: string): Found<number> | null {
  for (const [key, raw] of Object.entries(specs)) {
    const k = normalize(key);
    if (!k.includes(keyWord) || k.includes("فیلتر")) continue;
    const m = normalize(raw).match(new RegExp(NUM));
    if (m && Number(m[1]) <= 100) return { value: Number(m[1]), provenance: "spec", evidence: `${key}: ${raw}` };
  }
  return null;
}

function ojratFromTitle(title: string): Found<number> | null {
  if (word("بدون اجرت").test(title)) return { value: 0, provenance: "title", evidence: "بدون اجرت" };
  const m = title.match(new RegExp(`اجرت\\s*${NUM}\\s*(?:درصد|%)`));
  return m ? { value: Number(m[1]), provenance: "title", evidence: m[0] } : null;
}

function firstFound<T>(text: string, entries: { value: T; patterns: string[] }[]): Found<T> | null {
  let best: { at: number; found: Found<T> } | null = null;
  for (const e of entries)
    for (const p of e.patterns) {
      const m = text.match(word(p));
      if (m && m.index !== undefined && (!best || m.index < best.at)) best = { at: m.index, found: { value: e.value, provenance: "title", evidence: m[0] } };
    }
  return best?.found ?? null;
}

function audienceFrom(text: string, provenance: Provenance): Found<"women" | "men" | "kids"> | null {
  const hits = (Object.entries(cfg.audience) as ["women" | "men" | "kids", string[]][]).filter(([, words]) => words.some((w) => word(w).test(text)));
  if (hits.length !== 1) return null; // none, or both women and men: unisex
  return { value: hits[0]![0], provenance, evidence: hits[0]![1].find((w) => word(w).test(text))! };
}

function nonGoldFrom(title: string, specs: Record<string, string>): { kind: Found<NonGoldKind> | null; cost: Found<number> | null } {
  for (const [key, raw] of Object.entries(specs)) {
    if (normalize(key) !== "متعلقات") continue;
    const cost = Number(normalize(raw).match(/^\d+/)?.[0]);
    if (cost > 0) {
      const found: Found<number> = { value: cost, provenance: "spec", evidence: `${key}: ${raw}` };
      return { kind: { value: "declared", provenance: "spec", evidence: found.evidence }, cost: found };
    }
  }
  for (const kind of ["stones", "cord", "beads"] as const) {
    const w = cfg.nonGold[kind].find((x) => word(x).test(title));
    if (w) return { kind: { value: kind, provenance: "title", evidence: w }, cost: null };
  }
  for (const [key, raw] of Object.entries(specs)) {
    const v = normalize(raw);
    if (cfg.stoneSpecKeys.includes(normalize(key)) && v && !cfg.noneValues.includes(v)) {
      return { kind: { value: "stones", provenance: "spec", evidence: `${key}: ${raw}` }, cost: null };
    }
  }
  return { kind: null, cost: null };
}

export function extract(p: ProductText): Attributes {
  const title = normalize(p.title);
  const shop = normalize(p.shop ?? "");

  const titleWeights = weightsInText(title).filter((w) => inRange(w.grams));
  const distinctTitle = [...new Set(titleWeights.map((w) => w.grams))];
  const fromTitle: Found<number> | null =
    distinctTitle.length === 1 ? { value: distinctTitle[0]!, provenance: "title", evidence: titleWeights[0]!.evidence } : null;
  const fromSpec = weightFromSpecs(p.specs);
  const weight = fromSpec ?? fromTitle; // BR-20: specs before title
  const conflict = !!fromSpec && !!fromTitle && Math.abs(fromSpec.value - fromTitle.value) > cfg.weightConflictToleranceG;

  const titleKarat = karatFrom(title);
  const karat = karatFromSpecs(p.specs) ?? (titleKarat ? { value: titleKarat, provenance: "title" as const, evidence: `${titleKarat} عیار` } : null);

  const gallery = firstFound(
    `${shop} ${title}`,
    cfg.galleries.map((g) => ({ value: g.name, patterns: g.patterns })),
  );
  const itemType = firstFound(
    title,
    cfg.itemTypes.map(([w, v]) => ({ value: v, patterns: [w] })),
  );
  const genderSpec = Object.entries(p.specs).find(([k]) => /جنسیت|مناسب/.test(normalize(k)));
  const audience = audienceFrom(title, "title") ?? (genderSpec ? audienceFrom(normalize(genderSpec[1]), "spec") : null);
  const used = cfg.usedWords.find((w) => word(w).test(title));

  const styles = cfg.styleTags
    .map((t) => ({ t, m: title.match(new RegExp(t.patterns.map((x) => word(x).source).join("|"))) }))
    .filter((x) => x.m && x.m.index !== undefined)
    .sort((a, b) => a.m!.index! - b.m!.index!)
    .map((x) => ({ value: x.t.value, provenance: "title" as const, evidence: x.m![0] }));

  const nonGold = nonGoldFrom(title, p.specs);
  return {
    weight_g: weight,
    weight_conflict: conflict,
    karat,
    declared_ojrat_pct: percentFromSpecs(p.specs, "اجرت") ?? ojratFromTitle(title),
    declared_profit_pct: percentFromSpecs(p.specs, "سود"),
    gallery,
    item_type: itemType,
    audience,
    condition: used ? { value: "used", provenance: "title", evidence: used } : null,
    style_tags: styles,
    non_gold: nonGold.kind,
    non_gold_cost_toman: nonGold.cost,
  };
}

type DetailsBody = {
  structural_specs?: { headers?: { specs?: Record<string, string> }[] };
  key_specs?: { items?: { key?: string; value?: string | string[] }[] }[];
};

export function specsFromDetails(body: DetailsBody): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string, v: string) => {
    if (out[k] === undefined) out[k] = v;
    else if (out[k] !== v) out[k] = `${out[k]}, ${v}`; // the two lists can share a key with different detail
  };
  for (const h of body.structural_specs?.headers ?? []) {
    for (const [k, v] of Object.entries(h.specs ?? {})) put(k, String(v)); // Torob sometimes sends a number
  }
  for (const h of body.key_specs ?? [])
    for (const it of h.items ?? []) {
      if (it.key) put(it.key, Array.isArray(it.value) ? it.value.join(", ") : (it.value ?? ""));
    }
  return out;
}

// BR-29: an LLM value survives only if the same number is written in the text.
export function acceptLlmNumber(value: number, text: string): boolean {
  return [...normalize(text).matchAll(/\d+(?:\.\d+)?/g)].some((m) => Math.abs(Number(m[0]) - value) < 1e-9);
}
