import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const account = spawn(process.execPath, ['scripts/account-server.mjs'], {
  stdio: 'inherit',
});
const vite = await createServer({
  server: { host: process.env.PROTOMAKE_HOST || '127.0.0.1' },
});
await vite.listen();
vite.printUrls();

let closing = false;
async function close(code = 0) {
  if (closing) return;
  closing = true;
  account.kill();
  await vite.close();
  process.exitCode = code;
}
account.on('exit', (code) => {
  if (!closing && code) void close(code);
});
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());
