import { config } from "./config.ts";
import { jalaliYear } from "./format.ts";

const { resaleBasis } = config.price;

export const goldValue = (weightG: number, g: number, karat: number) => (weightG * g * karat) / 18; // BR-40
export const premiumPct = (price: number, gold: number) => (price / gold - 1) * 100; // BR-41
export const resaleValue = (weightG: number, g: number, karat: number) => (weightG * g * karat * 740) / (18 * 750); // BR-42

// BR-43: invert price = gold·[(1+v)(1+o)(1+p) − v] for o.
export const impliedOjratPct = (ratio: number, vat: number, profit: number) => ((ratio + vat) / ((1 + vat) * (1 + profit)) - 1) * 100;

export const breakevenG = (price: number, weightG: number, karat: number) => price / (weightG * (karat / 18) * resaleBasis); // BR-45
export const requiredRisePct = (gStar: number, gLive: number) => (gStar / gLive - 1) * 100; // BR-45

export function vatRateFor(fetchedAt: Date): number {
  const year = jalaliYear(fetchedAt);
  const rate = config.price.vatByJalaliYear[year];
  if (rate === undefined) throw new Error(`VAT rate for Jalali year ${year} is not in config (BR-44)`);
  return rate;
}

export type BreakdownInput = {
  price: number;
  weight_g: number;
  karat: number;
  g_at_fetch: number;
  g_live: number | null;
  declared_ojrat_pct: number | null;
  non_gold: { has: boolean; declared_cost_toman: number | null };
  vat: number;
  profit: number;
};

export type PriceBreakdown = {
  gold_value: number;
  premium_pct: number;
  implied_ojrat_pct: number | null;
  declared_ojrat_pct: number | null;
  parts: { gold: number; ojrat: number; profit: number; vat: number } | null;
  breakeven_g: number;
  resale_value: number | null;
  required_rise_pct: number | null;
  vat_overcharge: boolean;
  partial_reason: "non_gold_parts" | null;
};

export function priceBreakdown(i: BreakdownInput): PriceBreakdown {
  const partial = i.non_gold.has && i.non_gold.declared_cost_toman === null;
  const goldPrice = i.price - (i.non_gold.has ? (i.non_gold.declared_cost_toman ?? 0) : 0); // BR-2A
  const gold = Math.round(goldValue(i.weight_g, i.g_at_fetch, i.karat));
  const implied = partial ? null : impliedOjratPct(goldPrice / gold, i.vat, i.profit);

  let parts: PriceBreakdown["parts"] = null;
  if (implied !== null) {
    const o = implied / 100;
    const ojrat = Math.round(gold * o);
    const profit = Math.round(gold * (1 + o) * i.profit);
    parts = { gold, ojrat, profit, vat: goldPrice - gold - ojrat - profit }; // remainder keeps the sum exact
  }

  // BR-47: the declared ojrat reproduces the price only if VAT was charged on the whole price.
  let vatOvercharge = false;
  if (i.declared_ojrat_pct !== null) {
    const wholeVat = gold * (1 + i.declared_ojrat_pct / 100) * (1 + i.profit) * (1 + i.vat);
    vatOvercharge = Math.abs(goldPrice / wholeVat - 1) <= config.price.vatOverchargeTolerance;
  }

  const gStar = breakevenG(i.price, i.weight_g, i.karat);
  return {
    gold_value: gold,
    premium_pct: premiumPct(goldPrice, gold),
    implied_ojrat_pct: implied,
    declared_ojrat_pct: i.declared_ojrat_pct,
    parts,
    breakeven_g: Math.round(gStar),
    resale_value: i.g_live === null ? null : Math.round(resaleValue(i.weight_g, i.g_live, i.karat)),
    required_rise_pct: i.g_live === null ? null : requiredRisePct(gStar, i.g_live),
    vat_overcharge: vatOvercharge,
    partial_reason: partial ? "non_gold_parts" : null,
  };
}
