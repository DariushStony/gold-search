import { config as defaults, type Config } from "../../core/config.ts";
import { normalize } from "../../shared/text.ts";
import type { Attributes } from "./extract.ts";
import { goldValue } from "../pricing/price.ts";
import { TX } from "../../shared/strings.ts";

export type Label = "real" | "mixed" | "not_gold" | "review";
export type LabelResult = { label: Label; reasons: string[]; price_ratio: number | null; weight_unknown: boolean };
export type LabelInput = {
  title: string;
  specs: Record<string, string>;
  attributes: Attributes;
  price: number | null; // the representative offer's price (BR-84)
  g_at_fetch: number | null; // null when no quote was within 60 min of the fetch (DM-01)
  offer_titles: string[];
};

const FA = "\\u0600-\\u06FF";
const wordRe = (w: string) => new RegExp(`(?<![${FA}a-z])${w.replace(/ /g, "\\s")}(?:ی)?(?![${FA}a-z])`);
const prep = (s: string) => normalize(s).toLowerCase();
const wordIn = (text: string, words: string[]) => words.map((w) => text.match(wordRe(w))?.[0]).find((m) => m !== undefined) ?? null;

function notGoldWord(text: string, cfg: Config): string | null {
  for (const w of cfg.label.notGoldWords) {
    const m = text.match(wordRe(w));
    if (m) return m[0];
  }
  for (const p of cfg.label.notGoldPatterns) {
    const m = text.match(new RegExp(p));
    if (m) return m[0];
  }
  return null;
}

function mixedWord(text: string, cfg: Config): string | null {
  for (const w of cfg.label.mixedWords) {
    const m = text.match(wordRe(w));
    if (m) return m[0];
  }
  const goldAt = text.search(wordRe("طلا"));
  for (const w of cfg.label.mixedBeforeGoldWords) {
    const m = text.match(wordRe(w));
    if (m && m.index !== undefined && (goldAt < 0 || m.index < goldAt)) return m[0];
  }
  return null;
}

export function labelProduct(i: LabelInput, cfg: Config = defaults): LabelResult {
  const title = prep(i.title);
  const a = i.attributes;
  const weightUnknown = a.weight_g === null;
  const result = (label: Label, reasons: string[], ratio: number | null = null): LabelResult => ({
    label,
    reasons,
    price_ratio: ratio,
    weight_unknown: weightUnknown,
  });

  const notGold = notGoldWord(title, cfg); // BR-31
  if (notGold) return result("not_gold", [TX.inTitle(notGold)]);
  if (cfg.label.scanSpecs) {
    for (const [key, value] of Object.entries(i.specs)) {
      if (!cfg.label.specKeysToScan.some((k) => normalize(key).includes(k))) continue;
      const w = notGoldWord(prep(value), cfg);
      if (w) return result("not_gold", [TX.inSpecs(w)]);
    }
  }

  const mixed = mixedWord(title, cfg); // BR-32
  if (mixed) return result("mixed", [TX.inTitle(mixed)]);

  if (i.offer_titles.some((t) => notGoldWord(prep(t), cfg))) return result("review", [TX.shopTitleMismatch]); // BR-84

  const karat = a.karat?.value ?? 18;
  let ratio: number | null = null;
  if (a.weight_g && i.price && i.g_at_fetch) {
    ratio = i.price / goldValue(a.weight_g.value, i.g_at_fetch, karat); // BR-34
    if (ratio < cfg.label.lowRatio) return result("review", [TX.belowGoldValue], ratio); // BR-35
    if (ratio > cfg.label.highRatio && !a.non_gold) return result("review", [TX.weightOrUnitError], ratio); // BR-36
  }
  const russian = wordIn(title, cfg.label.notGoldUnlessRatioWords); // BR-33 (CR-09)
  if (russian && ratio === null) return result("not_gold", [TX.inTitle(russian)]);
  if (a.weight_g && i.price && !i.g_at_fetch) return result("review", [TX.noGoldPrice]); // CR-09: unchecked is not real
  const floor = cfg.label.minWeightFloorG;
  if (weightUnknown && floor !== null && i.price && i.g_at_fetch && i.price < goldValue(floor, i.g_at_fetch, karat)) {
    return result("review", [TX.belowMinWeightValue]);
  }

  const reasons: string[] = []; // BR-37, BR-38
  if (weightUnknown) reasons.push(TX.weightUnknown);
  if (!a.karat) reasons.push(TX.karatAssumed);
  if (reasons.length === 0) reasons.push(TX.consistentGold);
  return result("real", reasons, ratio);
}
