import { createServer } from 'vite';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
const [projectPath, outDir] = process.argv.slice(2);
if (!projectPath || !outDir)
  throw new Error(
    'Usage: npm run export:game -- project.protomake.json output-folder (run npm run build:player first)',
  );
try {
  if ((await readdir(outDir)).length)
    throw new Error('Choose an empty output folder');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { projectBuildFiles, zipFiles } = await server.ssrLoadModule(
    '/packages/editor/src/build-game.ts',
  );
  const files = projectBuildFiles(
    JSON.parse(await readFile(projectPath, 'utf8')),
  );
  const manifest = JSON.parse(
    await readFile('public/player/manifest.json', 'utf8'),
  );
  for (const item of manifest)
    files.push({
      path: item.path,
      data: new Uint8Array(await readFile(join('public/player', item.path))),
    });
  for (const file of files) {
    const path = join(outDir, file.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.data);
  }
  await writeFile(outDir + '.zip', zipFiles(files));
  console.log(`Exported ${files.length} files to ${outDir} and ${outDir}.zip`);
} finally {
  await server.close();
}
