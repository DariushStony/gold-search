// One overlay model for the details panel, the sort sheet and the filter sheet: the rest of the page becomes
// inert (so focus and screen readers stay inside), the page stops scrolling, Escape or the scrim closes the
// top overlay, and focus returns to the control that opened it.
type Open = {
  el: HTMLElement;
  returnTo: HTMLElement | null;
  onClose?: () => void;
  keepNode: boolean;
};

const stack: Open[] = [];
const scrim = () => document.getElementById('scrim')!;
const regions = () => [...document.querySelectorAll<HTMLElement>('[data-region]')];

function setInert(except: HTMLElement | null) {
  for (const r of regions()) {
    r.inert = except !== null && !r.contains(except) && r !== except;
  }
}

function openOverlay(
  el: HTMLElement,
  opts: { onClose?: () => void; keepNode?: boolean; opener?: HTMLElement | null } = {},
) {
  // the opener is passed in: Safari does not focus a button on click, so activeElement can be the page
  const returnTo =
    opts.opener ??
    (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  stack.push({ el, returnTo, onClose: opts.onClose, keepNode: !!opts.keepNode });
  el.hidden = false;
  scrim().hidden = false;
  document.body.style.overflow = 'hidden';
  setInert(el);
  // read the layout once so the slide-in transition starts from the closed position, then open and focus;
  // no animation frame, so it also works in a background tab
  void el.offsetWidth;
  el.classList.add('open');
  const first =
    el.querySelector<HTMLElement>('[data-autofocus]') ??
    el.querySelector<HTMLElement>('h2, button, input');
  if (first?.tagName === 'H2' && !first.hasAttribute('tabindex')) first.tabIndex = -1;
  first?.focus({ preventScroll: true });
}

function closeOverlay() {
  const top = stack.pop();
  if (!top) return;
  top.el.classList.remove('open');
  if (!top.keepNode) {
    // hide after the slide-out, unless the same overlay was opened again meanwhile
    setTimeout(() => {
      if (!top.el.classList.contains('open')) top.el.hidden = true;
    }, 230);
  }
  const below = stack.at(-1);
  if (below) setInert(below.el);
  else {
    setInert(null);
    scrim().hidden = true;
    document.body.style.overflow = '';
  }
  top.onClose?.();
  top.returnTo?.focus({ preventScroll: true });
}

const isOpen = (el: HTMLElement) => stack.some((o) => o.el === el);

function initOverlays() {
  scrim().addEventListener('click', closeOverlay);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && stack.length) {
      e.preventDefault();
      closeOverlay();
    }
  });
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]') && stack.length) closeOverlay();
  });
}

export { openOverlay, closeOverlay, isOpen, initOverlays };
