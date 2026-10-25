// The theme switch in the top corner: light, dark, or follow the device. theme-init.ts applies the saved
// choice before the first paint; this keeps the buttons and the browser bar colour in step with it.
type Choice = 'light' | 'dark' | 'system';

const BAR = { light: '#ffffff', dark: '#212b36' };
const media = matchMedia('(prefers-color-scheme: dark)');

const saved = (): Choice => {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
};

function apply(choice: Choice) {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  const shown = choice === 'system' ? (media.matches ? 'dark' : 'light') : choice;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[shown]);
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-theme-set]')) {
    b.setAttribute('aria-pressed', String(b.dataset.themeSet === choice));
  }
}

export function initTheme() {
  apply(saved());
  media.addEventListener('change', () => apply(saved()));
  document.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-theme-set]');
    if (!b) return;
    const choice = b.dataset.themeSet as Choice;
    try {
      if (choice === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', choice);
    } catch {
      // storage blocked: the choice lasts for this page only
    }
    apply(choice);
  });
}
