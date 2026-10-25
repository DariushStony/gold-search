import {
  formatNumber,
  formatPct,
  formatTehranTime,
  formatToman,
  formatWeight,
} from '../../shared/format.ts';

// The server and the page format numbers and times the same way (content guide §2).
const toman = (n: number, full = false) => formatToman(n, { full });
const pct = formatPct;
const gram = formatWeight;
const count = formatNumber;
const when = (iso: string) => formatTehranTime(iso, new Date());

export { toman, pct, gram, count, when };
