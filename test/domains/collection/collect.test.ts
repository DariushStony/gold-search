import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  detailsQueue,
  robotsAllows,
  runCollector,
  type Deps,
  type Http,
} from '../../../src/domains/collection/collect.ts';

const ROBOTS = readFileSync(
  new URL('../../../docs/evidence/torob-robots-2026-10-21.txt', import.meta.url),
  'utf8',
).split('## https://api.torob.com/robots.txt')[1]!;

test('BR-10: robots.txt of the day allows search and details and nothing else we use', () => {
  assert.equal(robotsAllows(ROBOTS, '/v4/base-product/search/'), true);
  assert.equal(robotsAllows(ROBOTS, '/v4/base-product/details/'), true);
  assert.equal(robotsAllows(ROBOTS, '/v4/base-product/price-chart/'), false);
  assert.equal(
    robotsAllows(
      'User-agent: *\nDisallow: /v4/base-product/details',
      '/v4/base-product/details/',
    ),
    false,
  );
});

test('AC-DC-08 (BR-17, DM-10): never-fetched products first, then multi-shop by oldest details, then the rest', () => {
  const seen = [
    ...Array.from({ length: 30 }, (_, i) => ({ id: `new${i}`, multiShop: false })),
    ...Array.from({ length: 50 }, (_, i) => ({ id: `multi${i}`, multiShop: true })),
    { id: 'single', multiShop: false },
  ];
  const index = new Map<string, string>([
    ...Array.from(
      { length: 50 },
      (_, i) =>
        [`multi${i}`, new Date(Date.UTC(2026, 9, 1 + (i % 20), i)).toISOString()] as [
          string,
          string,
        ],
    ),
    ['single', '2026-09-01T00:00:00.000Z'],
  ]);
  const q = detailsQueue(seen, index, 40);
  assert.equal(q.length, 40);
  assert.deepEqual(
    q.slice(0, 30),
    Array.from({ length: 30 }, (_, i) => `new${i}`),
  );
  assert.ok(q.slice(30).every((id) => id.startsWith('multi')));
  const ages = q.slice(30).map((id) => index.get(id)!);
  assert.deepEqual(ages, [...ages].sort());
});

type Call = { url: string; method: string };
function fakeDeps(
  script: (
    url: string,
    n: number,
  ) => { status: number; type?: string; body?: unknown } | 'network',
): Deps & { calls: Call[]; events: string[]; rows: Record<string, object[]> } {
  const calls: Call[] = [],
    events: string[] = [],
    rows: Record<string, object[]> = {};
  let torobN = 0,
    t = Date.parse('2026-10-23T06:45:00Z');
  const http: Http = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET' });
    const isTorob = url.includes('api.torob.com/v4');
    if (isTorob) {
      torobN++;
      events.push('torob');
    }
    if (url.endsWith('robots.txt')) {
      return {
        status: 200,
        contentType: 'text/plain',
        json: async () => ({}),
        text: async () => ROBOTS,
      };
    }
    if (!isTorob) {
      return {
        status: 200,
        contentType: 'application/json',
        json: async () => ({}),
        text: async () => '',
      };
    }
    const r = script(url, torobN);
    if (r === 'network') throw new TypeError('fetch failed');
    return {
      status: r.status,
      contentType: r.type ?? 'application/json',
      json: async () => r.body ?? {},
      text: async () => '',
    };
  };
  return {
    http,
    calls,
    events,
    rows,
    sleep: async (ms) => {
      events.push(`sleep:${ms}`);
      t += ms;
    },
    now: () => new Date(t),
    random: () => 0.5,
    write: async (file, row) => {
      (rows[file] ??= []).push(row);
    },
    saveDetails: async () => {},
    detailsIndex: async () => new Map(),
  };
}
const page = (n: number) => ({
  count: 100,
  results: Array.from({ length: n }, (_, i) => ({
    random_key: `k${i}`,
    shop_text: 'در ۲ فروشگاه',
  })),
});

test('AC-DC-03 (BR-12): a 490 on request 3 ends the run after exactly 3 Torob requests', async () => {
  const d = fakeDeps((_url, n) =>
    n === 3 ? { status: 490, type: 'text/html' } : { status: 200, body: page(24) },
  );
  const s = await runCollector(d);
  assert.equal(d.events.filter((e) => e === 'torob').length, 3);
  assert.match(s.stopped ?? '', /^challenged/);
});

test('AC-DC-09 (BR-12): a network error on request 1 ends the run after 1 request, logged as network', async () => {
  const d = fakeDeps(() => 'network');
  const s = await runCollector(d);
  assert.equal(d.events.filter((e) => e === 'torob').length, 1);
  assert.match(s.stopped ?? '', /^network/);
});

test('BR-12: a non-JSON answer ends the run', async () => {
  const d = fakeDeps((_u, n) =>
    n === 2 ? { status: 200, type: 'text/html' } : { status: 200, body: page(24) },
  );
  assert.match((await runCollector(d)).stopped ?? '', /^non_json/);
});

test('AC-DC-02 (BR-11): at least 10 s pass between any two Torob requests', async () => {
  const d = fakeDeps(() => ({ status: 200, body: page(24) }));
  await runCollector(d, { queries: ['دستبند طلا', 'انگشتر طلا'], detailsBudget: 3 });
  let since = Infinity;
  for (const e of d.events) {
    if (e === 'torob') {
      assert.ok(since >= 10_000, `gap ${since} ms`);
      since = 0;
    } else since += Number(e.split(':')[1]);
  }
});

test('AC-DC-01 (BR-10): only allowed Torob paths are requested', async () => {
  const d = fakeDeps(() => ({ status: 200, body: page(24) }));
  await runCollector(d, { queries: ['دستبند طلا'], detailsBudget: 2 });
  for (const call of d.calls.filter((c) => c.url.includes('api.torob.com/v4'))) {
    assert.ok(robotsAllows(ROBOTS, new URL(call.url).pathname), call.url);
  }
});

test('DM-01: gold prices from both sources are fetched before each query and at the end', async () => {
  const d = fakeDeps(() => ({ status: 200, body: page(5) }));
  await runCollector(d, { queries: ['دستبند طلا', 'انگشتر طلا'], detailsBudget: 0 });
  const gold = d.calls.filter((c) => !c.url.includes('torob'));
  assert.equal(gold.filter((c) => c.url.includes('estjt')).length, 3);
  assert.equal(gold.filter((c) => c.url.includes('tgju')).length, 3);
});
