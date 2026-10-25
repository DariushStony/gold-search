// K-04 for the first demo (D-34, ADR-0010): one Node HTTP server, no framework.
// Serves src/web/index.html and the API contract's endpoints over the in-memory snapshot.
// Run: node src/app/server.ts [snapshotPath] [port]
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { config } from '../core/config.ts';
import { readEnv } from '../core/env.ts';
import type { Chip } from '../shared/chips.ts';
import { eligibleOffers, isStale } from '../domains/catalog/offers.ts';
import { loadSnapshot, type Snapshot } from '../domains/catalog/snapshot.ts';
import { createGoldFeed } from '../domains/pricing/gold-feed.ts';
import { parseTgju, parseUnion, type Reference } from '../domains/pricing/gold-price.ts';
import { priceBreakdown, vatRateFor } from '../domains/pricing/price.ts';
import { avalai, parser, type Llm } from '../domains/query/ai-reader.ts';
import type { Answers } from '../domains/query/parse.ts';
import {
  excludedFor,
  search,
  type Card,
  type ProductRecord,
} from '../domains/ranking/rank.ts';

const ROOT = new URL('../../', import.meta.url).pathname;
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
// Product images come from Torob's CDN and the font from Google Fonts; nothing else loads from outside.
const HEADERS = {
  'X-Robots-Tag': 'noindex',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' https: data:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; '),
};
const ARCHIVE_AFTER_H = 48; // BR-16
const GOLD_TTL_MS = 120_000;

// BR-100: round-trip cost of the other ways to hold gold, as published by each source.
const SAVINGS_ROWS = [
  {
    form: 'used',
    round_trip_cost_pct: 8,
    source: 'مجله‌ی دیجی‌کالا (۷ تا ۹٪)',
    source_url: 'https://www.digikala.com/mag/where-to-buy-second-hand-gold/',
    url: null,
    as_of: '1404-08-19',
    own_product: false,
  },
  {
    form: 'molten',
    round_trip_cost_pct: 4,
    source: 'بانک اول (۴٪ یا بیشتر)',
    source_url: 'https://bankavl.com/',
    url: null,
    as_of: '1405-05-13',
    own_product: false,
  },
  {
    form: 'digital',
    round_trip_cost_pct: 1.5,
    source: 'بانک اول (۱ تا ۲٪)',
    source_url: 'https://bankavl.com/',
    url: null,
    as_of: '1405-05-13',
    own_product: false,
  },
  {
    form: 'torob_gold',
    round_trip_cost_pct: 1,
    source: 'ایران‌بروکر (خرید ۰٪، فروش ۱٪)',
    source_url: 'https://iranbroker.net/gold_platform/torob-gold/',
    url: 'https://torob.com/',
    as_of: '1404-05',
    own_product: true,
  },
] as const;

// A source that answers with an error page or a bot check is a failure with a reason, not a silent null.
// 25 s because the union board took 10 to 12 s to answer on 2026-10-25; the feed waits in the background.
async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000) });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!type.includes('json')) throw new Error(`not JSON (${type || 'no content type'})`);
  return res.json();
}

const goldPrice = createGoldFeed({
  sources: {
    union: async () =>
      parseUnion(
        await fetchJson('https://www.estjt.ir/wp-admin/admin-ajax.php', {
          method: 'POST',
          body: 'action=tablotala_timer',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
        new Date().toISOString(),
      ),
    tgju: async () =>
      parseTgju(
        ((await fetchJson('https://call1.tgju.org/ajax.json')) as { current?: unknown })
          .current,
        new Date().toISOString(),
      ),
  },
  ttlMs: GOLD_TTL_MS,
  firstWaitMs: 3000,
});

function snapshotInfo(s: Snapshot) {
  const ageH = (Date.now() - Date.parse(s.meta.finished_at)) / 3_600_000;
  return {
    id: s.meta.run_id,
    finished_at: s.meta.finished_at,
    pipeline_version: s.meta.pipeline_version,
    archive_mode: ageH > ARCHIVE_AFTER_H,
  };
}

function breakdownFor(
  p: ProductRecord,
  o: ProductRecord['offers'][number],
  gLive: Reference | null,
) {
  if (p.attrs.weight_g === null) {
    return { breakdown: null, no_breakdown_reason: 'weight_unknown' };
  }
  if (o.g_at_fetch === null) {
    return { breakdown: null, no_breakdown_reason: 'no_gold_quote' };
  }
  const vat = vatRateFor(new Date(o.fetched_at));
  const b = priceBreakdown({
    price: o.price,
    weight_g: p.attrs.weight_g,
    karat: p.attrs.karat ?? 18,
    g_at_fetch: o.g_at_fetch,
    declared_ojrat_pct: p.attrs.declared_ojrat_pct,
    non_gold: { has: p.attrs.non_gold, declared_cost_toman: null },
    vat,
    profit: config.price.profit,
  });
  return {
    breakdown: {
      ...b,
      inputs: {
        weight_g: p.attrs.weight_g,
        karat: p.attrs.karat ?? 18,
        karat_assumed: p.attrs.karat === null,
        g_at_fetch: o.g_at_fetch,
        g_live: gLive?.g_toman ?? null, // shown for context only; no number above uses it (CR-07)
        g_live_source: gLive?.source ?? null,
        vat,
        profit: config.price.profit,
      },
    },
    no_breakdown_reason: null,
  };
}

function cardJson(c: Card, p: ProductRecord, gLive: Reference | null) {
  const { premium_pct: _p, g_at_fetch: _g, ...offer } = c.offer;
  return {
    id: c.id,
    title: c.title,
    image_url: c.image_url,
    item_type: p.attrs.item_type,
    gallery: p.attrs.gallery,
    label: c.label,
    reasons: c.reasons,
    weight_unknown: c.weight_unknown,
    weight_g: p.attrs.weight_g,
    sample: false,
    non_gold: p.attrs.non_gold,
    offer: { ...offer, ...breakdownFor(p, c.offer, gLive) },
    offer_count: c.offer_count,
    price_range: c.price_range,
    score: c.score,
    components: c.components,
  };
}

const median = (xs: number[]) =>
  xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : null;

type Deps = {
  goldPrice?: () => Promise<Reference | null>;
  eventsFile?: string | null; // null: write events to the log (a container with no disk, ADR-0012)
  llm?: Llm | null;
  trustProxy?: boolean; // behind the host's ingress every request comes from its proxy; the client is the first X-Forwarded-For entry
  log?: (line: string) => void;
  webDir?: string; // the built page and its assets (pnpm build:web)
};

function createApp(snapshotPath: string, deps: Deps = {}) {
  return createServer(createHandler(snapshotPath, deps));
}

// Each field is checked where it is used; answers goes to the parser as it is.
type RequestBody = {
  text?: unknown;
  answers?: Answers;
  chips?: unknown;
  snapshot_id?: unknown;
} & Record<string, unknown>;

function createHandler(snapshotPath: string, deps: Deps = {}) {
  const snap = loadSnapshot(snapshotPath);
  const livePrice = async () => (await (deps.goldPrice ?? goldPrice)()) ?? snap.gold;
  const byId = new Map(snap.products.map((p) => [p.id, p]));
  const webDir = deps.webDir ?? join(ROOT, 'dist/web');
  const hits = new Map<string, number[]>();
  const eventsFile =
    deps.eventsFile === undefined
      ? join(ROOT, 'data/events/events.jsonl')
      : deps.eventsFile;
  const log = deps.log ?? ((line: string) => console.log(line));
  const parse = parser(deps.llm ?? null);

  const send = (
    res: ServerResponse,
    status: number,
    body: unknown,
    type = 'application/json; charset=utf-8',
  ) => {
    res.writeHead(status, {
      ...HEADERS,
      'Content-Type': type,
      'Cache-Control': 'no-store',
    });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  // The page and its hashed assets; an asset URL carries ?v=<hash>, so it can be cached for a year.
  const sendFile = (res: ServerResponse, name: string, cache: string, status = 200) => {
    const type = TYPES[name.slice(name.lastIndexOf('.'))];
    let body: Buffer;
    try {
      body = readFileSync(join(webDir, name));
    } catch {
      return problem(res, 404, 'not-found', name);
    }
    if (!type) return problem(res, 404, 'not-found', name);
    res.writeHead(status, { ...HEADERS, 'Content-Type': type, 'Cache-Control': cache });
    res.end(body);
  };
  const problem = (res: ServerResponse, status: number, type: string, detail: string) =>
    send(
      res,
      status,
      { type: `/problems/${type}`, title: type, status, detail },
      'application/problem+json; charset=utf-8',
    );
  const readJson = (req: IncomingMessage) =>
    new Promise<RequestBody | null>((resolve) => {
      let raw = '';
      req.on('data', (d) => {
        raw += d;
        if (raw.length > 100_000) req.destroy();
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(raw || '{}'));
        } catch {
          resolve(null);
        }
      });
    });
  // API §2: per IP, in memory only, with one budget for the search calls and another for status and events.
  const limited = (req: IncomingMessage, bucket: 'search' | 'light', perMin: number) => {
    const forwarded = deps.trustProxy
      ? String(req.headers['x-forwarded-for'] ?? '')
          .split(',')[0]!
          .trim()
      : '';
    const ip = `${bucket}:${forwarded || req.socket.remoteAddress || '?'}`;
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
    recent.push(now);
    hits.set(ip, recent);
    return recent.length > perMin;
  };
  const ctxFor = async () => {
    const info = snapshotInfo(snap);
    const g = await livePrice();
    return {
      info,
      g,
      ctx: {
        finishedAt: snap.meta.finished_at,
        archive: info.archive_mode,
        gLive: g?.g_toman ?? null,
      },
    };
  };
  const validChips = (chips: unknown): chips is Chip[] =>
    Array.isArray(chips) && chips.every((c) => c && typeof c.kind === 'string');

  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const read = req.method === 'GET' || req.method === 'HEAD'; // Node drops the body of a HEAD response itself
    try {
      if (read && (url.pathname === '/' || url.pathname === '/index.html')) {
        return sendFile(res, 'index.html', 'no-cache');
      }
      // the Atlas: static pages built by pnpm build:web; a slug is lower-case letters, digits and dashes only
      const atlas = read && url.pathname.match(/^\/atlas(?:\/(.*?))?\/?$/);
      if (atlas) {
        const name = atlas[1] || 'index';
        if (
          /^[a-z0-9-]+$/.test(name) &&
          existsSync(join(webDir, 'atlas', `${name}.html`))
        ) {
          return sendFile(res, `atlas/${name}.html`, 'no-cache');
        }
        return sendFile(res, 'atlas/404.html', 'no-cache', 404);
      }
      if (read && url.pathname === '/robots.txt') {
        return send(
          res,
          200,
          'User-agent: *\nDisallow: /\n',
          'text/plain; charset=utf-8',
        ); // a private demo
      }
      if (read && url.pathname === '/favicon.ico') {
        return sendFile(res, 'assets/favicon.svg', 'public, max-age=86400');
      }
      const asset =
        read && url.pathname.match(/^\/assets\/([\w-]+\.(?:js|css|map|svg|png))$/);
      if (asset) {
        return sendFile(
          res,
          `assets/${asset[1]}`,
          url.searchParams.has('v') ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      }
      if (
        url.pathname.startsWith('/api/') &&
        (url.pathname === '/api/v1/status' || url.pathname === '/api/v1/events'
          ? limited(req, 'light', 120)
          : limited(req, 'search', 30))
      ) {
        return problem(res, 429, 'rate-limited', 'too many requests');
      }
      if (read && url.pathname === '/api/v1/status') {
        const g = await livePrice();
        return send(res, 200, {
          gold_price: g,
          snapshot: snapshotInfo(snap),
          snapshot_age_h: (Date.now() - Date.parse(snap.meta.finished_at)) / 3_600_000,
          gold_price_age_min: g ? (Date.now() - Date.parse(g.quoted_at)) / 60_000 : null,
        });
      }
      if (req.method !== 'POST') return problem(res, 404, 'not-found', url.pathname);
      const body = await readJson(req);
      if (!body) return problem(res, 422, 'invalid-request', 'body is not JSON');

      if (url.pathname === '/api/v1/parse') {
        if (typeof body.text !== 'string' || body.text.length > 300) {
          return problem(res, 422, 'invalid-request', 'text: max 300 characters');
        }
        return send(res, 200, await parse(body.text, body.answers ?? {}));
      }
      if (url.pathname === '/api/v1/events') {
        const line = JSON.stringify({
          ...body,
          pipeline_version: snap.meta.pipeline_version,
        }); // BR-111: the client sends no personal data
        if (eventsFile === null) log(line);
        else {
          mkdirSync(dirname(eventsFile), { recursive: true });
          appendFileSync(eventsFile, line + '\n');
        }
        return send(res, 202, {});
      }
      if (!validChips(body.chips)) {
        return problem(res, 422, 'invalid-request', 'chips: array required');
      }
      if (body.snapshot_id && body.snapshot_id !== snap.meta.run_id) {
        return problem(res, 410, 'snapshot-expired', String(body.snapshot_id));
      }
      const { info, g, ctx } = await ctxFor();

      if (url.pathname === '/api/v1/search') {
        const r = search(snap.products, body.chips, ctx);
        const mode = body.chips.some((c: Chip) => c.kind === 'form')
          ? body.chips.some((c: Chip) => c.kind === 'item_type')
            ? 'both'
            : 'non_jewelry'
          : 'jewelry';
        const json = (list: Card[]) => list.map((c) => cardJson(c, byId.get(c.id)!, g));
        const results = mode === 'non_jewelry' ? [] : json(r.results);
        const premiums = results
          .map((c) =>
            c.offer.breakdown?.partial_reason
              ? null
              : (c.offer.breakdown?.premium_pct ?? null),
          )
          .filter((x): x is number => x !== null);
        const savings =
          r.intent === 'savings' || mode !== 'jewelry'
            ? {
                notice: mode === 'jewelry' ? null : 'non_jewelry_not_ranked',
                rows: [
                  {
                    form: 'jewelry',
                    round_trip_cost_pct: median(premiums),
                    source: 'این نتایج',
                    source_url: null,
                    url: null,
                    as_of: info.finished_at.slice(0, 10),
                    own_product: false,
                  },
                  ...SAVINGS_ROWS,
                ],
              }
            : null;
        return send(res, 200, {
          query_id: randomUUID(),
          snapshot: info,
          gold_price: g,
          intent: r.intent,
          suggest_intent: r.intent === 'unknown',
          mode,
          results,
          review: json(r.review),
          weight_unknown_bucket: json(r.weight_unknown_bucket),
          ojrat_unknown: json(r.ojrat_unknown),
          sponsored: json(r.sponsored),
          excluded_count: r.excluded_count,
          explanation: mode === 'non_jewelry' ? null : r.explanation,
          savings_card: savings,
          relax: r.relax,
        });
      }
      if (url.pathname === '/api/v1/excluded') {
        const items = excludedFor(snap.products, body.chips, ctx).map((p) => ({
          id: p.id,
          title: p.title,
          price: p.offers[0]?.price ?? null,
          shop: p.offers[0]?.shop ?? null,
          reasons: p.reasons,
        }));
        return send(res, 200, { total: items.length, items: items.slice(0, 50) });
      }
      const m = url.pathname.match(/^\/api\/v1\/products\/([\w-]+)$/);
      if (m) {
        const p = byId.get(m[1]!);
        const r =
          p &&
          search(
            [p],
            body.chips.filter((c: Chip) => c.level === 'offer'),
            ctx,
          );
        const c =
          r &&
          [
            ...r.results,
            ...r.review,
            ...r.weight_unknown_bucket,
            ...r.ojrat_unknown,
            ...r.sponsored,
          ][0];
        if (!p || !c) return problem(res, 404, 'not-found', m[1]!);
        const offers = eligibleOffers(
          p.offers,
          {},
          ctx.finishedAt,
          ctx.archive,
        ) as ProductRecord['offers'];
        return send(res, 200, {
          ...cardJson(c, p, g),
          offers: offers.map(({ g_at_fetch: _g, ...o }) => ({
            ...o,
            stale: isStale(o, ctx.finishedAt, ctx.archive),
            ...breakdownFor(p, { ...o, g_at_fetch: _g }, g),
          })),
          history: [],
          shop_avg: [],
        });
      }
      return problem(res, 404, 'not-found', url.pathname);
    } catch (err) {
      console.error(err);
      return problem(res, 500, 'internal', 'unexpected error');
    }
  };
}

// A container host (Hamravesh, ADR-0012) sets these through the environment; local runs may pass the path and port as arguments.
if (import.meta.main) {
  const env = readEnv();
  const path =
    process.argv[2] ?? env.snapshotPath ?? join(ROOT, 'data/snapshots/latest.sqlite');
  const port = Number(process.argv[3] ?? env.port);
  const key = env.avalaiKey;
  const model = env.avalaiModel ?? config.llm.model;
  createApp(path, {
    llm: key ? avalai(key, model) : null,
    eventsFile: env.eventsFile,
    trustProxy: env.trustProxy,
    webDir: env.webDir,
  }).listen(port, () =>
    console.log(
      `demo: http://localhost:${port} (AI sentence reading: ${key ? model : 'off, no AVALAI_API_KEY'})`,
    ),
  );
}

export { createApp, createHandler };
