import { initTheme } from './theme.ts';

// The Atlas sidebar and table of contents are disclosures: open on a wide screen, folded on a phone so the
// document comes first.
const wide = matchMedia('(min-width: 1024px)');
function fit() {
  for (const d of document.querySelectorAll<HTMLDetailsElement>(
    'details[data-open-wide]',
  )) {
    d.open = wide.matches;
  }
}

initTheme();
fit();
wide.addEventListener('change', fit);
