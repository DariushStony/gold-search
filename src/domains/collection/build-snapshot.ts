// K-02: all raw files so far → one immutable SQLite snapshot (data model §2). The snapshot also keeps the inputs
// it was built from, so a later build can start from it plus new raw files (ADR-0013).
// Run: node src/domains/collection/build-snapshot.ts [rawDir] [outPath] [baseSnapshot]
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../../core/config.ts';
import { normalize } from '../../shared/text.ts';
import { extract, specsFromDetails, type Attributes } from '../catalog/extract.ts';
import { labelProduct } from '../catalog/label.ts';
import { eligibleOffers, mergeCard, type OfferRow } from '../catalog/offers.ts';
import {
  parseTgju,
  parseUnion,
  selectReference,
  type Quote,
} from '../pricing/gold-price.ts';
import { priceBreakdown, vatRateFor } from '../pricing/price.ts';

const SCHEMA_VERSION = 3;
const PIPELINE_VERSION = '0.3.0';
const QUOTE_WINDOW_MS = 60 * 60_000; // DM-01
// CR-09: the label check may use an older quote. Its bands (0.9 and 2.5 times the gold value) are far wider than gold's
// moves over a few days: G at fetch and G today were 2.7% to 3.5% apart in the 2026-10-25 snapshot (CR-07).
const LABEL_QUOTE_WINDOW_MS = 72 * 3_600_000;

const SCHEMA = `
CREATE TABLE meta (schema_version INTEGER, run_id TEXT, started_at TEXT, finished_at TEXT, requests INTEGER, stopped_reason TEXT, pipeline_version TEXT, details_budget INTEGER, details_fetched INTEGER);
CREATE TABLE gold_quote (id INTEGER PRIMARY KEY, source TEXT, kind TEXT, value_toman INTEGER, quoted_at TEXT, fetched_at TEXT);
CREATE TABLE product (id TEXT PRIMARY KEY, title TEXT, subtitle TEXT, image_url TEXT, category_path TEXT, torob_url TEXT, card_shop_count INTEGER, sample INTEGER, first_seen_at TEXT, last_seen_at TEXT, details_fetched_at TEXT);
CREATE TABLE offer (id TEXT PRIMARY KEY, product_id TEXT, source TEXT, shop TEXT, city TEXT, channel TEXT, title TEXT, price_toman INTEGER, url TEXT, torob_pay INTEGER, is_adv INTEGER, price_unreliable INTEGER, shop_stars REAL, shop_months INTEGER, fetched_at TEXT NOT NULL, gold_quote_id INTEGER);
CREATE TABLE attribute (product_id TEXT, name TEXT, value TEXT, provenance TEXT, confidence REAL, evidence TEXT);
CREATE TABLE label (product_id TEXT PRIMARY KEY, label TEXT, reasons TEXT, price_ratio REAL, weight_unknown INTEGER);
CREATE TABLE breakdown (offer_id TEXT PRIMARY KEY, gold_value INTEGER, premium_pct REAL, implied_ojrat_pct REAL, declared_ojrat_pct REAL, parts TEXT, breakeven_g INTEGER, vat_overcharge INTEGER, partial_reason TEXT, vat REAL, profit REAL);
CREATE TABLE history (product_id TEXT, shop TEXT, observed_on TEXT, price_toman INTEGER, premium_pct REAL, g_toman INTEGER, PRIMARY KEY (product_id, shop, observed_on));
CREATE TABLE source_card (product_id TEXT, run_id TEXT, fetched_at TEXT, name1 TEXT, name2 TEXT, price INTEGER, shop_text TEXT, url TEXT, image_url TEXT, is_adv INTEGER);
CREATE TABLE source_details (product_id TEXT PRIMARY KEY, fetched_at TEXT, body TEXT);
CREATE INDEX offer_product ON offer(product_id);
CREATE INDEX attribute_product ON attribute(product_id, name);
CREATE INDEX history_shop ON history(shop, observed_on);
`;

type Card = {
  run_id: string;
  fetched_at: string;
  name1: string;
  name2: string;
  price: number;
  shop_text: string;
  url: string;
  image_url: string | null;
  is_adv: boolean;
};
type StoredQuote = Quote & { id: number };
type Run = {
  run_id: string;
  started_at: string;
  finished_at: string;
  requests: number;
  stopped: string | null;
  details_fetched: number;
};
type Details = { fetched_at: string; body: any };
// Everything a snapshot is built from (ADR-0013): from raw files, from an earlier snapshot, or both merged.
type Inputs = {
  quotes: Quote[];
  run: Run | null;
  cards: Map<string, Card[]>;
  details: Map<string, Details>;
};

const readJsonl = (path: string) =>
  existsSync(path)
    ? readFileSync(path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];
const dayDirs = (raw: string) =>
  readdirSync(raw)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
const MULTI_SHOP = /در\s*[۰-۹0-9]+\s*فروشگاه/;

function loadQuotes(raw: string): Quote[] {
  const quotes: Quote[] = [];
  for (const day of dayDirs(raw)) {
    for (const r of readJsonl(join(raw, day, 'gold-price.jsonl'))) {
      const q = String(r.source).includes('tgju')
        ? parseTgju(r.prices, r.fetched_at)
        : parseUnion(r.body, r.fetched_at);
      if (q) quotes.push(q);
    }
  }
  return quotes;
}

// DM-01: the reference at fetch time, from the quotes of each source nearest to it within 60 minutes.
function quoteAt(
  quotes: StoredQuote[],
  at: string,
  windowMs = QUOTE_WINDOW_MS,
): { g: number; id: number } | null {
  const t = Date.parse(at);
  const nearest = (source: Quote['source']) =>
    quotes
      .filter(
        (q) => q.source === source && Math.abs(Date.parse(q.fetched_at) - t) <= windowMs,
      )
      .sort(
        (a, b) =>
          Math.abs(Date.parse(a.fetched_at) - t) - Math.abs(Date.parse(b.fetched_at) - t),
      )[0] ?? null;
  const union = nearest('union'),
    tgju = nearest('tgju');
  const ref = selectReference(union, tgju, new Date(t));
  if (!ref) return null;
  const used = ref.source === 'union' ? union : tgju;
  return { g: ref.g_toman, id: used!.id };
}

// CR-09: Torob prints a star only for shops it has scored. Marketplaces, new shops and in-person listings carry a
// default score of 5 without one, and shop_score_percentile is 0 on every offer collected so far.
function shopRating(info: { score?: unknown; score_text?: unknown } | undefined): {
  stars: number | null;
  months: number | null;
} {
  const text = normalize(String(info?.score_text ?? ''));
  const stars =
    text.startsWith('★') && typeof info?.score === 'number' ? info.score : null;
  const m = text.match(/(\d+) (سال|ماه) در ترب/);
  const months = m
    ? Number(m[1]) * (m[2] === 'سال' ? 12 : 1)
    : text.includes('فروشگاه جدید')
      ? 0
      : null;
  return { stars, months };
}

function detailsOffers(productId: string, body: any, fetchedAt: string): OfferRow[] {
  const rows: OfferRow[] = [];
  const add = (o: any, channel: OfferRow['channel']) => {
    const rating = shopRating(o.score_info);
    rows.push({
      id: `${productId}:${channel}:${rows.length}`,
      product_id: productId,
      source: 'torob_details',
      shop: o.shop_name ?? null,
      city: o.shop_name2 ?? null,
      channel,
      title: String(o.name1 ?? ''),
      price: o.price,
      url: o.page_url ?? '',
      torob_pay: !!o.show_torobpay_badge,
      price_unreliable: !!o.is_price_unreliable,
      shop_stars: rating.stars,
      shop_months: rating.months,
      fetched_at: fetchedAt,
    });
  };
  const priced = (o: any) => o.price > 0 && o.price <= config.offers.maxPriceToman; // DM-08: priced offers only, placeholders out
  for (const o of body.products_info?.result ?? []) {
    if (o.availability && priced(o)) add(o, 'online');
  }
  for (const o of body.products_in_store_info?.result ?? []) {
    if (priced(o)) add(o, 'in_person');
  }
  return rows;
}

function cardOffer(productId: string, c: Card): OfferRow {
  const named = MULTI_SHOP.test(c.shop_text)
    ? null
    : c.shop_text.replace(/^در\s+/, '').trim() || null;
  return {
    id: `${productId}:card`,
    product_id: productId,
    source: 'torob_search',
    shop: named,
    city: null,
    channel: 'online',
    title: c.name1,
    price: c.price,
    url: c.url,
    torob_pay: false,
    price_unreliable: false,
    shop_stars: null,
    shop_months: null,
    fetched_at: c.fetched_at,
  };
}

function attributeRows(
  productId: string,
  a: Attributes,
): [string, string, string, string, number, string][] {
  const rows: [string, string, string, string, number, string][] = [];
  const put = (
    name: string,
    f: { value: unknown; provenance: string; evidence: string } | null,
  ) => {
    if (f) rows.push([productId, name, String(f.value), f.provenance, 1, f.evidence]);
  };
  put('weight_g', a.weight_g);
  if (a.weight_conflict) {
    rows.push([
      productId,
      'weight_conflict',
      'true',
      'spec',
      1,
      a.weight_g?.evidence ?? '',
    ]);
  }
  put('karat', a.karat);
  put('declared_ojrat_pct', a.declared_ojrat_pct);
  put('declared_profit_pct', a.declared_profit_pct);
  put('gallery', a.gallery);
  put('item_type', a.item_type);
  put('audience', a.audience);
  put('condition', a.condition);
  for (const s of a.style_tags) put('style_tags', s);
  put('non_gold_kind', a.non_gold);
  put('non_gold_cost_toman', a.non_gold_cost_toman);
  if (a.non_gold) {
    rows.push([
      productId,
      'has_non_gold_parts',
      'true',
      a.non_gold.provenance,
      1,
      a.non_gold.evidence,
    ]);
  }
  return rows;
}

const tehranDay = (iso: string) =>
  new Date(Date.parse(iso) + 210 * 60_000).toISOString().slice(0, 10);

// Only what the pipeline reads from a details page: the specs and the shops' offers (ADR-0013). A build from raw files
// and a build from an earlier snapshot see the same trimmed page, so they agree.
const OFFER_FIELDS = [
  'availability',
  'price',
  'shop_name',
  'shop_name2',
  'name1',
  'page_url',
  'show_torobpay_badge',
  'is_price_unreliable',
] as const;
function trimDetails(body: any) {
  const offers = (list: any[] | undefined) =>
    (list ?? []).map((o) => ({
      ...Object.fromEntries(OFFER_FIELDS.map((k) => [k, o[k]])),
      score_info: { score: o.score_info?.score, score_text: o.score_info?.score_text },
    }));
  return {
    structural_specs: body?.structural_specs,
    key_specs: body?.key_specs,
    products_info: { result: offers(body?.products_info?.result) },
    products_in_store_info: { result: offers(body?.products_in_store_info?.result) },
  };
}

function rawInputs(rawDir: string): Inputs {
  const runs = dayDirs(rawDir)
    .flatMap((d) => readJsonl(join(rawDir, d, 'runs.jsonl')))
    .filter((r) => r.step === 'summary')
    .sort((a, b) => String(a.finished_at).localeCompare(String(b.finished_at)));
  const last = runs.at(-1);
  const cards = new Map<string, Card[]>();
  for (const day of dayDirs(rawDir)) {
    for (const page of readJsonl(join(rawDir, day, 'torob-search.jsonl'))) {
      for (const r of page.results ?? []) {
        if ((r.price ?? 0) > config.offers.maxPriceToman) continue;
        const list = cards.get(r.random_key) ?? [];
        list.push({
          run_id: page.run_id,
          fetched_at: page.fetched_at,
          name1: r.name1 ?? '',
          name2: r.name2 ?? '',
          price: r.price ?? 0,
          shop_text: r.shop_text ?? '',
          url: `https://torob.com${r.web_client_absolute_url ?? ''}`,
          image_url: r.image_url ?? null,
          is_adv: !!r.is_adv,
        });
        cards.set(r.random_key, list);
      }
    }
  }
  const details = new Map<string, Details>();
  const dir = join(rawDir, 'details');
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    if (!f.endsWith('.json')) continue;
    const d = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    details.set(f.slice(0, -5), { fetched_at: d.fetched_at, body: trimDetails(d.body) });
  }
  return {
    quotes: loadQuotes(rawDir),
    run: last
      ? {
          run_id: last.run_id,
          started_at: last.started_at,
          finished_at: last.finished_at,
          requests: last.requests ?? 0,
          stopped: last.stopped ?? null,
          details_fetched: last.details_fetched ?? 0,
        }
      : null,
    cards,
    details,
  };
}

function snapshotInputs(path: string): Inputs {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const meta = db.prepare('SELECT * FROM meta').get() as Record<string, any>;
    if (meta.schema_version < SCHEMA_VERSION) {
      throw new Error(
        `snapshot ${path} is schema v${meta.schema_version}; a merge needs v${SCHEMA_VERSION}`,
      );
    }
    const cards = new Map<string, Card[]>();
    for (const r of db.prepare('SELECT * FROM source_card').all() as any[]) {
      const list = cards.get(r.product_id) ?? [];
      list.push({
        run_id: r.run_id,
        fetched_at: r.fetched_at,
        name1: r.name1,
        name2: r.name2,
        price: r.price,
        shop_text: r.shop_text,
        url: r.url,
        image_url: r.image_url,
        is_adv: !!r.is_adv,
      });
      cards.set(r.product_id, list);
    }
    const details = new Map<string, Details>();
    for (const r of db.prepare('SELECT * FROM source_details').all() as any[]) {
      details.set(r.product_id, { fetched_at: r.fetched_at, body: JSON.parse(r.body) });
    }
    const quotes = (
      db
        .prepare('SELECT source, value_toman, quoted_at, fetched_at FROM gold_quote')
        .all() as any[]
    ).map((q) => ({
      source: q.source,
      g_toman: q.value_toman,
      quoted_at: q.quoted_at,
      fetched_at: q.fetched_at,
    }));
    return {
      quotes,
      run: {
        run_id: meta.run_id,
        started_at: meta.started_at,
        finished_at: meta.finished_at,
        requests: meta.requests,
        stopped: meta.stopped_reason,
        details_fetched: meta.details_fetched,
      },
      cards,
      details,
    };
  } finally {
    db.close();
  }
}

// Cards are joined (each observation once), the newer details page wins, quotes are joined, and the run that
// finished last names the snapshot.
function mergeInputs(a: Inputs, b: Inputs): Inputs {
  const cardKey = (c: Card) => `${c.run_id}|${c.fetched_at}|${c.price}|${c.name1}`;
  const cards = new Map<string, Card[]>();
  for (const src of [a.cards, b.cards]) {
    for (const [id, list] of src) {
      const have = cards.get(id) ?? [];
      const keys = new Set(have.map(cardKey));
      cards.set(id, [...have, ...list.filter((c) => !keys.has(cardKey(c)))]);
    }
  }
  const details = new Map(a.details);
  for (const [id, d] of b.details) {
    const old = details.get(id);
    if (!old || d.fetched_at > old.fetched_at) details.set(id, d);
  }
  const quoteKey = (q: Quote) => `${q.source}|${q.fetched_at}|${q.g_toman}`;
  const quotes = [
    ...new Map([...a.quotes, ...b.quotes].map((q) => [quoteKey(q), q])).values(),
  ];
  const run = !a.run || (b.run && b.run.finished_at > a.run.finished_at) ? b.run : a.run;
  return { quotes, run, cards, details };
}

function buildSnapshot({
  rawDir,
  outPath,
  base,
}: {
  rawDir: string;
  outPath: string;
  base?: string;
}): void {
  const raw = rawInputs(rawDir);
  writeSnapshot(base ? mergeInputs(snapshotInputs(base), raw) : raw, outPath);
}

function writeSnapshot(inputs: Inputs, outPath: string): void {
  const lastRun = inputs.run;
  if (!lastRun) throw new Error('no completed run in the inputs');
  // ids follow time, so the same quotes get the same ids however they were gathered
  const quotes: StoredQuote[] = [...inputs.quotes]
    .sort(
      (x, y) =>
        x.fetched_at.localeCompare(y.fetched_at) ||
        x.source.localeCompare(y.source) ||
        x.g_toman - y.g_toman,
    )
    .map((q, i) => ({ ...q, id: i + 1 }));
  const cards = inputs.cards;

  const tmp = `${outPath}.tmp`;
  mkdirSync(dirname(outPath), { recursive: true });
  rmSync(tmp, { force: true });
  const db = new DatabaseSync(tmp);
  db.exec(SCHEMA);
  db.exec('BEGIN');
  db.prepare('INSERT INTO meta VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    SCHEMA_VERSION,
    lastRun.run_id,
    lastRun.started_at,
    lastRun.finished_at,
    lastRun.requests ?? 0,
    lastRun.stopped ?? null,
    PIPELINE_VERSION,
    40,
    lastRun.details_fetched ?? 0,
  );
  const insQuote = db.prepare("INSERT INTO gold_quote VALUES (?, ?, '18k', ?, ?, ?)");
  for (const q of quotes) {
    insQuote.run(q.id, q.source, q.g_toman, q.quoted_at, q.fetched_at);
  }

  const insProduct = db.prepare(
    'INSERT INTO product VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, ?, ?)',
  );
  const insOffer = db.prepare(
    'INSERT INTO offer VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const insAttr = db.prepare('INSERT INTO attribute VALUES (?, ?, ?, ?, ?, ?)');
  const insLabel = db.prepare('INSERT INTO label VALUES (?, ?, ?, ?, ?)');
  const insBreakdown = db.prepare(
    'INSERT INTO breakdown VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const insHistory = db.prepare(
    'INSERT OR REPLACE INTO history VALUES (?, ?, ?, ?, ?, ?)',
  );
  const insCard = db.prepare(
    'INSERT INTO source_card VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const insDetails = db.prepare('INSERT INTO source_details VALUES (?, ?, ?)');
  for (const [id, d] of inputs.details) {
    insDetails.run(id, d.fetched_at, JSON.stringify(d.body));
  }

  for (const [productId, seen] of cards) {
    seen.sort(
      (a, b) =>
        a.fetched_at.localeCompare(b.fetched_at) ||
        a.run_id.localeCompare(b.run_id) ||
        a.price - b.price,
    );
    const latest = seen.at(-1)!;
    const details = inputs.details.get(productId) ?? null;
    const specs = details ? specsFromDetails(details.body) : {};
    const offers = mergeCard(
      cardOffer(productId, latest),
      details ? detailsOffers(productId, details.body, details.fetched_at) : [],
    );
    const rep = eligibleOffers(offers, {}, lastRun.finished_at, false)[0] ?? offers[0]!;
    const attrs = extract({ title: latest.name1, specs, shop: rep.shop });
    const repQuote = quoteAt(quotes, rep.fetched_at, LABEL_QUOTE_WINDOW_MS);
    const label = labelProduct({
      title: latest.name1,
      specs,
      attributes: attrs,
      price: rep.price,
      g_at_fetch: repQuote?.g ?? null,
      offer_titles: offers
        .filter((o) => o.source === 'torob_details')
        .map((o) => o.title),
    });

    for (const c of seen) {
      insCard.run(
        productId,
        c.run_id,
        c.fetched_at,
        c.name1,
        c.name2,
        c.price,
        c.shop_text,
        c.url,
        c.image_url,
        c.is_adv ? 1 : 0,
      );
    }
    insProduct.run(
      productId,
      latest.name1,
      latest.name2,
      latest.image_url,
      latest.url,
      MULTI_SHOP.test(latest.shop_text)
        ? Number(normalize(latest.shop_text).match(/\d+/)?.[0])
        : 1,
      seen[0]!.fetched_at,
      latest.fetched_at,
      details?.fetched_at ?? null,
    );
    for (const r of attributeRows(productId, attrs)) insAttr.run(...r);
    insLabel.run(
      productId,
      label.label,
      JSON.stringify(label.reasons),
      label.price_ratio,
      label.weight_unknown ? 1 : 0,
    );

    for (const o of offers) {
      const q = quoteAt(quotes, o.fetched_at);
      insOffer.run(
        o.id,
        productId,
        o.source,
        o.shop,
        o.city,
        o.channel,
        o.title,
        o.price,
        o.url,
        o.torob_pay ? 1 : 0,
        0,
        o.price_unreliable ? 1 : 0,
        o.shop_stars,
        o.shop_months,
        o.fetched_at,
        q?.id ?? null,
      );
      if (!q || !attrs.weight_g) continue;
      const vat = vatRateFor(new Date(o.fetched_at));
      const profit =
        (attrs.declared_profit_pct?.value ?? config.price.profit * 100) / 100;
      const b = priceBreakdown({
        price: o.price,
        weight_g: attrs.weight_g.value,
        karat: attrs.karat?.value ?? 18,
        g_at_fetch: q.g,
        declared_ojrat_pct: attrs.declared_ojrat_pct?.value ?? null,
        non_gold: {
          has: !!attrs.non_gold,
          declared_cost_toman: attrs.non_gold_cost_toman?.value ?? null,
        },
        vat,
        profit,
      });
      insBreakdown.run(
        o.id,
        b.gold_value,
        b.premium_pct,
        b.implied_ojrat_pct,
        b.declared_ojrat_pct,
        b.parts ? JSON.stringify(b.parts) : null,
        b.breakeven_g,
        b.vat_overcharge ? 1 : 0,
        b.partial_reason,
        vat,
        profit,
      );
    }

    // DM-05: one row per product × shop × day, the last observation of the day; cards that name no shop use "".
    if (attrs.weight_g) {
      for (const c of seen) {
        const q = quoteAt(quotes, c.fetched_at);
        if (!q) continue;
        const shop = cardOffer(productId, c).shop ?? '';
        const gold = (attrs.weight_g.value * q.g * (attrs.karat?.value ?? 18)) / 18;
        insHistory.run(
          productId,
          shop,
          tehranDay(c.fetched_at),
          c.price,
          (c.price / gold - 1) * 100,
          q.g,
        );
      }
    }
  }
  db.exec('COMMIT');
  db.close();
  renameSync(tmp, outPath); // the swap is atomic, so a reader never sees a half-written snapshot
}

// The server bundle shares one import.meta, so this file must also be the script that was started.
if (import.meta.main && process.argv[1]?.endsWith('build-snapshot.ts')) {
  const root = new URL('../../../', import.meta.url).pathname;
  const raw = process.argv[2] ?? join(root, 'data/raw');
  const out = process.argv[3] ?? join(root, 'data/snapshots/latest.sqlite');
  buildSnapshot({ rawDir: raw, outPath: out, base: process.argv[4] });
  console.log(`snapshot written: ${out}`);
}

export { SCHEMA_VERSION, PIPELINE_VERSION, shopRating, buildSnapshot };
