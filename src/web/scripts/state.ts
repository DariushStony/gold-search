import { post } from './api.ts';
import type { Chip, SearchResponse } from './types.ts';

type Answers = { budget_unit?: 'thousand' | 'million' };

export const st: {
  text: string;
  chips: Chip[];
  answers: Answers;
  last: SearchResponse | null;
  llm: boolean;
} = { text: '', chips: [], answers: {}, last: null, llm: false };

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
export const track = (name: string, props: Record<string, unknown>) =>
  post('/events', {
    event_id: crypto.randomUUID(),
    name,
    at: new Date().toISOString(),
    session_id: session,
    snapshot_id: st.last?.snapshot.id ?? null,
    query_id: st.last?.query_id ?? null,
    props,
  }).catch(() => {});

export const rankOf = (id: string) =>
  1 + (st.last?.results.findIndex((c) => c.id === id) ?? 0);
