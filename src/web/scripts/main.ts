import { post } from './api.ts';
import { renderChips } from './chips.ts';
import { $, esc } from './dom.ts';
import { clearResults, run, showError } from './results.ts';
import { closeSheet, openSheet } from './sheet.ts';
import { st, track } from './state.ts';
import { loadStatus } from './status.ts';
import { SAMPLES } from './text.ts';
import { initTheme } from './theme.ts';
import type { ErrorCode, ParseResponse } from './types.ts';

const toPersianDigits = (s: string) => s.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!);

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
    return showError(code as ErrorCode);
  }
  st.text = text;
  st.chips = p.chips;
  st.llm = p.llm_used;
  renderChips();
  // CR-04: say which part of the sentence no rule read, so a missing chip is not a mystery.
  const u = toPersianDigits(p.unparsed ?? '');
  const cut = u.lastIndexOf(' ', 70);
  $('unread').hidden = !u;
  $('unread').textContent = u
    ? `متوجه نشدم: «${u.length > 70 ? u.slice(0, cut > 0 ? cut : 70) : u}». اگر مهم است، ساده‌تر بنویسید.`
    : '';
  $('ask').hidden = !p.ask;
  $('ask').innerHTML = p.ask
    ? `منظورتان هزار تومان است یا میلیون؟ <button data-unit="thousand">هزار تومان</button><button data-unit="million">میلیون تومان</button>`
    : '';
  if (p.ask) return clearResults();
  await run();
}

async function toggleExcluded() {
  const x = await post<{ items: { title: string; reasons?: string[] }[] }>('/excluded', {
    chips: st.chips,
    snapshot_id: st.last?.snapshot.id,
  });
  $('excluded').innerHTML =
    `<div class="section-title">کنار گذاشته‌ها</div>` +
    x.items
      .map(
        (i) =>
          `<div class="meta">«${esc(i.title)}»، ${esc((i.reasons ?? []).join('، '))}</div>`,
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
  if (d.unit) {
    st.answers = { budget_unit: d.unit as 'thousand' | 'million' };
    track('chip_edited', { kind: 'budget_max', action: 'answer', origin_before: 'none' });
    return parse();
  }
  if (d.intent) {
    st.chips = st.chips
      .filter((c) => c.kind !== 'intent')
      .concat({
        kind: 'intent',
        role: 'filter_and_sort',
        level: 'product',
        value: d.intent,
        origin: 'user',
      });
    track('intent_suggestion_used', { intent: d.intent });
    renderChips();
    return run();
  }
  if (d.rm !== undefined) {
    const [c] = st.chips.splice(Number(d.rm), 1);
    track('chip_edited', { kind: c?.kind, action: 'remove', origin_before: c?.origin });
    renderChips();
    return run();
  }
  if (d.relax !== undefined) {
    st.chips.splice(Number(d.relax), 1);
    renderChips();
    return run();
  }
  if (t.id === 'showEx') return toggleExcluded();
  if (t.closest('#go-search')) {
    clearTimeout(timer);
    return parse();
  }
  const card = t.closest<HTMLElement>('.card');
  if (card?.dataset.id) return openSheet(card.dataset.id);
}

let timer: ReturnType<typeof setTimeout> | undefined;
$('samples').innerHTML = SAMPLES.map(
  (s) => `<button data-sample="${esc(s)}">${esc(s)}</button>`,
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
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (e.key === 'Escape') closeSheet();
  if (e.key === 'Enter' && t.classList?.contains('card')) t.click();
});
$('bg').addEventListener('click', closeSheet);
initTheme();
void loadStatus();
