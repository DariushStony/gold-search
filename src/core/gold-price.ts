import { config as defaults, type Config } from "./config.ts";

export type Source = "union" | "tgju";
export type Quote = { source: Source; g_toman: number; quoted_at: string; fetched_at: string };
export type Reference = {
  g_toman: number;
  source: Source;
  quoted_at: string;
  fetched_at: string;
  other: { source: Source; g_toman: number; quoted_at: string } | null;
  uncertain: boolean;
  market_open: boolean;
};

const TEHRAN_OFFSET_MIN = 210; // Iran has used UTC+3:30 all year since 2022

// Both sources stamp quotes as "YYYY-MM-DD HH:MM:SS" in Tehran time.
function tehranToIso(stamp: unknown): string | null {
  if (typeof stamp !== "string") return null;
  const m = stamp.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number) as number[];
  const utc = Date.UTC(y!, mo! - 1, d!, h!, mi!, s!) - TEHRAN_OFFSET_MIN * 60_000;
  return new Date(utc).toISOString();
}

// POST estjt.ir/wp-admin/admin-ajax.php action=tablotala_timer; values in toman.
export function parseUnion(body: unknown, fetchedAt: string): Quote | null {
  const data = (body as { success?: boolean; data?: Record<string, unknown> })?.data;
  if (!(body as { success?: boolean })?.success || !data) return null;
  const value = (data.IRG18 as { value?: unknown } | undefined)?.value;
  const quotedAt = tehranToIso(data.date);
  if (typeof value !== "number" || value <= 0 || !quotedAt) return null;
  return { source: "union", g_toman: value, quoted_at: quotedAt, fetched_at: fetchedAt };
}

// The `current` map of call1.tgju.org/ajax.json; prices in rial with commas.
export function parseTgju(prices: unknown, fetchedAt: string): Quote | null {
  const g = (prices as Record<string, { p?: unknown; ts?: unknown }> | undefined)?.geram18;
  const rial = typeof g?.p === "string" ? Number(g.p.replaceAll(",", "")) : NaN;
  const quotedAt = tehranToIso(g?.ts);
  if (!Number.isFinite(rial) || rial <= 0 || !quotedAt) return null;
  return { source: "tgju", g_toman: Math.round(rial / 10), quoted_at: quotedAt, fetched_at: fetchedAt };
}

const ageMinutes = (q: Quote, now: Date) => (now.getTime() - Date.parse(q.quoted_at)) / 60_000;

export function selectReference(union: Quote | null, tgju: Quote | null, now: Date, cfg: Config = defaults): Reference | null {
  const { unionStaleMinutes, marketOpenWindowMinutes, uncertainPct } = cfg.gold;
  const marketOpen = [union, tgju].some((q) => q !== null && ageMinutes(q, now) <= marketOpenWindowMinutes);
  const unionStale =
    union !== null && tgju !== null && marketOpen && ageMinutes(union, now) > unionStaleMinutes && Date.parse(tgju.quoted_at) > Date.parse(union.quoted_at);
  const chosen = union && !unionStale ? union : tgju;
  if (!chosen) return null;
  const other = chosen === union ? tgju : union;
  const uncertain = union !== null && tgju !== null && (Math.abs(union.g_toman - tgju.g_toman) / union.g_toman) * 100 > uncertainPct;
  return {
    g_toman: chosen.g_toman,
    source: chosen.source,
    quoted_at: chosen.quoted_at,
    fetched_at: chosen.fetched_at,
    other: other ? { source: other.source, g_toman: other.g_toman, quoted_at: other.quoted_at } : null,
    uncertain,
    market_open: marketOpen,
  };
}
