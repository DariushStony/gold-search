import { config } from '../../core/config.ts';
import { normalize } from '../../shared/text.ts';

type OfferRow = {
  id: string;
  product_id: string;
  source: 'torob_search' | 'torob_details';
  shop: string | null; // null: a card that names no shop and matched no details offer (DM-08)
  city: string | null;
  channel: 'online' | 'in_person';
  title: string;
  price: number;
  url: string;
  torob_pay: boolean;
  price_unreliable: boolean;
  shop_stars: number | null; // Torob's star score, only for shops it has scored (CR-09)
  shop_months: number | null; // time on Torob; 0 for «فروشگاه جدید»
  fetched_at: string;
};

type OfferFilters = {
  shop?: string;
  city?: string;
  in_person?: boolean;
  torob_pay?: boolean;
};

const ageHours = (o: OfferRow, finishedAt: string) =>
  (Date.parse(finishedAt) - Date.parse(o.fetched_at)) / 3_600_000;
const same = (a: string | null, b: string | null) =>
  a !== null && b !== null && normalize(a) === normalize(b);

const isStale = (o: OfferRow, finishedAt: string, archive: boolean) =>
  !archive && ageHours(o, finishedAt) > config.offers.staleHours; // BR-14

// BR-84: offers that may represent the product under the given filters, cheapest first, newer first on ties.
function eligibleOffers(
  offers: OfferRow[],
  f: OfferFilters,
  finishedAt: string,
  archive: boolean,
): OfferRow[] {
  return offers
    .filter((o) => !o.price_unreliable && o.price > 0)
    .filter((o) => archive || ageHours(o, finishedAt) <= config.offers.maxAgeDays * 24)
    .filter((o) => !f.shop || same(o.shop, f.shop))
    .filter((o) => !f.city || same(o.city, f.city))
    .filter((o) => !f.in_person || o.channel === 'in_person')
    .filter((o) => !f.torob_pay || o.torob_pay)
    .sort(
      (a, b) => a.price - b.price || Date.parse(b.fetched_at) - Date.parse(a.fetched_at),
    );
}

// DM-08: fold the latest search card into the details offers.
function mergeCard(card: OfferRow, details: OfferRow[]): OfferRow[] {
  const i =
    card.shop !== null
      ? details.findIndex((d) => same(d.shop, card.shop))
      : details.findIndex((d) => d.channel === 'online' && d.price === card.price);
  if (i < 0) return [...details, card];
  const d = details[i]!;
  const cardNewer = Date.parse(card.fetched_at) > Date.parse(d.fetched_at);
  const merged = cardNewer ? { ...d, price: card.price, fetched_at: card.fetched_at } : d;
  return details.map((x, j) => (j === i ? merged : x));
}

export { isStale, eligibleOffers, mergeCard, type OfferRow, type OfferFilters };
