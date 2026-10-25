export const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

// Every value from the API or the user goes through this before it reaches innerHTML.
export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ENTITIES[c]!);
