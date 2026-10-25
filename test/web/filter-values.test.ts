import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config } from '../../src/core/config.ts';
import { ROLE } from '../../src/shared/chips.ts';
import { FILTER_GROUPS, ITEM_TYPES, SORTS } from '../../src/web/scripts/text.ts';

test('every item type in the filter panel is a value extraction gives products, so no filter can match nothing by design', () => {
  const extracted = new Set(config.extract.itemTypes.map(([, value]) => value));
  for (const t of ITEM_TYPES) {
    assert.ok(extracted.has(t), `«${t}» is not an extracted item type`);
  }
});

test('the filter panel and the sort control only build chip kinds the server knows (API contract §3)', () => {
  const kinds = FILTER_GROUPS.flatMap((g) =>
    g.type === 'range'
      ? ['budget_min', 'budget_max']
      : g.type === 'toggles'
        ? g.options.map(([k]) => k)
        : [g.kind],
  );
  for (const k of [...kinds, ...SORTS.flatMap((s) => (s.chip ? [s.chip[0]] : []))]) {
    assert.ok(k in ROLE, `${k} is not a chip kind`);
  }
  const ojrat = FILTER_GROUPS.find((g) => g.kind === 'ojrat_max');
  assert.ok(ojrat && ojrat.type === 'radio');
  assert.deepEqual(
    ojrat.options.map(([v]) => v),
    [config.parse.ojrat.none, config.parse.ojrat.low],
  );
});
