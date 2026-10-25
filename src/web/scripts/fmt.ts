import {
  formatNumber,
  formatPct,
  formatTehranTime,
  formatToman,
  formatWeight,
} from '../../shared/format.ts';

// The server and the page format numbers and times the same way (content guide §2).
export const toman = (n: number, full = false) => formatToman(n, { full });
export const pct = formatPct;
export const gram = formatWeight;
export const count = formatNumber;
export const when = (iso: string) => formatTehranTime(iso, new Date());
