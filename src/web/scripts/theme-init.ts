// Loaded before the stylesheet paints, so a saved light or dark choice never flashes the other theme.
try {
  const t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch {
  // storage blocked: follow the system setting
}
