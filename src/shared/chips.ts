// The chip vocabulary shared by the parser, the ranking and the page (API contract §3).

type ChipKind =
  | 'intent'
  | 'item_type'
  | 'form'
  | 'budget_min'
  | 'budget_max'
  | 'budget_target'
  | 'weight_min'
  | 'weight_max'
  | 'weight_target'
  | 'weight_pref'
  | 'karat'
  | 'audience'
  | 'recipient'
  | 'condition'
  | 'ojrat_max'
  | 'ojrat_sort'
  | 'no_stones'
  | 'style'
  | 'shop'
  | 'torob_pay'
  | 'in_person'
  | 'city'
  | 'occasion'
  | 'price_sort'
  | 'premium_sort';
type Chip = {
  kind: ChipKind;
  role: 'filter' | 'filter_and_sort' | 'sort' | 'info';
  level: 'product' | 'offer';
  value: string | number | boolean;
  origin: 'text' | 'user';
  llm?: true; // read by the LLM, not the rules (BR-55); the page marks it
};
// API contract §3: role and level are fixed per kind.
const ROLE: Record<ChipKind, [Chip['role'], Chip['level']]> = {
  intent: ['filter_and_sort', 'product'],
  item_type: ['filter', 'product'],
  form: ['filter', 'product'],
  karat: ['filter', 'product'],
  audience: ['filter', 'product'],
  condition: ['filter', 'product'],
  no_stones: ['filter', 'product'],
  budget_min: ['filter', 'product'],
  budget_max: ['filter', 'product'],
  budget_target: ['filter_and_sort', 'product'],
  weight_min: ['filter', 'product'],
  weight_max: ['filter', 'product'],
  weight_target: ['filter_and_sort', 'product'],
  weight_pref: ['sort', 'product'],
  ojrat_max: ['filter', 'product'],
  ojrat_sort: ['sort', 'product'],
  style: ['sort', 'product'],
  shop: ['filter', 'offer'],
  city: ['filter', 'offer'],
  in_person: ['filter', 'offer'],
  torob_pay: ['filter', 'offer'],
  recipient: ['info', 'product'],
  occasion: ['info', 'product'],
  price_sort: ['sort', 'product'],
  premium_sort: ['sort', 'product'],
};

// CR-12: the page's sort control sets one of these at a time; ojrat_sort can also come from a sentence.
const SORT_KINDS = ['price_sort', 'premium_sort', 'ojrat_sort'] as const;

export { ROLE, SORT_KINDS, type ChipKind, type Chip };
