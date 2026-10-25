import { errorCode, post } from './api.ts';
import { renderChips } from './chips.ts';
import { $, esc } from './dom.ts';
import { initFilters, renderFilters } from './filters.ts';
import { initOverlays } from './overlay.ts';
import { clearResults, initImages, run, showError } from './results.ts';
import { openSheet } from './sheet.ts';
import { initSort, renderSort } from './sort.ts';
import { st, track, userChip } from './state.ts';
import { loadStatus } from './status.ts';
import { SAMPLES } from './text.ts';
import { initTheme } from './theme.ts';
import type { ParseResponse } from './types.ts';

const toPersianDigits = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);

// Chips are the one model: the sentence, the filter panel, the sort control and the × on a chip all edit
// st.chips, then everything that shows them is drawn again and the search runs.
async function refresh() {
  renderChips();
  renderSort();
  renderFilters();
  await run();
  renderFilters();
}

async function parse() {
  const text = $<HTMLInputElement>('q').value.trim();
  if (!text) {
    st.chips = [];
    renderChips();
    $('unread').hidden = true;
    return;
  }
  let p: ParseResponse;
  try {
    p = await post<ParseResponse>('/parse', { text, answers: st.answers });
  } catch (code) {
    return showError(errorCode(code));
  }
  st.text = text;
  st.chips = p.chips;
  st.llm = p.llm_used;
  st.intentOptions = p.intent_options;
  // CR-04: say which part of the sentence no rule read, so a missing chip is not a mystery.
  const u = toPersianDigits(p.unparsed ?? '');
  const cut = u.lastIndexOf(' ', 70);
  $('unread').hidden = !u;
  $('unread').textContent = u
    ? `متوجه نشدم: «${u.length > 70 ? u.slice(0, cut > 0 ? cut : 70) : u}». اگر مهم است، ساده‌تر بنویسید.`
    : '';
  $('ask').hidden = !p.ask;
  $('ask').innerHTML = p.ask
    ? `منظورتان هزار تومان است یا میلیون؟ <button type="button" data-unit="thousand">هزار تومان</button><button type="button" data-unit="million">میلیون تومان</button>`
    : '';
  if (p.ask) {
    renderChips();
    return clearResults();
  }
  await refresh();
}

async function toggleExcluded() {
  const x = await post<{ items: { title: string; reasons?: string[] }[] }>('/excluded', {
    chips: st.chips,
    snapshot_id: st.last?.snapshot.id,
  });
  $('excluded').innerHTML =
    `<h2 class="section-title">کنار گذاشته‌ها</h2>` +
    x.items
      .map(
        (i) =>
          `<p class="meta">«${esc(i.title)}»، ${esc((i.reasons ?? []).join('، '))}</p>`,
      )
      .join('');
  $('excluded').hidden = !$('excluded').hidden;
}

function onClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  const d = t.dataset ?? {};
  if (d.sample) {
    $<HTMLInputElement>('q').value = d.sample;
    st.answers = {};
    return parse();
  }
  if (d.unit === 'thousand' || d.unit === 'million') {
    st.answers = { budget_unit: d.unit };
    track('chip_edited', { kind: 'budget_max', action: 'answer', origin_before: 'none' });
    return parse();
  }
  if (d.intent) {
    st.chips = st.chips
      .filter((c) => c.kind !== 'intent')
      .concat(userChip('intent', d.intent));
    track('intent_suggestion_used', { intent: d.intent });
    return refresh();
  }
  if (d.rm !== undefined) {
    const [c] = st.chips.splice(Number(d.rm), 1);
    track('chip_edited', { kind: c?.kind, action: 'remove', origin_before: c?.origin });
    return refresh();
  }
  if (t.closest('[data-clear-chips]')) {
    st.chips = [];
    return refresh();
  }
  if (d.relax !== undefined) {
    st.chips.splice(Number(d.relax), 1);
    return refresh();
  }
  if (t.closest('[data-retry]')) return st.chips.length ? refresh() : parse();
  if (t.id === 'showEx') return toggleExcluded();
  if (t.closest('#go-search')) {
    clearTimeout(timer);
    return parse();
  }
  const open = t.closest<HTMLElement>('[data-open]');
  if (open?.dataset.open) return openSheet(open.dataset.open, open);
}

let timer: ReturnType<typeof setTimeout> | undefined;
$('samples').innerHTML = SAMPLES.map(
  (s) => `<button type="button" data-sample="${esc(s)}">${esc(s)}</button>`,
).join('');
$('q').addEventListener('input', () => {
  clearTimeout(timer);
  st.answers = {};
  timer = setTimeout(parse, 450);
});
$('q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(timer);
    void parse();
  }
});
document.addEventListener('click', (e) => void onClick(e));
initTheme();
initOverlays();
initImages();
initSort(() => void refresh());
initFilters(() => void refresh());
renderSort();
renderFilters();
void loadStatus();
