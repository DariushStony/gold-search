// Bundles the page: src/web/scripts/main.ts to app.js and src/web/styles/main.css to app.css, then writes
// index.html with a content hash on each asset URL, so browsers may cache the assets for a year.
// Run: node scripts/build-web.ts [--watch]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as esbuild from 'esbuild';

const ROOT = new URL('../', import.meta.url).pathname;
const SRC = join(ROOT, 'src/web');
const OUT = join(ROOT, 'dist/web');

const hash = (file: string) =>
  createHash('sha256')
    .update(readFileSync(join(OUT, file)))
    .digest('hex')
    .slice(0, 10);

const writeHtml: esbuild.Plugin = {
  name: 'html',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length) return;
      const html = readFileSync(join(SRC, 'index.html'), 'utf8').replace(
        /"\/assets\/([\w.-]+)"/g,
        (_m, file: string) => `"/assets/${file}?v=${hash(`assets/${file}`)}"`,
      );
      writeFileSync(join(OUT, 'index.html'), html);
    });
  },
};

const options: esbuild.BuildOptions = {
  entryPoints: [
    { in: join(SRC, 'scripts/main.ts'), out: 'app' },
    { in: join(SRC, 'scripts/theme-init.ts'), out: 'theme-init' },
    { in: join(SRC, 'styles/main.css'), out: 'app' },
  ],
  outdir: join(OUT, 'assets'),
  bundle: true,
  minify: true,
  sourcemap: 'linked',
  target: ['es2022', 'safari15'],
  format: 'esm',
  logLevel: 'info',
  plugins: [writeHtml],
};

export async function watchWeb() {
  const ctx = await esbuild.context(options);
  await ctx.watch();
}

if (import.meta.main) {
  if (process.argv.includes('--watch')) await watchWeb();
  else await esbuild.build(options);
}
