// Takes the <svg> out of an Archify page so the Atlas can inline it, themed by diagram.css instead of
// Archify's runtime (which our CSP would block). Ids get a prefix so two diagrams can share a page, and
// anything executable is refused rather than stripped. Run: node scripts/atlas/extract-diagram.ts <archify.html> <name>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function extract(html: string, prefix: string): string {
  const m = html.match(/<svg[\s\S]*?<\/svg>/);
  if (!m) throw new Error('no <svg> in the Archify page');
  const svg = m[0];
  if (/<script|<foreignObject|\son[a-z]+=|javascript:/i.test(svg)) {
    throw new Error('the diagram contains executable content; refusing to inline it');
  }
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]!);
  let out = svg;
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(`id="${esc}"`, 'g'), `id="${prefix}-${id}"`)
      .replace(new RegExp(`url\\(#${esc}\\)`, 'g'), `url(#${prefix}-${id})`)
      .replace(new RegExp(`href="#${esc}"`, 'g'), `href="#${prefix}-${id}"`)
      .replace(
        new RegExp(`(aria-(?:labelledby|describedby)="[^"]*)\\b${esc}\\b`, 'g'),
        `$1${prefix}-${id}`,
      );
  }
  return out;
}

if (import.meta.main) {
  const [file, name] = process.argv.slice(2);
  if (!file || !name) throw new Error('usage: extract-diagram.ts <archify.html> <name>');
  const dir = new URL('../../docs/atlas/diagrams/', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  const svg = extract(readFileSync(file, 'utf8'), `dg-${name}`);
  writeFileSync(join(dir, `${name}.svg`), svg + '\n');
  const classes = [
    ...new Set([...svg.matchAll(/class="([^"]+)"/g)].flatMap((x) => x[1]!.split(/\s+/))),
  ].sort();
  console.log(
    `${name}.svg: ${svg.length} bytes, ${classes.length} classes: ${classes.join(' ')}`,
  );
}

export { extract };
