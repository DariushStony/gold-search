// K-05 search: filters (BR-60), representative offer (BR-84), sections (BR-61, BR-63, BR-59, BR-54),
// intent scoring (BR-62–BR-66), relax hint (BR-67) and the #1-vs-#2 explanation (BR-70–BR-73).
import { config } from "./config.ts";
import { eligibleOffers, isStale, type OfferFilters, type OfferRow } from "./offers.ts";
import type { Label } from "./label.ts";
import type { Chip, ChipKind } from "./parse.ts";
import { goldValue, impliedOjratPct, vatRateFor } from "./price.ts";
import { formatPct } from "./format.ts";

export type ProductRecord = {
  id: string;
  title: string;
  image_url: string | null;
  label: Label;
  reasons: string[];
  sponsored: boolean;
  attrs: {
    weight_g: number | null;
    karat: number | null;
    item_type: string | null;
    audience: string | null;
    condition: "used" | null;
    gallery: string | null;
    style_tags: string[];
    non_gold: boolean;
    declared_ojrat_pct: number | null;
  };
  offers: (OfferRow & { g_at_fetch: number | null })[];
};
export type Ctx = { finishedAt: string; archive: boolean; gLive: number | null };
export type ComponentName = keyof typeof config.rank.weights.gift;
export type Card = {
  id: string;
  title: string;
  image_url: string | null;
  label: Label;
  reasons: string[];
  weight_unknown: boolean;
  offer: ProductRecord["offers"][number] & { stale: boolean; premium_pct: number | null };
  offer_count: number;
  price_range: [number, number];
  score: number;
  components: { name: ComponentName; weight: number; value: number }[];
};
export type SearchResult = {
  intent: "gift" | "beauty" | "savings" | "unknown";
  results: Card[];
  review: Card[];
  weight_unknown_bucket: Card[];
  ojrat_unknown: Card[];
  sponsored: Card[];
  excluded_count: number;
  explanation: { text: string; numbers: number[]; template: boolean } | null;
  relax: { chip_index: number; kind: ChipKind; results_if_removed: number } | null;
};

const R = config.rank;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const values = (chips: Chip[], kind: ChipKind) => chips.filter((c) => c.kind === kind).map((c) => c.value);
const first = (chips: Chip[], kind: ChipKind) => values(chips, kind)[0];

function premiumOf(p: ProductRecord, o: ProductRecord["offers"][number]): number | null {
  if (p.attrs.weight_g === null || o.g_at_fetch === null || p.attrs.non_gold) return null;
  return (o.price / goldValue(p.attrs.weight_g, o.g_at_fetch, p.attrs.karat ?? 18) - 1) * 100;
}

// BR-59: the declared ojrat if the shop gave one, else the implied ojrat of BR-43; null when it cannot be checked.
function ojratOf(p: ProductRecord, o: ProductRecord["offers"][number]): number | null {
  if (p.attrs.non_gold || p.attrs.weight_g === null || o.g_at_fetch === null) return null;
  if (p.attrs.declared_ojrat_pct !== null) return p.attrs.declared_ojrat_pct;
  const ratio = o.price / goldValue(p.attrs.weight_g, o.g_at_fetch, p.attrs.karat ?? 18);
  return impliedOjratPct(ratio, vatRateFor(new Date(o.fetched_at)), config.price.profit);
}

export function components(
  p: ProductRecord,
  o: ProductRecord["offers"][number],
  chips: Chip[],
  ctx: Ctx & { candidates: ProductRecord[] },
): Record<ComponentName, number> {
  const w = p.attrs.weight_g;
  const target = first(chips, "budget_target") as number | undefined;
  const wTarget = first(chips, "weight_target") as number | undefined;
  const pref = first(chips, "weight_pref") as "light" | "heavy" | undefined;
  let weightFit = 1;
  if (wTarget !== undefined) weightFit = w === null ? R.unknownWeightFit : clamp(1 - Math.abs(w - wTarget) / (R.weightBand * wTarget));
  else if (pref) {
    const known = ctx.candidates.map((c) => c.attrs.weight_g).filter((x): x is number => x !== null);
    const [lo, hi] = [Math.min(...known), Math.max(...known)];
    weightFit = w === null ? R.unknownWeightFit : hi === lo ? 1 : pref === "light" ? (hi - w) / (hi - lo) : (w - lo) / (hi - lo);
  }
  const styles = values(chips, "style") as string[];
  const premium = premiumOf(p, o);
  const age = (Date.parse(ctx.finishedAt) - Date.parse(o.fetched_at)) / 3_600_000;
  return {
    budget_fit: target === undefined ? 1 : clamp(1 - Math.abs(o.price - target) / (R.budgetBand * target)),
    weight_fit: weightFit,
    type_style_fit: styles.length === 0 ? 1 : styles.filter((s) => p.attrs.style_tags.includes(s) || p.title.includes(s)).length / styles.length,
    seller_trust: p.attrs.gallery ? 1 : o.shop_score_pct !== null ? o.shop_score_pct / 100 : R.unknownShopScore,
    newness: p.attrs.condition === "used" ? 0 : 1,
    low_premium: premium === null ? 0 : clamp(1 - premium / 100),
    weight_known: w === null ? 0 : 1,
    freshness: age <= 24 ? 1 : clamp(1 - (age - 24) / 144),
  };
}

type Route = "result" | "review" | "weight_bucket" | "ojrat_bucket" | "sponsored" | "excluded" | "hidden" | "filtered";

function route(
  p: ProductRecord,
  chips: Chip[],
  ctx: Ctx,
  intent: SearchResult["intent"],
): { route: Route; offer?: ProductRecord["offers"][number]; eligible?: ProductRecord["offers"] } {
  const a = p.attrs;
  const types = values(chips, "item_type");
  if (types.length && (a.item_type === null || !types.includes(a.item_type))) return { route: "filtered" };
  const karat = first(chips, "karat");
  if (karat !== undefined && (a.karat ?? 18) !== karat) return { route: "filtered" };
  const audience = first(chips, "audience") as string | undefined;
  // Unknown audience is compatible: most titles do not say who the piece is for.
  if (audience && a.audience && !(a.audience === audience || (a.audience === "kids" && audience.startsWith("kids")))) return { route: "filtered" };
  if (first(chips, "condition") === "used" && a.condition !== "used") return { route: "filtered" };
  if (first(chips, "no_stones") === true && a.non_gold) return { route: "filtered" };

  const f: OfferFilters = {
    shop: first(chips, "shop") as string | undefined,
    city: first(chips, "city") as string | undefined,
    in_person: first(chips, "in_person") === true,
    torob_pay: first(chips, "torob_pay") === true,
  };
  const eligible = eligibleOffers(p.offers, f, ctx.finishedAt, ctx.archive) as ProductRecord["offers"];
  const offer = eligible[0];
  if (!offer) return { route: "filtered" };

  const min = first(chips, "budget_min") as number | undefined,
    max = first(chips, "budget_max") as number | undefined;
  const target = first(chips, "budget_target") as number | undefined;
  if ((min !== undefined && offer.price < min) || (max !== undefined && offer.price > max)) return { route: "filtered" };
  if (target !== undefined && Math.abs(offer.price - target) > R.budgetBand * target + 1e-6) return { route: "filtered" };

  if (p.label === "not_gold") return { route: "excluded" };
  if (p.label === "review") return { route: "review", offer, eligible };
  if (p.label === "mixed" && intent !== "gift") return { route: "hidden" };

  const wMin = first(chips, "weight_min") as number | undefined,
    wMax = first(chips, "weight_max") as number | undefined;
  const wTarget = first(chips, "weight_target") as number | undefined;
  if (wMin !== undefined || wMax !== undefined || wTarget !== undefined) {
    if (a.weight_g === null) return { route: "weight_bucket", offer, eligible };
    const w = a.weight_g;
    if ((wMin !== undefined && w < wMin) || (wMax !== undefined && w > wMax)) return { route: "filtered" };
    if (wTarget !== undefined && Math.abs(w - wTarget) > R.weightBand * wTarget + 1e-9) return { route: "filtered" };
  }
  const ojratMax = first(chips, "ojrat_max") as number | undefined;
  if (ojratMax !== undefined) {
    const o = ojratOf(p, offer);
    if (o === null) return { route: "ojrat_bucket", offer, eligible };
    if (o > ojratMax + 1e-9) return { route: "filtered" };
  }
  if (intent === "savings" && a.weight_g === null) return { route: "hidden" }; // BR-63
  if (p.sponsored) return { route: "sponsored", offer, eligible };
  return { route: "result", offer, eligible };
}

function card(
  p: ProductRecord,
  offer: ProductRecord["offers"][number],
  eligible: ProductRecord["offers"],
  chips: Chip[],
  ctx: Ctx & { candidates: ProductRecord[] },
  intent: SearchResult["intent"],
): Card {
  const comps = components(p, offer, chips, ctx);
  const weights = R.weights[intent];
  const list = (Object.keys(weights) as ComponentName[]).map((name) => ({ name, weight: weights[name], value: comps[name] }));
  const prices = eligible.map((o) => o.price);
  return {
    id: p.id,
    title: p.title,
    image_url: p.image_url,
    label: p.label,
    reasons: p.reasons,
    weight_unknown: p.attrs.weight_g === null,
    offer: { ...offer, stale: isStale(offer, ctx.finishedAt, ctx.archive), premium_pct: premiumOf(p, offer) },
    offer_count: eligible.length,
    price_range: [Math.min(...prices), Math.max(...prices)],
    score: list.reduce((s, c) => s + c.weight * c.value, 0),
    components: list,
  };
}

function explain(a: Card, b: Card): SearchResult["explanation"] {
  const reasons: { gain: number; text: string; numbers: number[] }[] = [];
  for (const c of a.components) {
    const other = b.components.find((x) => x.name === c.name)!;
    const gain = c.weight * (c.value - other.value);
    if (gain <= 0) continue;
    if (c.name === "low_premium" && a.offer.premium_pct !== null && b.offer.premium_pct !== null) {
      const [x, y] = [Number(a.offer.premium_pct.toFixed(1)), Number(b.offer.premium_pct.toFixed(1))];
      reasons.push({ gain, text: `این یکی ${formatPct(x)} بالاتر از ارزش طلاست و دومی ${formatPct(y)}`, numbers: [x, y] }); // TX-66
    }
    // Other reasons wait for their content-guide text (CR-02); config.explain.extraReasons stays off until then.
  }
  const top = reasons.sort((x, y) => y.gain - x.gain).slice(0, 3);
  if (top.length === 0) return null;
  return { text: `چرا اولی؟ ${top.map((r) => r.text).join("، ")}`, numbers: top.flatMap((r) => r.numbers).slice(0, 3), template: true }; // TX-65
}

function rank(cards: Card[], chips: Chip[], products: Map<string, ProductRecord>): Card[] {
  const byOjrat = first(chips, "ojrat_sort") === "asc";
  const ojrat = (c: Card) => ojratOf(products.get(c.id)!, c.offer) ?? Infinity;
  return cards.sort((x, y) => (byOjrat ? ojrat(x) - ojrat(y) : 0) || y.score - x.score || x.offer.price - y.offer.price || x.id.localeCompare(y.id)); // BR-65
}

export function search(products: ProductRecord[], chips: Chip[], ctx: Ctx): SearchResult {
  const intent = (first(chips, "intent") as SearchResult["intent"] | undefined) ?? "unknown";
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: SearchResult = {
    intent,
    results: [],
    review: [],
    weight_unknown_bucket: [],
    ojrat_unknown: [],
    sponsored: [],
    excluded_count: 0,
    explanation: null,
    relax: null,
  };
  const routed = products.map((p) => ({ p, ...route(p, chips, ctx, intent) }));
  const candidates = routed.filter((r) => r.route === "result").map((r) => r.p);
  const full = { ...ctx, candidates };
  for (const r of routed) {
    if (r.route === "excluded") {
      out.excluded_count++;
      continue;
    }
    if (!r.offer || !r.eligible) continue;
    const c = card(r.p, r.offer, r.eligible, chips, full, intent);
    if (r.route === "result") out.results.push(c);
    else if (r.route === "review") out.review.push(c);
    else if (r.route === "weight_bucket") out.weight_unknown_bucket.push(c);
    else if (r.route === "ojrat_bucket") out.ojrat_unknown.push(c);
    else if (r.route === "sponsored") out.sponsored.push(c);
  }
  for (const list of [out.results, out.review, out.weight_unknown_bucket, out.ojrat_unknown, out.sponsored]) rank(list, chips, byId);
  if (out.results.length >= 2) out.explanation = explain(out.results[0]!, out.results[1]!);

  if (out.results.length === 0) {
    // BR-67
    const filterChips = chips
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.role === "filter" || c.role === "filter_and_sort")
      .filter(({ c }) => c.kind !== "intent");
    // Most results brought back first; on a tie, the filter that alone removed the most (BR-67 wording), then chip order.
    const scored = filterChips
      .map(({ c, i }) => ({
        c,
        i,
        back: products.filter(
          (p) =>
            route(
              p,
              chips.filter((_, j) => j !== i),
              ctx,
              intent,
            ).route === "result",
        ).length,
        removed: products.filter((p) => route(p, [c], ctx, intent).route === "filtered").length,
      }))
      .sort((x, y) => y.back - x.back || y.removed - x.removed || x.i - y.i);
    const top = scored[0];
    out.relax = top ? { chip_index: top.i, kind: top.c.kind, results_if_removed: top.back } : null;
  }
  return out;
}

// BR-39: the not-gold products a search set aside, for «{n} مورد غیرطلا کنار گذاشته شد».
export function excludedFor(products: ProductRecord[], chips: Chip[], ctx: Ctx): ProductRecord[] {
  const intent = (first(chips, "intent") as SearchResult["intent"] | undefined) ?? "unknown";
  return products.filter((p) => route(p, chips, ctx, intent).route === "excluded");
}
