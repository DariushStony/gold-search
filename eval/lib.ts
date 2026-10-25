import { existsSync, readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname;

function readCsv(path: string): Record<string, string>[] {
  const text = readFileSync(path, 'utf8');
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header!.map((h, i) => [h, r[i] ?? ''])));
}

function details(key: string): { body: any; fetched_at: string } | null {
  const path = `${ROOT}data/raw/details/${key}.json`;
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = k / n,
    d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [100 * (c - h), 100 * (c + h)];
}

// Eval plan §2: the test split is scored only on release tags.
function splitFromArgs(): 'tune' | 'test' {
  const split = process.argv.includes('--split=test') ? 'test' : 'tune';
  if (split === 'test' && !process.argv.includes('--release')) {
    throw new Error(
      'The test split is scored only for a release (eval plan §2). Add --release on a release tag.',
    );
  }
  return split;
}

const pct = (x: number) => x.toFixed(1);

// AvalAI's per-model limits differ by account level (gpt-4.1-mini: 500 a minute at level 1); a short gap keeps evals polite.
function throttled<A extends unknown[], R>(fn: (...a: A) => Promise<R>, gapMs = 300) {
  let next = 0;
  return async (...a: A): Promise<R> => {
    const wait = next - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    next = Date.now() + gapMs;
    return fn(...a);
  };
}

export { ROOT, readCsv, details, wilson, splitFromArgs, pct, throttled };
