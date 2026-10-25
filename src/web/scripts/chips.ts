import { SORT_KINDS, type Chip } from '../../shared/chips.ts';
import { $, esc } from './dom.ts';
import { count, gram, pct, toman } from './fmt.ts';
import { st } from './state.ts';
import { KIND, VAL } from './text.ts';

// A sort the user picked shows in the sort control, not as a chip; a sort read from the sentence shows in both.
const shownInSortOnly = (c: Chip) =>
  c.origin === 'user' && (SORT_KINDS as readonly string[]).includes(c.kind);

function chipValue(c: Chip): string {
  if (typeof c.value === 'boolean') return '';
  if (c.kind.startsWith('budget')) return toman(Number(c.value));
  if (/^weight_(min|max|target)$/.test(c.kind)) return gram(Number(c.value));
  if (c.kind === 'ojrat_max') return pct(Number(c.value));
  if (typeof c.value === 'number') return count(c.value);
  return VAL[c.value] ?? String(c.value).replaceAll('_', ' ');
}

const source = (c: Chip) =>
  c.origin === 'user' ? 'انتخاب شما' : c.llm ? 'از جمله‌ی شما، با AI' : 'از جمله‌ی شما';

function renderChips() {
  const shown = st.chips.map((c, i) => ({ c, i })).filter(({ c }) => !shownInSortOnly(c));
  $('chips').innerHTML =
    shown
      .map(({ c, i }) => {
        const role = c.role === 'sort' ? 'sort' : c.role === 'info' ? 'info' : '';
        const value = chipValue(c);
        const name = `${KIND[c.kind] ?? c.kind}${value ? ': ' + esc(value) : ''}`;
        return `<span class="chip ${role}">${name} <small>${source(c)}</small><button type="button" aria-label="حذف ${name}" data-rm="${i}">×</button></span>`;
      })
      .join('') +
    (shown.length >= 2
      ? `<button class="chip-clear" type="button" data-clear-chips>حذف همه</button>`
      : '');
}

export { renderChips };
