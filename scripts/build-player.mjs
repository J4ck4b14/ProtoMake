import { build, loadConfigFromFile } from 'vite';
import { readFile, writeFile, readdir, rename, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const config = await loadConfigFromFile({
  command: 'build',
  mode: 'production',
});
const result = await build({
  configFile: false,
  resolve: config.config.resolve,
  base: './',
  publicDir: false,
  plugins: [
    {
      name: 'prevent-player-startup-deadlock',
      generateBundle(_options, bundle) {
        const hasTopLevelAwait = (node) => {
          if (!node || typeof node !== 'object') return false;
          if (
            [
              'FunctionDeclaration',
              'FunctionExpression',
              'ArrowFunctionExpression',
            ].includes(node.type)
          )
            return false;
          if (
            node.type === 'AwaitExpression' ||
            (node.type === 'ForOfStatement' && node.await)
          )
            return true;
          return Object.values(node).some((value) =>
            Array.isArray(value)
              ? value.some(hasTopLevelAwait)
              : hasTopLevelAwait(value),
          );
        };
        for (const chunk of Object.values(bundle)) {
          if (
            chunk.type === 'chunk' &&
            hasTopLevelAwait(this.parse(chunk.code))
          )
            this.error(
              `Top-level await can deadlock the player renderer: ${chunk.fileName}`,
            );
        }
      },
    },
  ],
  build: {
    outDir: 'public/player',
    emptyOutDir: true,
    rollupOptions: { input: 'player.html' },
  },
});
for (const output of Array.isArray(result) ? result : [result])
  for (const chunk of output.output ?? [])
    if (chunk.type === 'chunk')
      for (const module of Object.keys(chunk.modules))
        if (
          module.includes('/packages/editor/') ||
          module.includes('/node_modules/typescript/')
        )
          throw new Error(`Authoring code leaked into player: ${module}`);
const dependencyRoots = new Set();
for (const output of Array.isArray(result) ? result : [result])
  for (const chunk of output.output ?? [])
    if (chunk.type === 'chunk')
      for (const module of Object.keys(chunk.modules)) {
        const match = module
          .replace(/^\0/, '')
          .match(/^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//);
        if (match) dependencyRoots.add(match[1]);
      }
const notices = [];
for (const root of [...dependencyRoots].sort()) {
  const pkg = JSON.parse(await readFile(root + '/package.json', 'utf8'));
  const names = (await readdir(root)).filter((name) =>
    /^(licen[cs]e|notice)(\.|$)/i.test(name),
  );
  notices.push(
    `\n=== ${pkg.name} ${pkg.version} — ${pkg.license ?? 'see license'} ===\n`,
  );
  for (const name of names)
    notices.push(await readFile(root + '/' + name, 'utf8'));
  if (!names.length)
    notices.push(
      `Package: ${pkg.name}; license declaration: ${JSON.stringify(pkg.license)}; repository: ${JSON.stringify(pkg.repository)}`,
    );
}
await writeFile('public/player/THIRD-PARTY-NOTICES.txt', notices.join('\n'));
await rename('public/player/player.html', 'public/player/index.html');
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = dir + '/' + entry.name;
    if (entry.isDirectory()) result.push(...(await files(path)));
    else result.push(path);
  }
  return result;
}
const manifest = [];
for (const path of await files('public/player')) {
  const bytes = await readFile(path);
  manifest.push({
    path: path.slice('public/player/'.length),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
await mkdir('public/player', { recursive: true });
await writeFile(
  'public/player/manifest.json',
  JSON.stringify(manifest, null, 2),
);
console.log(
  `Standalone player: ${manifest.length} files; no editor or TypeScript compiler entry.`,
);
