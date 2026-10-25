// The API shapes the page reads (docs/engineering/api-contract.md); only the fields it uses.
export type Label = 'real' | 'mixed' | 'not_gold' | 'review';

export type Chip = {
  kind: string;
  value: string | number | boolean;
  role: 'filter' | 'sort' | 'filter_and_sort' | 'info';
  level: 'product' | 'offer';
  origin: 'user' | 'parsed';
  llm?: true;
};

export type ParseResponse = {
  chips: Chip[];
  unparsed: string | null;
  ask: unknown;
  llm_used: boolean;
};

export type Breakdown = {
  gold_value: number;
  premium_pct: number;
  parts: { gold: number; ojrat: number; profit: number; vat: number } | null;
  no_split_reason: 'below_gold_value' | 'thin_margin' | null;
  partial_reason: 'non_gold_parts' | null;
  resale_value: number;
  resale_loss_pct: number;
  breakeven_g: number;
  required_rise_pct: number;
  inputs: {
    weight_g: number;
    karat: number;
    karat_assumed: boolean;
    g_at_fetch: number;
    g_live: number | null;
    profit: number;
    vat: number;
  };
};

export type Offer = {
  shop: string | null;
  city: string | null;
  channel: 'online' | 'in_person';
  price: number;
  url: string;
  fetched_at: string;
  stale: boolean;
  torob_pay: boolean;
  breakdown: Breakdown | null;
  no_breakdown_reason: 'weight_unknown' | 'no_gold_quote' | null;
};

export type ResultCard = {
  id: string;
  title: string;
  image_url: string | null;
  label: Label;
  reasons: string[];
  weight_g: number | null;
  offer: Offer;
  offer_count: number;
};

export type SearchResponse = {
  query_id: string;
  snapshot: { id: string; archive_mode: boolean };
  intent: string;
  suggest_intent: boolean;
  mode: 'jewelry' | 'non_jewelry' | 'both';
  results: ResultCard[];
  review: ResultCard[];
  weight_unknown_bucket: ResultCard[];
  ojrat_unknown: ResultCard[];
  sponsored: ResultCard[];
  excluded_count: number;
  explanation: { text: string } | null;
  savings_card: {
    notice: string | null;
    rows: {
      form: string;
      round_trip_cost_pct: number | null;
      source: string;
      source_url: string | null;
      own_product: boolean;
    }[];
  } | null;
  relax: { chip_index: number; kind: string; results_if_removed: number } | null;
};

export type ProductResponse = ResultCard & { offers: Offer[] };

export type StatusResponse = {
  gold_price: {
    g_toman: number;
    source: 'union' | 'tgju';
    quoted_at: string;
    uncertain: boolean;
    market_open: boolean;
  } | null;
  snapshot: { archive_mode: boolean; finished_at: string } | null;
};

export type ErrorCode = number | 'offline';
