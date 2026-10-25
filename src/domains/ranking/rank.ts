// K-05 search: filters (BR-60), representative offer (BR-84), sections (BR-61, BR-63, BR-59, BR-54),
// intent scoring (BR-62–BR-66), relax hint (BR-67) and the #1-vs-#2 explanation (BR-70–BR-73).
import { config } from '../../core/config.ts';
import type { Chip, ChipKind } from '../../shared/chips.ts';
import { formatPct } from '../../shared/format.ts';
import type { Label } from '../catalog/label.ts';
import {
  eligibleOffers,
  isStale,
  type OfferFilters,
  type OfferRow,
} from '../catalog/offers.ts';
import { goldValue, impliedOjratPct, vatRateFor } from '../pricing/price.ts';

type ProductRecord = {
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
    condition: 'used' | null;
    gallery: string | null;
    style_tags: string[];
    non_gold: boolean;
    declared_ojrat_pct: number | null;
  };
  offers: (OfferRow & { g_at_fetch: number | null })[];
};
type Ctx = { finishedAt: string; archive: boolean; gLive: number | null };
type ComponentName = keyof typeof config.rank.weights.gift;
type Card = {
  id: string;
  title: string;
  image_url: string | null;
  label: Label;
  reasons: string[];
  weight_unknown: boolean;
  offer: ProductRecord['offers'][number] & { stale: boolean; premium_pct: number | null };
  offer_count: number;
  price_range: [number, number];
  score: number;
  components: { name: ComponentName; weight: number; value: number }[];
};
type SearchResult = {
  intent: 'gift' | 'beauty' | 'savings' | 'unknown';
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
const values = (chips: Chip[], kind: ChipKind) =>
  chips.filter((c) => c.kind === kind).map((c) => c.value);
const first = (chips: Chip[], kind: ChipKind) => values(chips, kind)[0];

function premiumOf(p: ProductRecord, o: ProductRecord['offers'][number]): number | null {
  if (p.attrs.weight_g === null || o.g_at_fetch === null || p.attrs.non_gold) return null;
  return (
    (o.price / goldValue(p.attrs.weight_g, o.g_at_fetch, p.attrs.karat ?? 18) - 1) * 100
  );
}

// BR-62 (CR-09): Torob's stars and time on Torob, half each; a part Torob does not show counts as unknown.
function sellerTrust(p: ProductRecord, o: ProductRecord['offers'][number]): number {
  if (p.attrs.gallery) return 1;
  if (o.shop_stars === null && o.shop_months === null) return R.unknownShopScore;
  const stars =
    o.shop_stars === null ? R.unknownShopScore : clamp(o.shop_stars - R.sellerStarsFloor);
  const tenure =
    o.shop_months === null
      ? R.unknownShopScore
      : clamp(o.shop_months / R.sellerFullMonths);
  return (stars + tenure) / 2;
}

const medianPrices = new WeakMap<ProductRecord[], number | undefined>();
function medianPrice(ctx: Ctx & { candidates: ProductRecord[] }): number | undefined {
  if (!medianPrices.has(ctx.candidates)) {
    const prices = ctx.candidates
      .map((c) => eligibleOffers(c.offers, {}, ctx.finishedAt, ctx.archive)[0]?.price)
      .filter((x): x is number => x !== undefined)
      .sort((a, b) => a - b);
    medianPrices.set(ctx.candidates, prices[Math.floor(prices.length / 2)]);
  }
  return medianPrices.get(ctx.candidates);
}

// BR-59: the declared ojrat if the shop gave one, else the implied ojrat of BR-43; null when it cannot be checked.
function ojratOf(p: ProductRecord, o: ProductRecord['offers'][number]): number | null {
  if (p.attrs.non_gold || p.attrs.weight_g === null || o.g_at_fetch === null) return null;
  if (p.attrs.declared_ojrat_pct !== null) return p.attrs.declared_ojrat_pct;
  const ratio = o.price / goldValue(p.attrs.weight_g, o.g_at_fetch, p.attrs.karat ?? 18);
  return impliedOjratPct(ratio, vatRateFor(new Date(o.fetched_at)), config.price.profit);
}

function components(
  p: ProductRecord,
  o: ProductRecord['offers'][number],
  chips: Chip[],
  ctx: Ctx & { candidates: ProductRecord[] },
): Record<ComponentName, number> {
  const w = p.attrs.weight_g;
  const target = first(chips, 'budget_target') as number | undefined;
  const wTarget = first(chips, 'weight_target') as number | undefined;
  const pref = first(chips, 'weight_pref') as 'light' | 'heavy' | undefined;
  const max = first(chips, 'budget_max') as number | undefined;
  const noBudget =
    target === undefined && max === undefined && first(chips, 'budget_min') === undefined;
  const gift = first(chips, 'intent') === 'gift';
  let weightFit = 1;
  if (wTarget !== undefined) {
    weightFit =
      w === null
        ? R.unknownWeightFit
        : clamp(1 - Math.abs(w - wTarget) / (R.weightBand * wTarget));
  } else if (pref) {
    // «ظریف» asks for a piece that is not heavy, not for the least gold: any weight up to the median scores full.
    const known = ctx.candidates
      .map((c) => c.attrs.weight_g)
      .filter((x): x is number => x !== null)
      .sort((a, b) => a - b);
    const [lo, hi, mid] = [
      known[0]!,
      known.at(-1)!,
      known[Math.floor(known.length / 2)]!,
    ];
    if (w === null) weightFit = R.unknownWeightFit;
    else if (pref === 'light') {
      weightFit = w <= mid ? 1 : hi === mid ? 1 : (hi - w) / (hi - mid);
    } else weightFit = w >= mid ? 1 : mid === lo ? 1 : (w - lo) / (mid - lo);
  }
  const styles = values(chips, 'style') as string[];
  // CR-09: with no budget, the dearest piece should not lead just because its ojrat is a small share of its price.
  const typicalPrice = noBudget ? medianPrice(ctx) : undefined;
  const typical =
    typicalPrice === undefined || o.price <= typicalPrice
      ? 1
      : clamp(1 - Math.log(o.price / typicalPrice) / Math.log(R.typicalPriceSpread));
  const premium = premiumOf(p, o);
  const age = (Date.parse(ctx.finishedAt) - Date.parse(o.fetched_at)) / 3_600_000;
  return {
    // A gift budget is what the buyer means to spend, so a gift near it fits better than one far below it.
    budget_fit:
      target !== undefined
        ? clamp(1 - Math.abs(o.price - target) / (R.budgetBand * target))
        : gift && max !== undefined
          ? clamp(o.price / max)
          : noBudget
            ? typical
            : 1,
    weight_fit: weightFit,
    type_style_fit:
      styles.length === 0
        ? 1
        : styles.filter((s) => p.attrs.style_tags.includes(s) || p.title.includes(s))
            .length / styles.length,
    seller_trust: sellerTrust(p, o),
    newness: p.attrs.condition === 'used' ? 0 : 1,
    low_premium: premium === null ? 0 : clamp(1 - premium / 100),
    weight_known: w === null ? 0 : 1,
    freshness: age <= 24 ? 1 : clamp(1 - (age - 24) / 144),
  };
}

type Route =
  | 'result'
  | 'review'
  | 'weight_bucket'
  | 'ojrat_bucket'
  | 'sponsored'
  | 'excluded'
  | 'hidden'
  | 'filtered';

function route(
  p: ProductRecord,
  chips: Chip[],
  ctx: Ctx,
  intent: SearchResult['intent'],
): {
  route: Route;
  offer?: ProductRecord['offers'][number];
  eligible?: ProductRecord['offers'];
} {
  const a = p.attrs;
  const types = values(chips, 'item_type');
  if (types.length && (a.item_type === null || !types.includes(a.item_type))) {
    return { route: 'filtered' };
  }
  const karat = first(chips, 'karat');
  if (karat !== undefined && (a.karat ?? 18) !== karat) return { route: 'filtered' };
  const audience = first(chips, 'audience') as string | undefined;
  // Unknown audience is compatible: most titles do not say who the piece is for.
  if (
    audience &&
    a.audience &&
    !(a.audience === audience || (a.audience === 'kids' && audience.startsWith('kids')))
  ) {
    return { route: 'filtered' };
  }
  if (first(chips, 'condition') === 'used' && a.condition !== 'used') {
    return { route: 'filtered' };
  }
  if (first(chips, 'no_stones') === true && a.non_gold) return { route: 'filtered' };

  const f: OfferFilters = {
    shop: first(chips, 'shop') as string | undefined,
    city: first(chips, 'city') as string | undefined,
    in_person: first(chips, 'in_person') === true,
    torob_pay: first(chips, 'torob_pay') === true,
  };
  const eligible = eligibleOffers(
    p.offers,
    f,
    ctx.finishedAt,
    ctx.archive,
  ) as ProductRecord['offers'];
  const offer = eligible[0];
  if (!offer) return { route: 'filtered' };

  const min = first(chips, 'budget_min') as number | undefined,
    max = first(chips, 'budget_max') as number | undefined;
  const target = first(chips, 'budget_target') as number | undefined;
  if (
    (min !== undefined && offer.price < min) ||
    (max !== undefined && offer.price > max)
  ) {
    return { route: 'filtered' };
  }
  if (
    target !== undefined &&
    Math.abs(offer.price - target) > R.budgetBand * target + 1e-6
  ) {
    return { route: 'filtered' };
  }

  if (p.label === 'not_gold') return { route: 'excluded' };
  if (p.label === 'review') return { route: 'review', offer, eligible };
  if (p.label === 'mixed' && intent !== 'gift') return { route: 'hidden' };

  const wMin = first(chips, 'weight_min') as number | undefined,
    wMax = first(chips, 'weight_max') as number | undefined;
  const wTarget = first(chips, 'weight_target') as number | undefined;
  if (wMin !== undefined || wMax !== undefined || wTarget !== undefined) {
    if (a.weight_g === null) return { route: 'weight_bucket', offer, eligible };
    const w = a.weight_g;
    if ((wMin !== undefined && w < wMin) || (wMax !== undefined && w > wMax)) {
      return { route: 'filtered' };
    }
    if (wTarget !== undefined && Math.abs(w - wTarget) > R.weightBand * wTarget + 1e-9) {
      return { route: 'filtered' };
    }
  }
  const ojratMax = first(chips, 'ojrat_max') as number | undefined;
  if (ojratMax !== undefined) {
    const o = ojratOf(p, offer);
    if (o === null) return { route: 'ojrat_bucket', offer, eligible };
    if (o > ojratMax + 1e-9) return { route: 'filtered' };
  }
  if (intent === 'savings' && a.weight_g === null) return { route: 'hidden' }; // BR-63
  if (p.sponsored) return { route: 'sponsored', offer, eligible };
  return { route: 'result', offer, eligible };
}

// BR-62 (CR-09): a style or weight the sentence did not ask for scores 1 for every piece, so its weight is shared out
// among the parts that tell the pieces apart. The order does not change; the score and its parts read true.
function weightsFor(
  intent: SearchResult['intent'],
  chips: Chip[],
): Record<ComponentName, number> {
  const w = { ...R.weights[intent] };
  if (values(chips, 'style').length === 0) w.type_style_fit = 0;
  if (
    first(chips, 'weight_target') === undefined &&
    first(chips, 'weight_pref') === undefined
  ) {
    w.weight_fit = 0;
  }
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / sum])) as Record<
    ComponentName,
    number
  >;
}

function card(
  p: ProductRecord,
  offer: ProductRecord['offers'][number],
  eligible: ProductRecord['offers'],
  chips: Chip[],
  ctx: Ctx & { candidates: ProductRecord[] },
  weights: Record<ComponentName, number>,
): Card {
  const comps = components(p, offer, chips, ctx);
  const list = (Object.keys(weights) as ComponentName[]).map((name) => ({
    name,
    weight: weights[name],
    value: comps[name],
  }));
  const prices = eligible.map((o) => o.price);
  return {
    id: p.id,
    title: p.title,
    image_url: p.image_url,
    label: p.label,
    reasons: p.reasons,
    weight_unknown: p.attrs.weight_g === null,
    offer: {
      ...offer,
      stale: isStale(offer, ctx.finishedAt, ctx.archive),
      premium_pct: premiumOf(p, offer),
    },
    offer_count: eligible.length,
    price_range: [Math.min(...prices), Math.max(...prices)],
    score: list.reduce((s, c) => s + c.weight * c.value, 0),
    components: list,
  };
}

function explain(a: Card, b: Card): SearchResult['explanation'] {
  const reasons: { gain: number; text: string; numbers: number[] }[] = [];
  for (const c of a.components) {
    const other = b.components.find((x) => x.name === c.name)!;
    const gain = c.weight * (c.value - other.value);
    if (gain <= 0) continue;
    if (
      c.name === 'low_premium' &&
      a.offer.premium_pct !== null &&
      b.offer.premium_pct !== null
    ) {
      const [x, y] = [
        Number(a.offer.premium_pct.toFixed(1)),
        Number(b.offer.premium_pct.toFixed(1)),
      ];
      reasons.push({
        gain,
        text: `این یکی ${formatPct(x)} بالاتر از ارزش طلاست و دومی ${formatPct(y)}`,
        numbers: [x, y],
      }); // TX-66
    }
    // Other reasons wait for their content-guide text (CR-02); config.explain.extraReasons stays off until then.
  }
  const top = reasons.sort((x, y) => y.gain - x.gain).slice(0, 3);
  if (top.length === 0) return null;
  return {
    text: `چرا اولی؟ ${top.map((r) => r.text).join('، ')}`,
    numbers: top.flatMap((r) => r.numbers).slice(0, 3),
    template: true,
  }; // TX-65
}

// BR-59 and CR-12: an explicit sort puts its key before the score; a missing value (no weight, no gold price) goes last.
function sortKey(
  chips: Chip[],
  products: Map<string, ProductRecord>,
): ((c: Card) => number) | null {
  const price = first(chips, 'price_sort');
  if (price === 'asc') return (c) => c.offer.price;
  if (price === 'desc') return (c) => -c.offer.price;
  if (first(chips, 'premium_sort') === 'asc') {
    return (c) => c.offer.premium_pct ?? Infinity;
  }
  if (first(chips, 'ojrat_sort') === 'asc') {
    return (c) => ojratOf(products.get(c.id)!, c.offer) ?? Infinity;
  }
  return null;
}

function rank(
  cards: Card[],
  chips: Chip[],
  products: Map<string, ProductRecord>,
): Card[] {
  const key = sortKey(chips, products);
  return cards.sort(
    (x, y) =>
      (key ? key(x) - key(y) : 0) ||
      y.score - x.score ||
      x.offer.price - y.offer.price ||
      x.id.localeCompare(y.id),
  ); // BR-65
}

function search(products: ProductRecord[], chips: Chip[], ctx: Ctx): SearchResult {
  const intent =
    (first(chips, 'intent') as SearchResult['intent'] | undefined) ?? 'unknown';
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
  const candidates = routed.filter((r) => r.route === 'result').map((r) => r.p);
  const full = { ...ctx, candidates };
  const weights = weightsFor(intent, chips);
  for (const r of routed) {
    if (r.route === 'excluded') {
      out.excluded_count++;
      continue;
    }
    if (!r.offer || !r.eligible) continue;
    const c = card(r.p, r.offer, r.eligible, chips, full, weights);
    if (r.route === 'result') out.results.push(c);
    else if (r.route === 'review') out.review.push(c);
    else if (r.route === 'weight_bucket') out.weight_unknown_bucket.push(c);
    else if (r.route === 'ojrat_bucket') out.ojrat_unknown.push(c);
    else if (r.route === 'sponsored') out.sponsored.push(c);
  }
  for (const list of [
    out.results,
    out.review,
    out.weight_unknown_bucket,
    out.ojrat_unknown,
    out.sponsored,
  ]) {
    rank(list, chips, byId);
  }
  // CR-12: with an explicit sort the first place comes from the sort, so a score explanation would mislead.
  if (out.results.length >= 2 && !sortKey(chips, byId)) {
    out.explanation = explain(out.results[0]!, out.results[1]!);
  }

  if (out.results.length === 0) {
    // BR-67
    const filterChips = chips
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.role === 'filter' || c.role === 'filter_and_sort')
      .filter(({ c }) => c.kind !== 'intent');
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
            ).route === 'result',
        ).length,
        removed: products.filter((p) => route(p, [c], ctx, intent).route === 'filtered')
          .length,
      }))
      .sort((x, y) => y.back - x.back || y.removed - x.removed || x.i - y.i);
    const top = scored[0];
    out.relax = top
      ? { chip_index: top.i, kind: top.c.kind, results_if_removed: top.back }
      : null;
  }
  return out;
}

// BR-39: the not-gold products a search set aside, for «{n} مورد غیرطلا کنار گذاشته شد».
function excludedFor(
  products: ProductRecord[],
  chips: Chip[],
  ctx: Ctx,
): ProductRecord[] {
  const intent =
    (first(chips, 'intent') as SearchResult['intent'] | undefined) ?? 'unknown';
  return products.filter((p) => route(p, chips, ctx, intent).route === 'excluded');
}

export { components, search, excludedFor, type ProductRecord, type Card };
