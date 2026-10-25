import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Chip } from '../../../src/shared/chips.ts';
import type { OfferRow } from '../../../src/domains/catalog/offers.ts';
import { parseQuery } from '../../../src/domains/query/parse.ts';
import {
  components,
  excludedFor,
  search,
  type ProductRecord,
} from '../../../src/domains/ranking/rank.ts';

const FINISHED = '2026-10-23T07:00:00.000Z';
const G = 27_000_000;
const ctx = { finishedAt: FINISHED, archive: false, gLive: G };
const hoursBefore = (h: number) =>
  new Date(Date.parse(FINISHED) - h * 3_600_000).toISOString();

let n = 0;
function product(
  p: Omit<Partial<ProductRecord>, 'offers' | 'attrs'> & {
    attrs?: Partial<ProductRecord['attrs']>;
    price?: number;
    weight?: number | null;
    offers?: Partial<OfferRow>[];
  },
): ProductRecord {
  const id = p.id ?? `p${++n}`;
  const weight = p.weight === undefined ? 1 : p.weight;
  const given: Partial<OfferRow>[] = p.offers ?? [{ price: p.price ?? 30_000_000 }];
  const offers = given.map((o, i): OfferRow => ({
    id: `${id}:${i}`,
    product_id: id,
    source: 'torob_details',
    shop: `shop-${id}-${i}`,
    city: 'تهران',
    channel: 'online',
    title: '',
    price: 30_000_000,
    url: 'u',
    torob_pay: false,
    price_unreliable: false,
    shop_stars: null,
    shop_months: null,
    fetched_at: hoursBefore(1),
    ...o,
  }));
  return {
    id,
    title: p.title ?? 'انگشتر طلا',
    image_url: null,
    label: p.label ?? 'real',
    reasons: [],
    sponsored: p.sponsored ?? false,
    attrs: {
      weight_g: weight,
      karat: 18,
      item_type: 'انگشتر',
      audience: null,
      condition: null,
      gallery: null,
      style_tags: [],
      non_gold: false,
      declared_ojrat_pct: null,
      ...p.attrs,
    },
    offers: offers.map((o) => ({ ...o, g_at_fetch: G })),
  };
}
const chips = (text: string): Chip[] => parseQuery(text).chips;
const ids = (r: { results: { id: string }[] }) => r.results.map((x) => x.id);

test('AC-RK-01 (BR-60, BR-84): with a 20M budget nothing pricier is in the main list', () => {
  const r = search(
    [
      product({ id: 'cheap', price: 19_000_000 }),
      product({ id: 'dear', price: 21_000_000 }),
    ],
    chips('انگشتر طلا تا ۲۰ میلیون'),
    ctx,
  );
  assert.deepEqual(ids(r), ['cheap']);
});

test('AC-RK-02 (BR-61, BR-63): savings keeps mixed, review and weightless products out of the main list', () => {
  const r = search(
    [
      product({ id: 'ok' }),
      product({ id: 'mixed', label: 'mixed' }),
      product({ id: 'rev', label: 'review' }),
      product({ id: 'noweight', weight: null }),
    ],
    chips('انگشتر طلا برای پس انداز'),
    ctx,
  );
  assert.deepEqual(ids(r), ['ok']);
  assert.deepEqual(
    r.review.map((x) => x.id),
    ['rev'],
  );
});

test('BR-61: mixed products appear only for gifts; not-gold products are only counted', () => {
  const list = [
    product({ id: 'ok' }),
    product({ id: 'mixed', label: 'mixed' }),
    product({ id: 'fake', label: 'not_gold' }),
  ];
  assert.deepEqual(ids(search(list, chips('انگشتر طلا کادو تولد'), ctx)).sort(), [
    'mixed',
    'ok',
  ]);
  const beauty = search(list, chips('انگشتر طلا طرح کارتیه'), ctx);
  assert.deepEqual(ids(beauty), ['ok']);
  assert.equal(beauty.excluded_count, 1);
});

test('AC-RK-07 (BR-62): budget 0.33 for 16.5M against a 15M target; freshness 0.5 at 96 h; premium 35% scores 0.65', () => {
  const p = product({
    price: 16_500_000,
    weight: 0.45,
    offers: [{ price: 16_500_000, fetched_at: hoursBefore(96) }],
  });
  const c = components(p, p.offers[0]!, chips('انگشتر طلا حدود ۱۵ میلیون'), {
    ...ctx,
    candidates: [p],
  });
  assert.equal(Number(c.budget_fit.toFixed(2)), 0.33);
  assert.equal(c.freshness, 0.5);
  const q = product({ price: 36_450_000, weight: 1 });
  assert.equal(
    Number(
      components(q, q.offers[0]!, [], { ...ctx, candidates: [q] }).low_premium.toFixed(2),
    ),
    0.65,
  );
});

test('AC-RK-03 (BR-62, BR-66): the score is the intent weights times the components, and both are returned', () => {
  const r = search([product({ id: 'a' })], chips('انگشتر طلا برای پس انداز'), ctx);
  const card = r.results[0]!;
  const sum = card.components.reduce((s, c) => s + c.weight * c.value, 0);
  assert.equal(Number(card.score.toFixed(6)), Number(sum.toFixed(6)));
  assert.equal(Number(card.components.reduce((s, c) => s + c.weight, 0).toFixed(6)), 1);
});

test('AC-RK-04 (BR-64): a sponsored product is listed only under «آگهی»', () => {
  const r = search(
    [product({ id: 'ad', sponsored: true }), product({ id: 'org' })],
    chips('انگشتر طلا'),
    ctx,
  );
  assert.deepEqual(ids(r), ['org']);
  assert.deepEqual(
    r.sponsored.map((x) => x.id),
    ['ad'],
  );
});

test('AC-RK-05 (BR-65): equal scores ⇒ cheaper first; equal price ⇒ lower id', () => {
  const r = search(
    [
      product({ id: 'b', price: 30_000_000 }),
      product({ id: 'a', price: 30_000_000 }),
      product({ id: 'c', price: 29_000_000 }),
    ],
    [],
    ctx,
  );
  assert.deepEqual(ids(r).slice(0, 3), ['c', 'a', 'b']);
});

test('AC-RK-06 (BR-67): zero results name the filter whose removal brings the most back', () => {
  const list = [
    product({ id: 'x', price: 60_000_000, weight: 20 }),
    product({ id: 'y', price: 4_000_000, weight: 20 }),
  ];
  const r = search(list, chips('النگو ۲۰ گرمی زیر ۵ میلیون'), ctx);
  assert.equal(r.results.length, 0);
  assert.equal(r.relax?.kind, 'item_type');
  assert.equal(r.relax?.results_if_removed, 1);
  const bangles = [
    product({ id: 'b1', price: 60_000_000, weight: 20, attrs: { item_type: 'النگو' } }),
    product({ id: 'b2', price: 70_000_000, weight: 20, attrs: { item_type: 'النگو' } }),
  ];
  const r2 = search(bangles, chips('النگو ۲۰ گرمی زیر ۵ میلیون'), ctx);
  assert.equal(r2.relax?.kind, 'budget_max');
  assert.equal(r2.relax?.results_if_removed, 2);
});

test('BR-54: a weight target is a ±10% band; weightless products go to their own section', () => {
  const list = [
    product({ id: 'in', weight: 2.2, price: 70_000_000 }),
    product({ id: 'out', weight: 2.3, price: 70_000_000 }),
    product({ id: 'none', weight: null }),
  ];
  const r = search(list, chips('انگشتر ۲ گرمی'), ctx);
  assert.deepEqual(ids(r), ['in']);
  assert.deepEqual(
    r.weight_unknown_bucket.map((x) => x.id),
    ['none'],
  );
});

test('BR-59: ojrat filters drop dearer products, park the uncheckable ones, and «کمترین اجرت» sorts by ojrat', () => {
  const list = [
    product({ id: 'low', price: 30_500_000 }),
    product({ id: 'high', price: 40_000_000 }),
    product({ id: 'mid', price: 32_000_000 }),
    product({ id: 'stones', price: 31_000_000, attrs: { non_gold: true } }),
  ];
  const r = search(list, chips('انگشتر کم اجرت'), ctx);
  assert.deepEqual(ids(r).sort(), ['low', 'mid']);
  assert.deepEqual(
    r.ojrat_unknown.map((x) => x.id),
    ['stones'],
  );
  assert.deepEqual(ids(search(list, chips('انگشتر با کمترین اجرت'), ctx)), [
    'low',
    'mid',
  ]);
});

test("BR-84: a city filter picks that city's offer; a product with none drops out", () => {
  const list = [
    product({
      id: 'both',
      offers: [
        { price: 30_000_000, city: 'تهران' },
        { price: 31_000_000, city: 'اصفهان' },
      ],
    }),
    product({ id: 'tehran', offers: [{ price: 29_000_000, city: 'تهران' }] }),
  ];
  const r = search(list, chips('انگشتر طلا در اصفهان'), ctx);
  assert.deepEqual(ids(r), ['both']);
  assert.equal(r.results[0]!.offer.price, 31_000_000);
});

test('BR-70, BR-73: the top result is explained against the second with numbers from both', () => {
  const r = search(
    [product({ id: 'a', price: 31_000_000 }), product({ id: 'b', price: 36_450_000 })],
    chips('انگشتر طلا برای پس انداز'),
    ctx,
  );
  assert.equal(r.results[0]!.id, 'a');
  assert.ok(r.explanation);
  assert.match(r.explanation!.text, /بالاتر از ارزش طلاست/);
  assert.ok(r.explanation!.numbers.length > 0 && r.explanation!.numbers.length <= 3);
  assert.equal(search([product({ id: 'solo' })], [], ctx).explanation, null);
});

test('BR-39: the set-aside list holds the not-gold products that pass the same filters', () => {
  const list = [
    product({ id: 'ok' }),
    product({ id: 'fake', label: 'not_gold' }),
    product({ id: 'fake-bangle', label: 'not_gold', attrs: { item_type: 'النگو' } }),
  ];
  assert.deepEqual(
    excludedFor(list, chips('انگشتر طلا'), ctx).map((p) => p.id),
    ['fake'],
  );
});

test('CR-08 (BR-62): a gift near the budget the buyer gave ranks above one far below it', () => {
  const cheap = product({
    id: 'cheap',
    title: 'دستبند طلا',
    price: 1_000_000,
    weight: 0.5,
    attrs: { item_type: 'دستبند' },
  });
  const near = product({
    id: 'near',
    title: 'دستبند طلا',
    price: 18_000_000,
    weight: 0.5,
    attrs: { item_type: 'دستبند' },
  });
  assert.deepEqual(
    ids(search([cheap, near], chips('یه دستبند برای روز مادر تا ۲۰ تومن'), ctx)),
    ['near', 'cheap'],
  );
});

test('CR-08 (BR-62): «ظریف» gives full weight fit to any piece up to the median weight, so the least gold does not win', () => {
  const items = [0.02, 1, 1.5, 4, 8].map((w, i) =>
    product({
      id: `w${i}`,
      title: 'دستبند طلا',
      weight: w,
      attrs: { item_type: 'دستبند' },
    }),
  );
  const c = chips('یه دستبند ظریف');
  const fit = (p: ProductRecord) =>
    components(p, p.offers[0]!, c, { ...ctx, candidates: items }).weight_fit;
  assert.deepEqual(items.slice(0, 3).map(fit), [1, 1, 1]);
  assert.ok(fit(items[3]!) < 1 && fit(items[3]!) > 0);
  assert.equal(fit(items[4]!), 0);
});

test("CR-09 (BR-62): seller trust comes from Torob's stars and time on Torob; a shop with neither scores 0.5", () => {
  const trust = (o: Partial<OfferRow>) => {
    const p = product({ offers: [o] });
    return Number(
      components(p, p.offers[0]!, [], { ...ctx, candidates: [p] }).seller_trust.toFixed(
        2,
      ),
    );
  };
  assert.equal(trust({ shop_stars: 4.9, shop_months: 96 }), 0.95);
  assert.equal(trust({ shop_stars: 4.3, shop_months: 84 }), 0.65);
  assert.equal(trust({ shop_stars: 5, shop_months: 2 }), 0.54);
  assert.equal(
    trust({ shop_stars: null, shop_months: 36 }),
    0.75,
    'a marketplace has no stars of its own',
  );
  assert.equal(trust({ shop_stars: null, shop_months: 0 }), 0.25, '«فروشگاه جدید»');
  assert.equal(trust({ shop_stars: null, shop_months: null }), 0.5);
  const known = product({ id: 'known', offers: [{ shop_stars: 4.9, shop_months: 96 }] });
  const fresh = product({ id: 'fresh', offers: [{ shop_stars: null, shop_months: 0 }] });
  assert.deepEqual(ids(search([fresh, known], chips('انگشتر طلا'), ctx)), [
    'known',
    'fresh',
  ]);
});

test('CR-09 (BR-62): with no budget, a price up to the median of the matches fits fully, falling to 0 at ten times the median', () => {
  const items = [10, 20, 30, 90, 3000].map((m, i) =>
    product({ id: `m${i}`, price: m * 1_000_000 }),
  );
  const fit = (p: ProductRecord) =>
    components(p, p.offers[0]!, chips('انگشتر طلا'), { ...ctx, candidates: items })
      .budget_fit;
  assert.deepEqual(items.slice(0, 3).map(fit), [1, 1, 1]);
  assert.equal(Number(fit(items[3]!).toFixed(2)), 0.52);
  assert.equal(fit(items[4]!), 0);
  assert.equal(
    ids(search(items, chips('انگشتر طلا'), ctx)).at(-1),
    'm4',
    'the piece at a hundred times the median comes last',
  );
});

test('CR-09 (BR-62): a style or weight the sentence did not ask for carries no weight, and the weights still sum to 1', () => {
  const weightOf = (text: string, name: string) =>
    search([product({})], chips(text), ctx).results[0]!.components.find(
      (c) => c.name === name,
    )!.weight;
  assert.equal(weightOf('انگشتر طلا برای خودم', 'type_style_fit'), 0);
  assert.equal(weightOf('انگشتر طلا برای خودم', 'weight_fit'), 0);
  assert.ok(weightOf('انگشتر طلا طرح کارتیه', 'type_style_fit') > 0.45);
  assert.ok(weightOf('یه انگشتر ظریف برای خودم', 'weight_fit') > 0);
  const card = search([product({})], chips('انگشتر طلا برای خودم'), ctx).results[0]!;
  assert.equal(Number(card.components.reduce((s, c) => s + c.weight, 0).toFixed(6)), 1);
});

const sortChip = (
  kind: 'price_sort' | 'premium_sort' | 'ojrat_sort',
  value: string,
): Chip => ({
  kind,
  value,
  role: 'sort',
  level: 'product',
  origin: 'user',
});

test('CR-12: the sort control orders by price either way, or by the smallest premium over gold; ties keep the score order', () => {
  const items = [
    product({ id: 'mid', price: 30_000_000, weight: 1 }),
    product({ id: 'cheap', price: 28_000_000, weight: 1 }),
    product({ id: 'dear', price: 40_000_000, weight: 1 }),
    product({ id: 'noweight', price: 20_000_000, weight: null }),
  ];
  const base = chips('انگشتر طلا');
  assert.deepEqual(ids(search(items, [...base, sortChip('price_sort', 'asc')], ctx)), [
    'noweight',
    'cheap',
    'mid',
    'dear',
  ]);
  assert.deepEqual(ids(search(items, [...base, sortChip('price_sort', 'desc')], ctx)), [
    'dear',
    'mid',
    'cheap',
    'noweight',
  ]);
  // 28M for 1 g at G 27M is 3.7% over gold, the closest; a weightless piece has no premium and goes last
  assert.deepEqual(ids(search(items, [...base, sortChip('premium_sort', 'asc')], ctx)), [
    'cheap',
    'mid',
    'dear',
    'noweight',
  ]);
});

test('CR-12: with an explicit sort the «چرا اولی؟» line is not built, because the first place comes from the sort, not the score', () => {
  const items = [
    product({ id: 'a', price: 30_000_000 }),
    product({ id: 'b', price: 36_000_000 }),
  ];
  const base = chips('انگشتر طلا برای پس انداز');
  assert.ok(search(items, base, ctx).explanation);
  assert.equal(
    search(items, [...base, sortChip('price_sort', 'desc')], ctx).explanation,
    null,
  );
});
