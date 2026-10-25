// EV-EXT: weight and karat extraction (BR-20–BR-28). Ground truth in one file:
// the independent annotator (tune) and the owner's audit of it (test, D-20).
// Run: node eval/ev-ext.ts [--split=test --release] [--show]
import { existsSync } from 'node:fs';
import { extract, specsFromDetails } from '../src/domains/catalog/extract.ts';
import { details, pct, readCsv, ROOT, splitFromArgs, wilson } from './lib.ts';

const split = splitFromArgs();
const truthFile = `${ROOT}docs/evidence/ev-ext-labels-2026-10-24.csv`;
if (!existsSync(truthFile)) throw new Error(`missing ground truth: ${truthFile}`);
const truth = new Map(
  readCsv(truthFile)
    .filter((r) => r.split === split)
    .map((r) => [r.random_key!, r]),
);
const material = readCsv(`${ROOT}docs/evidence/ev-mat-labels-2026-10-22.csv`).filter(
  (r) => r.split === split,
);

let wTruth = 0,
  wHit = 0,
  wGiven = 0,
  wWrongGiven = 0,
  kTruth = 0,
  kHit = 0,
  goldRows = 0,
  goldWithWeight = 0;
const misses: string[] = [];
for (const m of material) {
  const t = truth.get(m.random_key!);
  if (!t) continue;
  const d = details(m.random_key!);
  const a = extract({
    title: m.title!,
    specs: d ? specsFromDetails(d.body) : {},
    shop: m.shop!.replace(/^در /, ''),
  });
  const sw = a.weight_g?.value ?? null;
  const tw = t.weight_g && t.score_weight !== 'no' ? Number(t.weight_g) : null; // "no": disputed in the owner's audit
  // A weight the annotator marked "unit?" is a seller's unit mistake: reading it as written, or refusing it (BR-22), are both right.
  const unitDoubt = (t.weight_note ?? '').includes('unit?');
  if (tw !== null) {
    wTruth++;
    if ((sw !== null && Math.abs(sw - tw) <= 0.005) || (unitDoubt && sw === null)) wHit++;
    else {
      misses.push(
        `${m.row} weight truth=${tw} got=${sw ?? '-'} | ${m.title} | ${t.evidence}`,
      );
    }
  }
  if (sw !== null && t.score_weight !== 'no') {
    wGiven++;
    if (tw === null || Math.abs(sw - tw) > 0.005) wWrongGiven++;
  }
  if (t.karat) {
    kTruth++;
    if (a.karat?.value === Number(t.karat)) kHit++;
    else {
      misses.push(
        `${m.row} karat truth=${t.karat} got=${a.karat?.value ?? '-'} | ${m.title}`,
      );
    }
  }
  if (m.label === 'gold') {
    goldRows++;
    if (sw !== null) goldWithWeight++;
  }
}

const ci = (k: number, n: number) => wilson(k, n).map(pct);
console.log(
  JSON.stringify(
    {
      split,
      extraction_accuracy: {
        value: pct((100 * (wHit + kHit)) / (wTruth + kTruth)),
        ci95: ci(wHit + kHit, wTruth + kTruth),
        n: wTruth + kTruth,
        target: '≥ 95',
      },
      weight_recall: {
        value: pct((100 * wHit) / wTruth),
        ci95: ci(wHit, wTruth),
        n: wTruth,
        target: '≥ 95',
      },
      weight_precision: {
        value: pct((100 * (wGiven - wWrongGiven)) / wGiven),
        n: wGiven,
      },
      karat_accuracy: {
        value: pct((100 * kHit) / kTruth),
        ci95: ci(kHit, kTruth),
        n: kTruth,
      },
      weight_coverage_of_gold: {
        value: pct((100 * goldWithWeight) / goldRows),
        ci95: ci(goldWithWeight, goldRows),
        n: goldRows,
        target: 'report only',
      },
    },
    null,
    1,
  ),
);
if (process.argv.includes('--show') && split === 'tune') console.log(misses.join('\n'));
