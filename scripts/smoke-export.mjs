import { preview, createServer as createViteServer } from 'vite';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { URL } from 'node:url';
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
const root = 'examples/milestones-5-7/web-build';
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = dir + '/' + entry.name;
    if (entry.isDirectory()) result.push(...(await files(path)));
    else result.push(path);
  }
  return result;
}
const builtFiles = await files(root);
const gameServer = createServer(async (req, res) => {
  try {
    let path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/nested/game/'))
      path = path.slice('/nested/game'.length);
    if (path.endsWith('/')) path += 'index.html';
    if (path.includes('..')) throw new Error('Invalid path');
    const bytes = await readFile(root + path);
    res.writeHead(200).end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => gameServer.listen(0, '127.0.0.1', resolve));
const gameOrigin = `http://127.0.0.1:${gameServer.address().port}`;
const editor = await preview({
  preview: { host: '127.0.0.1', port: 4182, strictPort: true },
});
const ssr = await createViteServer({
  server: { middlewareMode: true },
  appType: 'custom',
});
const originalFetch = globalThis.fetch;
try {
  for (const prefix of ['/', '/nested/game/'])
    for (const file of builtFiles) {
      const path = file.slice(root.length + 1),
        response = await originalFetch(gameOrigin + prefix + path);
      assert.equal(response.status, 200, path);
      assert.deepEqual(
        Buffer.from(await response.arrayBuffer()),
        await readFile(file),
        path,
      );
    }
  for (const file of await files('dist')) {
    const path = file.slice(5),
      response = await originalFetch('http://127.0.0.1:4182/' + path);
    assert.equal(response.status, 200, path);
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      await readFile(file),
      path,
    );
  }
  // Run the editor button's exporter against the actual production runtime manifest.
  globalThis.fetch = (url, options) =>
    originalFetch(
      typeof url === 'string' && url.startsWith('./')
        ? new URL(url, 'http://127.0.0.1:4182/')
        : url,
      options,
    );
  const { EditorModel } = await ssr.ssrLoadModule(
    '/packages/editor/src/model.ts',
  );
  const { buildGame } = await ssr.ssrLoadModule(
    '/packages/editor/src/build-game.ts',
  );
  const model = new EditorModel();
  model.load(
    JSON.parse(
      await readFile('examples/milestones-5-7/Workshop.protomake.json', 'utf8'),
    ),
  );
  const browserFiles = await buildGame(model);
  for (const file of browserFiles)
    assert.deepEqual(
      Buffer.from(file.data),
      await readFile(root + '/' + file.path),
      file.path,
    );
  const html = await readFile(root + '/index.html', 'utf8');
  assert.match(html, /\.\/assets\//);
  assert.doesNotMatch(html, /packages\/editor|typescript|localhost/);
  console.log(
    `Export smoke passed: ${builtFiles.length} game files at root and nested paths; production editor bytes; browser exporter matches CLI export.`,
  );
} finally {
  globalThis.fetch = originalFetch;
  await ssr.close();
  editor.httpServer.closeAllConnections();
  await new Promise((resolve) => editor.httpServer.close(resolve));
  gameServer.closeAllConnections();
  await new Promise((resolve) => gameServer.close(resolve));
}
