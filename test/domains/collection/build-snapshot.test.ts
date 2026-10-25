import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import {
  buildSnapshot,
  shopRating,
} from '../../../src/domains/collection/build-snapshot.ts';

const RUN = '2026-10-23T06:56:00.000Z';

function rawFixture(): string {
  const raw = mkdtempSync(join(tmpdir(), 'raw-'));
  mkdirSync(join(raw, '2026-10-23'));
  mkdirSync(join(raw, 'details'));
  const line = (o: object) => JSON.stringify(o) + '\n';
  writeFileSync(
    join(raw, '2026-10-23', 'torob-search.jsonl'),
    line({
      run_id: RUN,
      q: 'النگو طلا',
      page: 0,
      fetched_at: '2026-10-23T06:57:00.000Z',
      results: [
        {
          random_key: 'ring',
          name1: 'النگو طلا ۱۸ عیار آیینه ای',
          name2: '',
          price: 49_179_516,
          shop_text: 'در فرنیا گلد',
          web_client_absolute_url: '/p/ring/x/',
          image_url: 'https://img/ring.jpg',
          is_adv: false,
        },
        {
          random_key: 'fake',
          name1: 'النگو ژوپینگ طرح طلا',
          name2: '',
          price: 900_000,
          shop_text: 'در ۲ فروشگاه',
          web_client_absolute_url: '/p/fake/x/',
          image_url: null,
          is_adv: false,
        },
      ],
    }),
  );
  writeFileSync(
    join(raw, '2026-10-23', 'gold-price.jsonl'),
    line({
      run_id: RUN,
      source: 'https://call1.tgju.org/ajax.json',
      unit: 'rial',
      fetched_at: '2026-10-23T06:56:01.000Z',
      prices: { geram18: { p: '270,170,000', ts: '2026-10-23 10:20:00' } },
    }),
  );
  writeFileSync(
    join(raw, '2026-10-23', 'runs.jsonl'),
    line({
      run_id: RUN,
      step: 'summary',
      started_at: RUN,
      finished_at: '2026-10-23T07:02:00.000Z',
      requests: 21,
      results: 2,
      stopped: null,
    }),
  );
  writeFileSync(
    join(raw, 'details', 'ring.json'),
    JSON.stringify({
      fetched_at: '2026-10-23T07:00:00.000Z',
      body: {
        name1: 'النگو طلا ۱۸ عیار آیینه ای',
        structural_specs: { headers: [{ specs: { وزن: '1.7 گرم', عیار: '18' } }] },
        key_specs: [],
        products_info: {
          result: [
            {
              shop_name: 'فرنیا گلد',
              shop_name2: 'تهران',
              name1: 'النگو طلا',
              price: 49_000_000,
              availability: true,
              page_url: 'https://api.torob.com/v4/product-page/redirect/a',
              show_torobpay_badge: false,
              is_price_unreliable: false,
              shop_score_percentile: 0,
              score_info: { score: 4.9, score_text: '★۴.۹ (۸ سال در ترب)' },
            },
            {
              shop_name: 'زرین',
              shop_name2: 'اصفهان',
              name1: 'النگو طلا ۱۸',
              price: 52_000_000,
              availability: true,
              page_url: 'https://api.torob.com/v4/product-page/redirect/b',
              show_torobpay_badge: true,
              is_price_unreliable: false,
              shop_score_percentile: 0,
              score_info: { score: 5, score_text: 'فروشگاه جدید' },
            },
            {
              shop_name: 'بسته',
              shop_name2: 'تهران',
              name1: 'النگو',
              price: 0,
              availability: false,
              page_url: 'x',
            },
          ],
        },
        products_in_store_info: {
          result: [
            {
              shop_name: 'طلای حضوری',
              shop_name2: 'تهران',
              name1: 'النگو طلا',
              price: 53_000_000,
              availability: null,
              page_url: 'https://api.torob.com/v4/product-page/redirect/c',
              score_info: { score: 5, score_text: 'خرید حضوری' },
            },
          ],
        },
      },
    }),
  );
  return raw;
}

test('buildSnapshot: products, merged offers, labels, breakdowns and meta from raw files', () => {
  const raw = rawFixture();
  const out = join(mkdtempSync(join(tmpdir(), 'snap-')), 'snapshot.sqlite');
  buildSnapshot({ rawDir: raw, outPath: out });
  const db = new DatabaseSync(out, { readOnly: true });

  const meta = db
    .prepare('SELECT schema_version, run_id, finished_at, requests FROM meta')
    .get() as any;
  assert.deepEqual(
    { ...meta },
    {
      schema_version: 3,
      run_id: RUN,
      finished_at: '2026-10-23T07:02:00.000Z',
      requests: 21,
    },
  );

  assert.equal((db.prepare('SELECT count(*) AS n FROM product').get() as any).n, 2);

  // DM-08: the named card merged into the details offer of the same shop; the out-of-stock offer is not written.
  const offers = db
    .prepare(
      "SELECT shop, channel, price_toman AS price, source, fetched_at FROM offer WHERE product_id = 'ring' ORDER BY price_toman",
    )
    .all()
    .map((r) => ({ ...r }));
  assert.deepEqual(
    offers.map((o: any) => [o.shop, o.channel, o.price]),
    [
      ['فرنیا گلد', 'online', 49_000_000],
      ['زرین', 'online', 52_000_000],
      ['طلای حضوری', 'in_person', 53_000_000],
    ],
  );

  // CR-09: Torob's stars and time on Torob; its shop_score_percentile is 0 for every offer, so it is not read.
  const ratings = db
    .prepare(
      "SELECT shop, shop_stars, shop_months FROM offer WHERE product_id = 'ring' ORDER BY price_toman",
    )
    .all()
    .map((r: any) => [r.shop, r.shop_stars, r.shop_months]);
  assert.deepEqual(ratings, [
    ['فرنیا گلد', 4.9, 96],
    ['زرین', null, 0],
    ['طلای حضوری', null, null],
  ]);

  const labels = Object.fromEntries(
    db
      .prepare('SELECT product_id, label FROM label')
      .all()
      .map((r: any) => [r.product_id, r.label]),
  );
  assert.deepEqual(labels, { ring: 'real', fake: 'not_gold' });

  // DM-01: G at fetch is the quote within 60 min; 1.7 g × 27,017,000 = 45,928,900.
  const b = db
    .prepare(
      "SELECT b.gold_value, b.partial_reason FROM breakdown b JOIN offer o ON o.id = b.offer_id WHERE o.shop = 'فرنیا گلد'",
    )
    .get() as any;
  assert.equal(b.gold_value, 45_928_900);

  const weight = db
    .prepare(
      "SELECT value, provenance FROM attribute WHERE product_id = 'ring' AND name = 'weight_g'",
    )
    .get() as any;
  assert.deepEqual({ ...weight }, { value: '1.7', provenance: 'spec' });
  db.close();
});

test('buildSnapshot: an offer with no gold quote within 60 minutes gets no breakdown (DM-01)', () => {
  const raw = rawFixture();
  writeFileSync(
    join(raw, '2026-10-23', 'gold-price.jsonl'),
    JSON.stringify({
      run_id: RUN,
      source: 'https://call1.tgju.org/ajax.json',
      unit: 'rial',
      fetched_at: '2026-10-23T01:00:00.000Z',
      prices: { geram18: { p: '270,170,000', ts: '2026-10-23 04:20:00' } },
    }) + '\n',
  );
  const out = join(mkdtempSync(join(tmpdir(), 'snap-')), 'snapshot.sqlite');
  buildSnapshot({ rawDir: raw, outPath: out });
  const db = new DatabaseSync(out, { readOnly: true });
  assert.equal((db.prepare('SELECT count(*) AS n FROM breakdown').get() as any).n, 0);
  assert.equal(
    (
      db
        .prepare('SELECT count(*) AS n FROM offer WHERE gold_quote_id IS NULL')
        .get() as any
    ).n,
    4,
  );
  // CR-09: the label check still has a gold price, from the quote 6 hours earlier: 49,000,000 ÷ (1.7 × 27,017,000).
  const ring = db
    .prepare("SELECT label, price_ratio FROM label WHERE product_id = 'ring'")
    .get() as any;
  assert.equal(ring.label, 'real');
  assert.equal(Number(ring.price_ratio.toFixed(3)), 1.067);
  db.close();
});

test('buildSnapshot: with no gold quote within 72 hours, a product with a known weight goes to review (CR-09)', () => {
  const raw = rawFixture();
  writeFileSync(
    join(raw, '2026-10-23', 'gold-price.jsonl'),
    JSON.stringify({
      run_id: RUN,
      source: 'https://call1.tgju.org/ajax.json',
      unit: 'rial',
      fetched_at: '2026-10-19T07:00:00.000Z',
      prices: { geram18: { p: '270,170,000', ts: '2026-10-19 10:20:00' } },
    }) + '\n',
  );
  const out = join(mkdtempSync(join(tmpdir(), 'snap-')), 'snapshot.sqlite');
  buildSnapshot({ rawDir: raw, outPath: out });
  const db = new DatabaseSync(out, { readOnly: true });
  const ring = db
    .prepare("SELECT label, reasons FROM label WHERE product_id = 'ring'")
    .get() as any;
  assert.equal(ring.label, 'review');
  assert.deepEqual(JSON.parse(ring.reasons), [
    'قیمت طلای آن زمان برای سنجیدن قیمت در دست نبود',
  ]);
  db.close();
});

test('shopRating: stars only when Torob shows a star, and months on Torob from the score text (CR-09)', () => {
  assert.deepEqual(shopRating({ score: 4.3, score_text: '★۴.۳ (۷ سال در ترب)' }), {
    stars: 4.3,
    months: 84,
  });
  assert.deepEqual(shopRating({ score: 5, score_text: '★۵ (۹ ماه در ترب)' }), {
    stars: 5,
    months: 9,
  });
  assert.deepEqual(shopRating({ score: 5, score_text: 'بازارگاه (۳ سال در ترب)' }), {
    stars: null,
    months: 36,
  });
  assert.deepEqual(shopRating({ score: 5, score_text: 'فروشگاه جدید' }), {
    stars: null,
    months: 0,
  });
  assert.deepEqual(shopRating({ score: 5, score_text: 'خرید حضوری' }), {
    stars: null,
    months: null,
  });
  assert.deepEqual(shopRating(undefined), { stars: null, months: null });
});

test('buildSnapshot: placeholder prices like 999,999,999,999,999 are not offers, and the snapshot still loads', async () => {
  const raw = rawFixture();
  const search = join(raw, '2026-10-23', 'torob-search.jsonl');
  const page = JSON.parse(readFileSync(search, 'utf8'));
  page.results.push({
    random_key: 'junk',
    name1: 'گردنبند طلا ۱۸ عیار',
    name2: '',
    price: 999_999_999_999_999,
    shop_text: 'در لؤلؤ گالری',
    web_client_absolute_url: '/p/junk/x/',
    image_url: null,
    is_adv: false,
  });
  writeFileSync(search, JSON.stringify(page) + '\n');
  const ring = join(raw, 'details', 'ring.json');
  const details = JSON.parse(readFileSync(ring, 'utf8'));
  details.body.products_info.result.push({
    shop_name: 'لؤلؤ گالری',
    shop_name2: 'تهران',
    name1: 'النگو',
    price: 9_327_000_093_570_000,
    availability: true,
    page_url: 'y',
  });
  writeFileSync(ring, JSON.stringify(details));
  const out = join(mkdtempSync(join(tmpdir(), 'snap-')), 'snapshot.sqlite');
  buildSnapshot({ rawDir: raw, outPath: out });
  const { loadSnapshot } = await import('../../../src/domains/catalog/snapshot.ts');
  const snap = loadSnapshot(out);
  assert.deepEqual(snap.products.map((p) => p.id).sort(), ['fake', 'ring']);
  assert.ok(
    snap.products.flatMap((p) => p.offers).every((o) => o.price < 100_000_000_000),
  );
});

// A second run a day later: the bangle is cheaper, a new ring appears, and the bangle's details page is fetched again.
const RUN2 = '2026-10-24T06:45:00.000Z';
function secondRun(): string {
  const raw = mkdtempSync(join(tmpdir(), 'raw2-'));
  mkdirSync(join(raw, '2026-10-24'));
  mkdirSync(join(raw, 'details'));
  const line = (o: object) => JSON.stringify(o) + '\n';
  writeFileSync(
    join(raw, '2026-10-24', 'torob-search.jsonl'),
    line({
      run_id: RUN2,
      q: 'النگو طلا',
      page: 0,
      fetched_at: '2026-10-24T06:46:00.000Z',
      results: [
        {
          random_key: 'ring',
          name1: 'النگو طلا ۱۸ عیار آیینه ای',
          name2: '',
          price: 48_500_000,
          shop_text: 'در فرنیا گلد',
          web_client_absolute_url: '/p/ring/x/',
          image_url: 'https://img/ring.jpg',
          is_adv: false,
        },
        {
          random_key: 'band',
          name1: 'انگشتر طلا ۱۸ عیار ۲ گرم',
          name2: '',
          price: 60_000_000,
          shop_text: 'در گالری طلا',
          web_client_absolute_url: '/p/band/x/',
          image_url: null,
          is_adv: false,
        },
      ],
    }),
  );
  writeFileSync(
    join(raw, '2026-10-24', 'gold-price.jsonl'),
    line({
      run_id: RUN2,
      source: 'https://call1.tgju.org/ajax.json',
      unit: 'rial',
      fetched_at: '2026-10-24T06:45:30.000Z',
      prices: { geram18: { p: '268,000,000', ts: '2026-10-24 10:10:00' } },
    }),
  );
  writeFileSync(
    join(raw, '2026-10-24', 'runs.jsonl'),
    line({
      run_id: RUN2,
      step: 'summary',
      started_at: RUN2,
      finished_at: '2026-10-24T07:20:00.000Z',
      requests: 9,
      results: 2,
      details_fetched: 1,
      stopped: null,
    }),
  );
  const first = JSON.parse(
    readFileSync(join(rawFixture(), 'details', 'ring.json'), 'utf8'),
  );
  first.fetched_at = '2026-10-24T07:00:00.000Z';
  first.body.products_info.result[0].price = 48_400_000;
  writeFileSync(join(raw, 'details', 'ring.json'), JSON.stringify(first));
  return raw;
}

const dump = (path: string) => {
  const db = new DatabaseSync(path, { readOnly: true });
  const out: Record<string, unknown> = {};
  for (const t of [
    'meta',
    'gold_quote',
    'product',
    'offer',
    'attribute',
    'label',
    'breakdown',
    'history',
    'source_card',
    'source_details',
  ]) {
    const cols = (db.prepare(`pragma table_info(${t})`).all() as any[])
      .map((c) => c.name)
      .join(',');
    out[t] = db.prepare(`SELECT ${cols} FROM ${t} ORDER BY ${cols}`).all();
  }
  db.close();
  return out;
};

test('ADR-0013: a snapshot merged with a new run equals one built from all the raw files at once', () => {
  const dir = mkdtempSync(join(tmpdir(), 'merge-'));
  const first = rawFixture();
  const second = secondRun();
  buildSnapshot({ rawDir: first, outPath: join(dir, 'base.sqlite') });
  buildSnapshot({
    rawDir: second,
    outPath: join(dir, 'merged.sqlite'),
    base: join(dir, 'base.sqlite'),
  });
  const all = mkdtempSync(join(tmpdir(), 'all-'));
  cpSync(first, all, { recursive: true });
  cpSync(second, all, { recursive: true });
  buildSnapshot({ rawDir: all, outPath: join(dir, 'all.sqlite') });
  assert.deepEqual(dump(join(dir, 'merged.sqlite')), dump(join(dir, 'all.sqlite')));

  const db = new DatabaseSync(join(dir, 'merged.sqlite'), { readOnly: true });
  assert.equal((db.prepare('SELECT run_id FROM meta').get() as any).run_id, RUN2);
  assert.deepEqual(
    (db.prepare('SELECT id FROM product ORDER BY id').all() as any[]).map((r) => r.id),
    ['band', 'fake', 'ring'],
  ); // «fake» was not seen again and is kept
  const ring = db
    .prepare("SELECT fetched_at FROM source_details WHERE product_id = 'ring'")
    .get() as any;
  assert.equal(ring.fetched_at, '2026-10-24T07:00:00.000Z'); // the newer details page wins
  db.close();
});

test('ADR-0013: a merge refuses a base snapshot that does not carry its inputs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'old-'));
  buildSnapshot({ rawDir: rawFixture(), outPath: join(dir, 'base.sqlite') });
  const db = new DatabaseSync(join(dir, 'base.sqlite'));
  db.exec('UPDATE meta SET schema_version = 2');
  db.close();
  assert.throws(
    () =>
      buildSnapshot({
        rawDir: secondRun(),
        outPath: join(dir, 'x.sqlite'),
        base: join(dir, 'base.sqlite'),
      }),
    /schema v2/,
  );
});
