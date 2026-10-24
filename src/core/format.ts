// Display formats of BR-49 and content guide §2: Persian digits, «٬» grouping,
// «٫» decimal, half-up rounding, Jalali dates in Tehran time.
const TZ = "Asia/Tehran";
const fixed = (digits: number) => new Intl.NumberFormat("fa-IR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const whole = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const upTo3 = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 3 });

export function formatToman(toman: number, opts: { full?: boolean } = {}): string {
  if (opts.full) return `${whole.format(toman)} تومان`;
  if (Math.abs(toman) >= 1_000_000) return `${fixed(1).format(toman / 1_000_000)} میلیون تومان`;
  return `${whole.format(toman / 1000)} هزار تومان`;
}

export const formatPct = (pct: number): string => `٪${fixed(1).format(pct)}`;

export const formatWeight = (grams: number): string => `${upTo3.format(grams)} گرم`;

export function jalaliYear(date: Date): number {
  const year = new Intl.DateTimeFormat("en-u-ca-persian", { timeZone: TZ, year: "numeric" })
    .formatToParts(date).find((p) => p.type === "year")?.value;
  return Number(year);
}

const persianParts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  timeZone: TZ, year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function formatTehranTime(iso: string, now: Date): string {
  const date = new Date(iso);
  const part = (type: Intl.DateTimeFormatPartTypes) => persianParts.formatToParts(date).find((p) => p.type === type)?.value ?? "";
  const day = jalaliYear(date) === jalaliYear(now) ? `${part("day")} ${part("month")}` : `${part("day")} ${part("month")} ${part("year")}`;
  return `${day}، ${part("hour")}:${part("minute")}`;
}
