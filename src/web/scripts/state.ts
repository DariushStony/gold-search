import { ROLE, type Chip, type ChipKind } from '../../shared/chips.ts';
import { post } from './api.ts';
import type { SearchResponse } from './types.ts';

type Answers = { budget_unit?: 'thousand' | 'million' };

const st: {
  text: string;
  chips: Chip[];
  answers: Answers;
  last: SearchResponse | null;
  llm: boolean;
  intentOptions: string[] | null;
} = { text: '', chips: [], answers: {}, last: null, llm: false, intentOptions: null };

// A chip the user set by hand (filter panel, sort control, intent buttons) is the same shape as one read from
// the sentence, so the server treats both alike (API contract §3).
const userChip = (kind: ChipKind, value: Chip['value']): Chip => ({
  kind,
  value,
  role: ROLE[kind][0],
  level: ROLE[kind][1],
  origin: 'user',
});

const session = (() => {
  try {
    const id = sessionStorage.getItem('sid') ?? crypto.randomUUID();
    sessionStorage.setItem('sid', id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
})();

// Tracking plan events; a failed send never bothers the user.
const track = (name: string, props: Record<string, unknown>) =>
  post('/events', {
    event_id: crypto.randomUUID(),
    name,
    at: new Date().toISOString(),
    session_id: session,
    snapshot_id: st.last?.snapshot.id ?? null,
    query_id: st.last?.query_id ?? null,
    props,
  }).catch(() => {});

const rankOf = (id: string) => 1 + (st.last?.results.findIndex((c) => c.id === id) ?? 0);

export { st, userChip, track, rankOf };
