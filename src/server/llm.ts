// ADR-0005: AvalAI's OpenAI-compatible chat API with a strict JSON schema, temperature 0 and a short timeout.
import { config } from "../core/config.ts";
import { normalize } from "../core/extract.ts";
import { parseQuery, type Answers, type ParsedQuery } from "../core/parse.ts";
import { buildMessages, mergeLlm, LLM_SCHEMA } from "../core/llm.ts";

export type Llm = (messages: ReturnType<typeof buildMessages>) => Promise<unknown>;

export function avalai(key: string, model = config.llm.model): Llm {
  return async (messages) => {
    const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages,
        response_format: { type: "json_schema", json_schema: { name: "chips", strict: true, schema: LLM_SCHEMA } },
      }),
      signal: AbortSignal.timeout(config.llm.timeoutMs),
    });
    if (!res.ok) throw new Error(`avalai ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return JSON.parse(body.choices?.[0]?.message?.content ?? "null");
  };
}

// Rules first; the LLM only sees requests the rules left words in (BR-55) and never blocks an answer (BR-73).
// Answers are cached by normalised text so the same request gives the same chips (NFR-05).
export function parser(llm: Llm | null) {
  const cache = new Map<string, ParsedQuery>();
  return async (text: string, answers: Answers = {}): Promise<ParsedQuery> => {
    const rules = parseQuery(text, answers);
    if (!llm || !rules.unparsed || rules.ask) return rules;
    const key = JSON.stringify([normalize(text).trim(), answers]);
    const hit = cache.get(key);
    if (hit) return hit;
    try {
      const merged = mergeLlm(text, rules, await llm(buildMessages(text, rules)));
      if (!merged) return rules;
      if (cache.size >= config.llm.cacheSize) cache.delete(cache.keys().next().value!);
      cache.set(key, merged.result);
      return merged.result;
    } catch (e) {
      console.error(`llm: ${(e as Error).message}; rules only`);
      return rules;
    }
  };
}
