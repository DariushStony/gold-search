import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { collectOnce, nextSlot, type Served } from '../../src/app/collector.ts';
import { loadSnapshot } from '../../src/domains/catalog/snapshot.ts';
import { buildSnapshot } from '../../src/domains/collection/build-snapshot.ts';

const line = (o: object) => JSON.stringify(o) + '\n';
// One finished run with the given cards, as the collector writes it.
function writeRun(rawDir: string, runId: string, cards: [string, number][]) {
  const day = join(rawDir, runId.slice(0, 10));
  mkdirSync(day, { recursive: true });
  const at = new Date(Date.parse(runId) + 60_000).toISOString();
  writeFileSync(
    join(day, 'torob-search.jsonl'),
    line({
      run_id: runId,
      q: 'النگو طلا',
      page: 0,
      fetched_at: at,
      results: cards.map(([key, price]) => ({
        random_key: key,
        name1: `النگو طلا ۱۸ عیار ${key}`,
        name2: '',
        price,
        shop_text: 'در فرنیا گلد',
        web_client_absolute_url: `/p/${key}/x/`,
        image_url: null,
        is_adv: false,
      })),
    }),
  );
  writeFileSync(
    join(day, 'gold-price.jsonl'),
    line({
      run_id: runId,
      source: 'https://call1.tgju.org/ajax.json',
      unit: 'rial',
      fetched_at: runId,
      prices: { geram18: { p: '270,170,000', ts: '2026-10-23 10:20:00' } },
    }),
  );
  writeFileSync(
    join(day, 'runs.jsonl'),
    line({
      run_id: runId,
      step: 'summary',
      started_at: runId,
      finished_at: new Date(Date.parse(runId) + 600_000).toISOString(),
      requests: 3,
      results: cards.length,
      details_fetched: 0,
      stopped: null,
    }),
  );
}

function setup() {
  const base = mkdtempSync(join(tmpdir(), 'served-'));
  writeRun(join(base, 'raw'), '2026-10-23T06:45:00.000Z', [
    ['a', 40_000_000],
    ['b', 50_000_000],
  ]);
  const path = join(base, 'snapshot.sqlite');
  buildSnapshot({ rawDir: join(base, 'raw'), outPath: path });
  let served: Served = { path, snapshot: loadSnapshot(path) };
  const swaps: Served[] = [];
  return {
    workDir: mkdtempSync(join(tmpdir(), 'work-')),
    served: () => served,
    serve: (next: Served) => {
      served = next;
      swaps.push(next);
    },
    swaps,
  };
}

test('ADR-0013: runs at 10:15 and 18:15 Tehran time', () => {
  // 09:30 Tehran → 10:15 the same day; 10:30 → 18:15; 18:30 → 10:15 the next day
  assert.equal(
    nextSlot(new Date('2026-10-25T06:00:00Z')).toISOString(),
    '2026-10-25T06:45:00.000Z',
  );
  assert.equal(
    nextSlot(new Date('2026-10-25T07:00:00Z')).toISOString(),
    '2026-10-25T14:45:00.000Z',
  );
  assert.equal(
    nextSlot(new Date('2026-10-25T15:00:00Z')).toISOString(),
    '2026-10-26T06:45:00.000Z',
  );
  assert.equal(
    nextSlot(new Date('2026-10-25T20:40:00Z')).toISOString(),
    '2026-10-26T06:45:00.000Z',
  ); // after midnight Tehran
});

test('ADR-0013: a sound run is merged into the served snapshot and swapped in; its raw files are removed', async () => {
  const s = setup();
  let rawDir = '';
  const r = await collectOnce({
    ...s,
    now: () => new Date('2026-10-24T06:45:00.000Z'),
    collect: async (dir, runId) => {
      rawDir = dir;
      writeRun(dir, runId, [
        ['a', 39_000_000],
        ['c', 70_000_000],
      ]);
      return { requests: 3, results: 2, details_fetched: 0, stopped: null };
    },
  });
  assert.equal(r.swapped, true, r.reason ?? '');
  assert.equal(r.products, 3); // b was not seen again and is kept
  assert.equal(s.swaps.length, 1);
  assert.equal(s.served().snapshot.meta.run_id, '2026-10-24T06:45:00.000Z');
  assert.ok(s.served().path.startsWith(s.workDir));
  assert.equal(existsSync(rawDir), false);
});

test('ADR-0013: a run that read no search page builds nothing and keeps the served snapshot', async () => {
  const s = setup();
  const before = s.served();
  const r = await collectOnce({
    ...s,
    collect: async () => ({
      requests: 1,
      results: 0,
      details_fetched: 0,
      stopped: 'challenged at q="x" page=0',
    }),
  });
  assert.equal(r.swapped, false);
  assert.match(r.reason ?? '', /no search results \(challenged/);
  assert.equal(s.served(), before);
  assert.deepEqual(readdirSync(s.workDir), []);
});

test('ADR-0013: a snapshot that lost too many products, or a failed build, is not swapped in', async () => {
  const s = setup();
  const real = s.served();
  const big = {
    ...real,
    snapshot: { ...real.snapshot, products: Array(100).fill(real.snapshot.products[0]!) },
  };
  const shrunk = await collectOnce({
    ...s,
    served: () => big,
    collect: async (dir, runId) => {
      writeRun(dir, runId, [['a', 39_000_000]]);
      return { requests: 3, results: 1, details_fetched: 0, stopped: null };
    },
  });
  assert.equal(shrunk.swapped, false);
  assert.match(shrunk.reason ?? '', /kept \d+% of the products/);
  const failed = await collectOnce({
    ...s,
    collect: async () => {
      throw new Error('disk full');
    },
  });
  assert.equal(failed.swapped, false);
  assert.match(failed.reason ?? '', /disk full/);
  assert.equal(s.swaps.length, 0);
});
