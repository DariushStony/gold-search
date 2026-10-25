// K-04: load one immutable snapshot into memory for the search core (TDD §8, data model §2).
import { DatabaseSync } from "node:sqlite";
import type { ProductRecord } from "../core/rank.ts";
import type { Label } from "../core/label.ts";

export type SnapshotMeta = { schema_version: number; run_id: string; started_at: string; finished_at: string; pipeline_version: string };
export type Snapshot = { meta: SnapshotMeta; products: ProductRecord[] };

type Row = Record<string, unknown>;

export function loadSnapshot(path: string): Snapshot {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const meta = { ...(db.prepare("SELECT schema_version, run_id, started_at, finished_at, pipeline_version FROM meta").get() as Row) } as SnapshotMeta;
    const quotes = new Map((db.prepare("SELECT id, value_toman FROM gold_quote").all() as Row[]).map((q) => [q.id as number, q.value_toman as number]));
    const attrs = new Map<string, Row[]>();
    for (const a of db.prepare("SELECT product_id, name, value FROM attribute").all() as Row[]) {
      attrs.set(a.product_id as string, [...(attrs.get(a.product_id as string) ?? []), a]);
    }
    const offers = new Map<string, ProductRecord["offers"]>();
    for (const o of db.prepare("SELECT * FROM offer ORDER BY price_toman").all() as Row[]) {
      const list = offers.get(o.product_id as string) ?? [];
      list.push({
        id: o.id as string,
        product_id: o.product_id as string,
        source: o.source as "torob_search" | "torob_details",
        shop: (o.shop as string | null) ?? null,
        city: (o.city as string | null) ?? null,
        channel: o.channel as "online" | "in_person",
        title: o.title as string,
        price: o.price_toman as number,
        url: o.url as string,
        torob_pay: o.torob_pay === 1,
        price_unreliable: o.price_unreliable === 1,
        shop_score_pct: (o.shop_score_pct as number | null) ?? null,
        fetched_at: o.fetched_at as string,
        g_at_fetch: o.gold_quote_id === null ? null : (quotes.get(o.gold_quote_id as number) ?? null),
      });
      offers.set(o.product_id as string, list);
    }
    const products: ProductRecord[] = [];
    for (const p of db
      .prepare("SELECT p.id, p.title, p.image_url, p.sample, l.label, l.reasons, l.weight_unknown FROM product p JOIN label l ON l.product_id = p.id")
      .all() as Row[]) {
      const id = p.id as string;
      const a = attrs.get(id) ?? [];
      const get = (name: string) => a.find((x) => x.name === name)?.value as string | undefined;
      const num = (name: string) => (get(name) === undefined ? null : Number(get(name)));
      products.push({
        id,
        title: p.title as string,
        image_url: (p.image_url as string | null) ?? null,
        label: p.label as Label,
        reasons: JSON.parse(p.reasons as string),
        sponsored: false,
        attrs: {
          weight_g: num("weight_g"),
          karat: num("karat"),
          item_type: get("item_type") ?? null,
          audience: get("audience") ?? null,
          condition: get("condition") === "used" ? "used" : null,
          gallery: get("gallery") ?? null,
          style_tags: a.filter((x) => x.name === "style_tags").map((x) => x.value as string),
          non_gold: get("has_non_gold_parts") === "true",
          declared_ojrat_pct: num("declared_ojrat_pct"),
        },
        offers: offers.get(id) ?? [],
      });
    }
    return { meta, products };
  } finally {
    db.close();
  }
}
