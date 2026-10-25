import { SORT_KINDS } from '../../shared/chips.ts';
import { $ } from './dom.ts';
import { closeOverlay, isOpen, openOverlay } from './overlay.ts';
import { st, track, userChip } from './state.ts';
import { SORTS } from './text.ts';

// CR-12: one sort at a time. Inline on desktop; on a phone a short sheet that applies on tap and closes.
const isSort = (kind: string) => (SORT_KINDS as readonly string[]).includes(kind);

function currentSort(): string {
  const c = st.chips.find((x) => isSort(x.kind));
  return (
    SORTS.find((s) => s.chip && s.chip[0] === c?.kind && s.chip[1] === c?.value)?.id ??
    'relevance'
  );
}

function renderSort() {
  const now = currentSort();
  const buttons = SORTS.map(
    (s) =>
      `<button type="button" data-sort="${s.id}" aria-pressed="${s.id === now}">${s.label}</button>`,
  ).join('');
  $('sort-inline').innerHTML = `<span class="label">مرتب‌سازی:</span>${buttons}`;
  $('sort-list').innerHTML = buttons;
  $('sort-label').textContent = SORTS.find((s) => s.id === now)!.label;
}

function initSort(onChange: () => void) {
  $('open-sort').addEventListener('click', () =>
    openOverlay($('sort-sheet'), { opener: $('open-sort') }),
  );
  document.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sort]');
    if (!b) return;
    const pick = SORTS.find((s) => s.id === b.dataset.sort)!;
    st.chips = st.chips.filter((c) => !isSort(c.kind));
    if (pick.chip) st.chips.push(userChip(pick.chip[0], pick.chip[1]));
    track('chip_edited', {
      kind: pick.chip?.[0] ?? 'sort',
      action: 'sort',
      origin_before: 'none',
    });
    if (isOpen($('sort-sheet'))) closeOverlay();
    onChange();
  });
}

export { renderSort, initSort };
