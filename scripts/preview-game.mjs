import { URL } from 'node:url';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.argv[2] ?? 'examples/milestones-5-7/web-build'),
  port = Number(process.argv[3] ?? 4180);
await stat(root);
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.wav': 'audio/wav',
};
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost'),
      path = resolve(
        root,
        '.' +
          decodeURIComponent(url.pathname) +
          (url.pathname.endsWith('/') ? 'index.html' : ''),
      );
    if (path !== root && !path.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    const bytes = await readFile(path);
    response
      .writeHead(200, {
        'Content-Type': mime[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      })
      .end(bytes);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () =>
  console.log(`Game preview: http://127.0.0.1:${port}/`),
);
