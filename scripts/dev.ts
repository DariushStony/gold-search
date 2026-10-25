// Local development: rebuilds the page on every change and restarts the server on every server change.
// Run: pnpm dev
import { spawn } from 'node:child_process';
import { watchWeb } from './build-web.ts';

await watchWeb();
spawn(process.execPath, ['--watch', '--env-file-if-exists=.env', 'src/app/server.ts'], {
  stdio: 'inherit',
});
