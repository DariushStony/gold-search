import { $, esc } from './dom.ts';
import { gram, pct, toman } from './fmt.ts';
import { st } from './state.ts';
import { KIND, VAL } from './text.ts';
import type { Chip } from './types.ts';

function chipValue(c: Chip): string {
  if (typeof c.value === 'boolean') return '';
  if (c.kind.startsWith('budget')) return toman(Number(c.value));
  if (/^weight_(min|max|target)$/.test(c.kind)) return gram(Number(c.value));
  if (c.kind === 'ojrat_max') return pct(Number(c.value));
  return VAL[c.value] ?? String(c.value).replaceAll('_', ' ');
}

const source = (c: Chip) =>
  c.origin === 'user' ? 'انتخاب شما' : c.llm ? 'از جمله‌ی شما، با AI' : 'از جمله‌ی شما';

export function renderChips() {
  $('chips').innerHTML = st.chips
    .map((c, i) => {
      const role = c.role === 'sort' ? 'sort' : c.role === 'info' ? 'info' : '';
      const value = chipValue(c);
      return `<span class="chip ${role}">${KIND[c.kind]}${value ? ': ' + esc(value) : ''}
        <small>${source(c)}</small><button aria-label="حذف ${KIND[c.kind]}" data-rm="${i}">×</button></span>`;
    })
    .join('');
}
