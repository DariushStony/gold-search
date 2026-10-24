import { test } from "node:test";
import assert from "node:assert/strict";
import { goldValue, premiumPct, resaleValue, impliedOjratPct, breakevenG, requiredRisePct, vatRateFor, priceBreakdown } from "../../src/core/price.ts";

const close = (actual: number, expected: number, tol: number) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected} ± ${tol}, got ${actual}`);

test("AC-PM-01 (BR-40, BR-41): 1 g at G 27,000,000 priced 36,450,000 ⇒ gold value 27,000,000, premium 35%", () => {
  assert.equal(goldValue(1, 27_000_000, 18), 27_000_000);
  close(premiumPct(36_450_000, 27_000_000), 35, 1e-9);
});

test("BR-40: karat scales gold value; 21k is 21/18 of 18k", () => {
  assert.equal(goldValue(2, 27_000_000, 21), 63_000_000);
});

test("AC-PM-02 (BR-42): resale of 1 g at G 27,000,000 is 26,640,000", () => {
  assert.equal(resaleValue(1, 27_000_000, 18), 26_640_000);
});

test("AC-PM-03 (BR-43): price ratio 1.242 ⇒ implied ojrat 14.0% with p 7%, v 10%", () => {
  close(impliedOjratPct(1.242, 0.10, 0.07), 14.0, 0.05);
});

test("AC-PM-05 (BR-45): 1 g priced 34,000,000 ⇒ G* 34,459,459 and 27.6% rise from G 27,000,000", () => {
  close(breakevenG(34_000_000, 1, 18), 34_459_459.46, 0.01);
  close(requiredRisePct(34_459_459.46, 27_000_000), 27.63, 0.01);
});

test("AC-PM-04 (BR-44): VAT for a fetch dated 1405 comes from config as 10%", () => {
  assert.equal(vatRateFor(new Date("2026-10-22T06:45:00Z")), 0.10);
});

test("BR-44: a year missing from config is an error, not a silent default", () => {
  assert.throws(() => vatRateFor(new Date("2031-06-01T00:00:00Z")), /VAT rate/);
});

const base = { price: 49_179_516, weight_g: 1.7, karat: 18, g_at_fetch: 27_017_000, g_live: 27_100_000, declared_ojrat_pct: null, non_gold: { has: false, declared_cost_toman: null }, vat: 0.10, profit: 0.07 };

test("AC-PM-08 (BR-48): premium uses G at fetch, resale and rise use the live G", () => {
  const b = priceBreakdown(base);
  assert.equal(b.gold_value, 45_928_900);
  assert.equal(Number(b.premium_pct.toFixed(1)), 7.1);
  assert.equal(b.resale_value, 45_455_733);
  assert.equal(Number(b.required_rise_pct!.toFixed(1)), 8.2);
});

test("PRD §12: without a live G, resale and rise are null but the premium stays", () => {
  const b = priceBreakdown({ ...base, g_live: null });
  assert.equal(b.resale_value, null);
  assert.equal(b.required_rise_pct, null);
  assert.equal(Number(b.premium_pct.toFixed(1)), 7.1);
});

test("parts sum to the price: gold, implied ojrat, 7% profit, 10% VAT on ojrat + profit", () => {
  const b = priceBreakdown(base);
  assert.deepEqual(b.parts, { gold: 45_928_900, ojrat: -242_914, profit: 3_198_019, vat: 295_511 });
  assert.equal(b.parts!.gold + b.parts!.ojrat + b.parts!.profit + b.parts!.vat, base.price);
});

test("AC-PM-07 (BR-47): declared ojrat 15% with VAT charged on the whole price ⇒ overcharge flagged", () => {
  const whole = { ...base, weight_g: 1, g_at_fetch: 27_000_000, declared_ojrat_pct: 15, price: 36_545_850 };
  assert.equal(priceBreakdown(whole).vat_overcharge, true);
  assert.equal(priceBreakdown({ ...whole, price: 33_845_850 }).vat_overcharge, false);
});

test("BR-47: no declared ojrat ⇒ no overcharge check", () => {
  assert.equal(priceBreakdown({ ...base, price: 36_545_850, weight_g: 1, g_at_fetch: 27_000_000 }).vat_overcharge, false);
});

test("BR-2A: non-gold parts without a declared cost ⇒ partial, no implied ojrat, no parts", () => {
  const b = priceBreakdown({ ...base, non_gold: { has: true, declared_cost_toman: null } });
  assert.equal(b.partial_reason, "non_gold_parts");
  assert.equal(b.implied_ojrat_pct, null);
  assert.equal(b.parts, null);
});

test("BR-2A: a declared non-gold cost is subtracted before the math", () => {
  const b = priceBreakdown({ ...base, price: 51_179_516, non_gold: { has: true, declared_cost_toman: 2_000_000 } });
  assert.equal(b.partial_reason, null);
  assert.equal(Number(b.premium_pct.toFixed(1)), 7.1);
});
