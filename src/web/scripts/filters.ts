import { ROLE, type Chip, type ChipKind } from '../../shared/chips.ts';
import { $, esc } from './dom.ts';
import { count } from './fmt.ts';
import { closeOverlay, isOpen, openOverlay } from './overlay.ts';
import { st, track, userChip } from './state.ts';
import { FILTER_GROUPS, type Group } from './text.ts';

// The filter panel edits the same chips the sentence made. Changes apply at once; on a phone the panel is a
// sheet whose footer shows the real result count of the last search.
const desktop = matchMedia('(min-width: 1024px)');
const of = (kind: ChipKind) => st.chips.filter((c) => c.kind === kind);
const isKind = (k: string | undefined): k is ChipKind => k !== undefined && k in ROLE;
const isFilter = (c: Chip) => c.role === 'filter' || c.role === 'filter_and_sort';
const toPersian = (n: number) => count(n).replace(/٬/g, '');
const fromPersian = (s: string) =>
  Number(
    s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٫,]/g, '.'),
  );

function setOnly(kind: ChipKind, value: Chip['value'] | null) {
  st.chips = st.chips.filter((c) => c.kind !== kind);
  if (value !== null) st.chips.push(userChip(kind, value));
}
function toggle(kind: ChipKind, value: Chip['value'], on: boolean) {
  st.chips = st.chips.filter((c) => !(c.kind === kind && c.value === value));
  if (on) st.chips.push(userChip(kind, value));
}

const opt = (
  type: 'radio' | 'checkbox',
  name: string,
  key: string,
  value: string,
  label: string,
  checked: boolean,
  data: string,
) =>
  `<label class="opt"><input type="${type}" name="${name}" value="${esc(value)}" data-key="${esc(key)}" ${data}${checked ? ' checked' : ''}>${label}</label>`;

function group(g: Group): string {
  if (g.type === 'radio') {
    const now = of(g.kind)[0]?.value;
    const opts = [
      opt(
        'radio',
        `f-${g.kind}`,
        `${g.kind}:`,
        '',
        'همه',
        now === undefined,
        `data-radio="${g.kind}"`,
      ),
    ];
    for (const [v, label] of g.options) {
      opts.push(
        opt(
          'radio',
          `f-${g.kind}`,
          `${g.kind}:${v}`,
          String(v),
          label,
          now === v,
          `data-radio="${g.kind}"`,
        ),
      );
    }
    return `<fieldset class="fgroup"><legend>${g.title}</legend><div class="opts">${opts.join('')}</div></fieldset>`;
  }
  if (g.type === 'check') {
    const on = new Set(of(g.kind).map((c) => c.value));
    const opts = g.options.map(([v, label]) =>
      opt(
        'checkbox',
        `f-${g.kind}`,
        `${g.kind}:${v}`,
        v,
        label,
        on.has(v),
        `data-check="${g.kind}"`,
      ),
    );
    return `<fieldset class="fgroup"><legend>${g.title}</legend><div class="opts">${opts.join('')}</div></fieldset>`;
  }
  if (g.type === 'toggles') {
    const opts = g.options.map(([kind, label]) =>
      opt(
        'checkbox',
        `f-${kind}`,
        `flag:${kind}`,
        'true',
        label,
        of(kind)[0]?.value === true,
        `data-flag="${kind}"`,
      ),
    );
    return `<fieldset class="fgroup"><legend>${g.title}</legend><div class="opts">${opts.join('')}</div></fieldset>`;
  }
  const million = (kind: ChipKind) => {
    const v = of(kind)[0]?.value;
    return typeof v === 'number' ? toPersian(Math.round((v / 1e6) * 10) / 10) : '';
  };
  const target = of('budget_target')[0]?.value;
  return `<fieldset class="fgroup"><legend>${g.title} <small class="fine">(میلیون تومان)</small></legend>
    ${typeof target === 'number' ? `<p class="hint num">از جمله‌ی شما: حدود ${toPersian(target / 1e6)} میلیون تومان</p>` : ''}
    <div class="range"><label for="f-min">از</label><input id="f-min" inputmode="decimal" autocomplete="off" data-key="range:min" data-range="budget_min" value="${million('budget_min')}">
    <label for="f-max">تا</label><input id="f-max" inputmode="decimal" autocomplete="off" data-key="range:max" data-range="budget_max" value="${million('budget_max')}"></div></fieldset>`;
}

function renderFilters() {
  const el = $('filters');
  const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.key;
  const active = st.chips.filter(isFilter).length;
  const results = st.last ? st.last.results.length : null;
  el.innerHTML = `<div class="filters-head"><h2 id="filters-title">فیلترها</h2>
      <button class="link" type="button" data-clear-filters${active ? '' : ' disabled'}>حذف فیلترها</button>
      <button class="close" type="button" data-close aria-label="بستن فیلترها">×</button></div>
    <div class="filters-body">${FILTER_GROUPS.map(group).join('')}</div>
    <div class="filters-foot"><button class="primary num" type="button" data-close>${results === null ? 'بستن' : `دیدن ${count(results)} نتیجه`}</button></div>`;
  const badge = $('filter-count');
  badge.hidden = active === 0;
  badge.textContent = count(active);
  $('open-filters').setAttribute(
    'aria-label',
    active ? `فیلترها، ${count(active)} فیلتر فعال` : 'فیلترها',
  );
  if (focusKey) {
    el.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
  }
}

function initFilters(onChange: () => void) {
  const el = $('filters');
  el.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    const d = t.dataset;
    if (isKind(d.radio)) {
      const raw = t.value;
      setOnly(
        d.radio,
        raw === ''
          ? null
          : d.radio === 'karat' || d.radio === 'ojrat_max'
            ? Number(raw)
            : raw,
      );
    } else if (isKind(d.check)) toggle(d.check, t.value, t.checked);
    else if (isKind(d.flag)) toggle(d.flag, true, t.checked);
    else if (isKind(d.range)) {
      const n = fromPersian(t.value.trim());
      setOnly(
        d.range,
        t.value.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 1e6) : null,
      );
    } else return;
    track('chip_edited', {
      kind: d.radio ?? d.check ?? d.flag ?? d.range,
      action: 'filter',
      origin_before: 'none',
    });
    onChange();
  });
  el.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('[data-clear-filters]')) return;
    st.chips = st.chips.filter((c) => !isFilter(c));
    onChange();
  });
  $('open-filters').addEventListener('click', () => {
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    openOverlay(el, {
      keepNode: true,
      opener: $('open-filters'),
      onClose: () => {
        el.removeAttribute('role');
        el.removeAttribute('aria-modal');
      },
    });
  });
  // a sheet left open while the window grows into the desktop layout becomes the sidebar again
  desktop.addEventListener('change', () => {
    if (desktop.matches && isOpen(el)) closeOverlay();
  });
}

export { renderFilters, initFilters };
