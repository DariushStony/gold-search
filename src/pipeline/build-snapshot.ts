// K-02: all raw files so far → one immutable SQLite snapshot (data model §2).
// Run: node src/pipeline/build-snapshot.ts [rawDir] [outPath]
import { readdirSync, readFileSync, existsSync, rmSync, renameSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseTgju, parseUnion, selectReference, type Quote } from "../core/gold-price.ts";
import { extract, specsFromDetails, normalize, type Attributes } from "../core/extract.ts";
import { labelProduct } from "../core/label.ts";
import { priceBreakdown, vatRateFor } from "../core/price.ts";
import { eligibleOffers, mergeCard, type OfferRow } from "../core/offers.ts";
import { config } from "../core/config.ts";

export const SCHEMA_VERSION = 1;
export const PIPELINE_VERSION = "0.1.0";
const QUOTE_WINDOW_MS = 60 * 60_000; // DM-01

const SCHEMA = `
CREATE TABLE meta (schema_version INTEGER, run_id TEXT, started_at TEXT, finished_at TEXT, requests INTEGER, stopped_reason TEXT, pipeline_version TEXT, details_budget INTEGER, details_fetched INTEGER);
CREATE TABLE gold_quote (id INTEGER PRIMARY KEY, source TEXT, kind TEXT, value_toman INTEGER, quoted_at TEXT, fetched_at TEXT);
CREATE TABLE product (id TEXT PRIMARY KEY, title TEXT, subtitle TEXT, image_url TEXT, category_path TEXT, torob_url TEXT, card_shop_count INTEGER, sample INTEGER, first_seen_at TEXT, last_seen_at TEXT, details_fetched_at TEXT);
CREATE TABLE offer (id TEXT PRIMARY KEY, product_id TEXT, source TEXT, shop TEXT, city TEXT, channel TEXT, title TEXT, price_toman INTEGER, url TEXT, torob_pay INTEGER, is_adv INTEGER, price_unreliable INTEGER, shop_score_pct REAL, fetched_at TEXT NOT NULL, gold_quote_id INTEGER);
CREATE TABLE attribute (product_id TEXT, name TEXT, value TEXT, provenance TEXT, confidence REAL, evidence TEXT);
CREATE TABLE label (product_id TEXT PRIMARY KEY, label TEXT, reasons TEXT, price_ratio REAL, weight_unknown INTEGER);
CREATE TABLE breakdown (offer_id TEXT PRIMARY KEY, gold_value INTEGER, premium_pct REAL, implied_ojrat_pct REAL, declared_ojrat_pct REAL, parts TEXT, breakeven_g INTEGER, vat_overcharge INTEGER, partial_reason TEXT, vat REAL, profit REAL);
CREATE TABLE history (product_id TEXT, shop TEXT, observed_on TEXT, price_toman INTEGER, premium_pct REAL, g_toman INTEGER, PRIMARY KEY (product_id, shop, observed_on));
CREATE INDEX offer_product ON offer(product_id);
CREATE INDEX attribute_product ON attribute(product_id, name);
CREATE INDEX history_shop ON history(shop, observed_on);
`;

type Card = { run_id: string; fetched_at: string; name1: string; name2: string; price: number; shop_text: string; url: string; image_url: string | null; is_adv: boolean };
type StoredQuote = Quote & { id: number };

const readJsonl = (path: string) => (existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const dayDirs = (raw: string) => readdirSync(raw).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
const MULTI_SHOP = /در\s*[۰-۹0-9]+\s*فروشگاه/;

function loadQuotes(raw: string): StoredQuote[] {
  const quotes: StoredQuote[] = [];
  for (const day of dayDirs(raw)) {
    for (const r of readJsonl(join(raw, day, "gold-price.jsonl"))) {
      const q = String(r.source).includes("tgju") ? parseTgju(r.prices, r.fetched_at) : parseUnion(r.body, r.fetched_at);
      if (q) quotes.push({ ...q, id: quotes.length + 1 });
    }
  }
  return quotes;
}

// DM-01: the reference at fetch time, from the quotes of each source nearest to it within 60 minutes.
function quoteAt(quotes: StoredQuote[], at: string): { g: number; id: number } | null {
  const t = Date.parse(at);
  const nearest = (source: Quote["source"]) => quotes
    .filter((q) => q.source === source && Math.abs(Date.parse(q.fetched_at) - t) <= QUOTE_WINDOW_MS)
    .sort((a, b) => Math.abs(Date.parse(a.fetched_at) - t) - Math.abs(Date.parse(b.fetched_at) - t))[0] ?? null;
  const union = nearest("union"), tgju = nearest("tgju");
  const ref = selectReference(union, tgju, new Date(t));
  if (!ref) return null;
  const used = ref.source === "union" ? union : tgju;
  return { g: ref.g_toman, id: used!.id };
}

function detailsOffers(productId: string, body: any, fetchedAt: string): OfferRow[] {
  const rows: OfferRow[] = [];
  const add = (o: any, channel: OfferRow["channel"]) => rows.push({
    id: `${productId}:${channel}:${rows.length}`, product_id: productId, source: "torob_details",
    shop: o.shop_name ?? null, city: o.shop_name2 ?? null, channel, title: String(o.name1 ?? ""), price: o.price,
    url: o.page_url ?? "", torob_pay: !!o.show_torobpay_badge, price_unreliable: !!o.is_price_unreliable,
    shop_score_pct: typeof o.shop_score_percentile === "number" ? o.shop_score_percentile : null, fetched_at: fetchedAt,
  });
  for (const o of body.products_info?.result ?? []) if (o.availability && o.price > 0) add(o, "online"); // DM-08: priced offers only
  for (const o of body.products_in_store_info?.result ?? []) if (o.price > 0) add(o, "in_person");
  return rows;
}

function cardOffer(productId: string, c: Card): OfferRow {
  const named = MULTI_SHOP.test(c.shop_text) ? null : c.shop_text.replace(/^در\s+/, "").trim() || null;
  return {
    id: `${productId}:card`, product_id: productId, source: "torob_search", shop: named, city: null, channel: "online",
    title: c.name1, price: c.price, url: c.url, torob_pay: false, price_unreliable: false, shop_score_pct: null, fetched_at: c.fetched_at,
  };
}

function attributeRows(productId: string, a: Attributes): [string, string, string, string, number, string][] {
  const rows: [string, string, string, string, number, string][] = [];
  const put = (name: string, f: { value: unknown; provenance: string; evidence: string } | null) => {
    if (f) rows.push([productId, name, String(f.value), f.provenance, 1, f.evidence]);
  };
  put("weight_g", a.weight_g);
  if (a.weight_conflict) rows.push([productId, "weight_conflict", "true", "spec", 1, a.weight_g?.evidence ?? ""]);
  put("karat", a.karat); put("declared_ojrat_pct", a.declared_ojrat_pct); put("declared_profit_pct", a.declared_profit_pct);
  put("gallery", a.gallery); put("item_type", a.item_type); put("audience", a.audience); put("condition", a.condition);
  for (const s of a.style_tags) put("style_tags", s);
  put("non_gold_kind", a.non_gold); put("non_gold_cost_toman", a.non_gold_cost_toman);
  if (a.non_gold) rows.push([productId, "has_non_gold_parts", "true", a.non_gold.provenance, 1, a.non_gold.evidence]);
  return rows;
}

const tehranDay = (iso: string) => new Date(Date.parse(iso) + 210 * 60_000).toISOString().slice(0, 10);

export function buildSnapshot({ rawDir, outPath }: { rawDir: string; outPath: string }): void {
  const quotes = loadQuotes(rawDir);
  const runs = dayDirs(rawDir).flatMap((d) => readJsonl(join(rawDir, d, "runs.jsonl"))).filter((r) => r.step === "summary");
  const lastRun = runs.sort((a, b) => String(a.finished_at).localeCompare(String(b.finished_at))).at(-1);
  if (!lastRun) throw new Error(`no completed run in ${rawDir}`);

  const cards = new Map<string, Card[]>();
  for (const day of dayDirs(rawDir)) for (const page of readJsonl(join(rawDir, day, "torob-search.jsonl"))) {
    for (const r of page.results ?? []) {
      const list = cards.get(r.random_key) ?? [];
      list.push({ run_id: page.run_id, fetched_at: page.fetched_at, name1: r.name1 ?? "", name2: r.name2 ?? "", price: r.price ?? 0,
        shop_text: r.shop_text ?? "", url: `https://torob.com${r.web_client_absolute_url ?? ""}`, image_url: r.image_url ?? null, is_adv: !!r.is_adv });
      cards.set(r.random_key, list);
    }
  }

  const tmp = `${outPath}.tmp`;
  mkdirSync(dirname(outPath), { recursive: true });
  rmSync(tmp, { force: true });
  const db = new DatabaseSync(tmp);
  db.exec(SCHEMA);
  db.exec("BEGIN");
  db.prepare("INSERT INTO meta VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(SCHEMA_VERSION, lastRun.run_id, lastRun.started_at, lastRun.finished_at,
    lastRun.requests ?? 0, lastRun.stopped ?? null, PIPELINE_VERSION, 40, lastRun.details_fetched ?? 0);
  const insQuote = db.prepare("INSERT INTO gold_quote VALUES (?, ?, '18k', ?, ?, ?)");
  for (const q of quotes) insQuote.run(q.id, q.source, q.g_toman, q.quoted_at, q.fetched_at);

  const insProduct = db.prepare("INSERT INTO product VALUES (?, ?, ?, ?, NULL, ?, ?, 0, ?, ?, ?)");
  const insOffer = db.prepare("INSERT INTO offer VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const insAttr = db.prepare("INSERT INTO attribute VALUES (?, ?, ?, ?, ?, ?)");
  const insLabel = db.prepare("INSERT INTO label VALUES (?, ?, ?, ?, ?)");
  const insBreakdown = db.prepare("INSERT INTO breakdown VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const insHistory = db.prepare("INSERT OR REPLACE INTO history VALUES (?, ?, ?, ?, ?, ?)");

  for (const [productId, seen] of cards) {
    seen.sort((a, b) => a.fetched_at.localeCompare(b.fetched_at));
    const latest = seen.at(-1)!;
    const detailsPath = join(rawDir, "details", `${productId}.json`);
    const details = existsSync(detailsPath) ? JSON.parse(readFileSync(detailsPath, "utf8")) : null;
    const specs = details ? specsFromDetails(details.body) : {};
    const offers = mergeCard(cardOffer(productId, latest), details ? detailsOffers(productId, details.body, details.fetched_at) : []);
    const rep = eligibleOffers(offers, {}, lastRun.finished_at, false)[0] ?? offers[0]!;
    const attrs = extract({ title: latest.name1, specs, shop: rep.shop });
    const repQuote = quoteAt(quotes, rep.fetched_at);
    const label = labelProduct({ title: latest.name1, specs, attributes: attrs, price: rep.price, g_at_fetch: repQuote?.g ?? null,
      offer_titles: offers.filter((o) => o.source === "torob_details").map((o) => o.title) });

    insProduct.run(productId, latest.name1, latest.name2, latest.image_url, latest.url, MULTI_SHOP.test(latest.shop_text) ? Number(normalize(latest.shop_text).match(/\d+/)?.[0]) : 1,
      seen[0]!.fetched_at, latest.fetched_at, details?.fetched_at ?? null);
    for (const r of attributeRows(productId, attrs)) insAttr.run(...r);
    insLabel.run(productId, label.label, JSON.stringify(label.reasons), label.price_ratio, label.weight_unknown ? 1 : 0);

    for (const o of offers) {
      const q = quoteAt(quotes, o.fetched_at);
      insOffer.run(o.id, productId, o.source, o.shop, o.city, o.channel, o.title, o.price, o.url, o.torob_pay ? 1 : 0, 0, o.price_unreliable ? 1 : 0, o.shop_score_pct, o.fetched_at, q?.id ?? null);
      if (!q || !attrs.weight_g) continue;
      const vat = vatRateFor(new Date(o.fetched_at));
      const profit = (attrs.declared_profit_pct?.value ?? config.price.profit * 100) / 100;
      const b = priceBreakdown({ price: o.price, weight_g: attrs.weight_g.value, karat: attrs.karat?.value ?? 18, g_at_fetch: q.g, g_live: null,
        declared_ojrat_pct: attrs.declared_ojrat_pct?.value ?? null, non_gold: { has: !!attrs.non_gold, declared_cost_toman: attrs.non_gold_cost_toman?.value ?? null }, vat, profit });
      insBreakdown.run(o.id, b.gold_value, b.premium_pct, b.implied_ojrat_pct, b.declared_ojrat_pct, b.parts ? JSON.stringify(b.parts) : null,
        b.breakeven_g, b.vat_overcharge ? 1 : 0, b.partial_reason, vat, profit);
    }

    // DM-05: one row per product × shop × day, the last observation of the day; cards that name no shop use "".
    if (attrs.weight_g) for (const c of seen) {
      const q = quoteAt(quotes, c.fetched_at);
      if (!q) continue;
      const shop = cardOffer(productId, c).shop ?? "";
      const gold = attrs.weight_g.value * q.g * (attrs.karat?.value ?? 18) / 18;
      insHistory.run(productId, shop, tehranDay(c.fetched_at), c.price, (c.price / gold - 1) * 100, q.g);
    }
  }
  db.exec("COMMIT");
  db.close();
  renameSync(tmp, outPath); // the swap is atomic, so a reader never sees a half-written snapshot
}

if (import.meta.main) {
  const root = new URL("../../", import.meta.url).pathname;
  const raw = process.argv[2] ?? join(root, "data/raw");
  const out = process.argv[3] ?? join(root, "data/snapshots/latest.sqlite");
  buildSnapshot({ rawDir: raw, outPath: out });
  console.log(`snapshot written: ${out}`);
}
