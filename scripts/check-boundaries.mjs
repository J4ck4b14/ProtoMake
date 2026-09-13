import { readdir, readFile } from 'node:fs/promises';
const allowed = {
  core: [],
  prefabs: ['@protomake/core', 'zod'],
  animation: [
    '@protomake/core',
    '@protomake/assets',
    '@protomake/runtime',
    '@protomake/renderer',
    'zod',
  ],
  audio: ['@protomake/core', '@protomake/assets', '@protomake/runtime', 'zod'],
  scripting: [
    '@protomake/core',
    '@protomake/runtime',
    '@protomake/assets',
    '@protomake/input',
    '@protomake/physics2d',
    '@protomake/renderer',
    'typescript',
    'zod',
  ],
  graphs: [
    '@protomake/assets',
    '@protomake/core',
    '@protomake/physics2d',
    '@protomake/scripting',
    'zod',
  ],
  ui: ['@protomake/assets', '@protomake/core', '@protomake/runtime', 'zod'],
  persistence: ['zod'],
  tilemap: ['@protomake/core', 'zod'],
  input: ['zod'],
  physics2d: [
    '@protomake/assets',
    '@protomake/core',
    '@protomake/runtime',
    '@protomake/tilemap',
    'zod',
    '@dimforge/rapier2d-compat',
  ],
  assets: ['@protomake/core', 'zod'],
  renderer: [
    '@protomake/core',
    '@protomake/assets',
    '@protomake/runtime',
    '@protomake/tilemap',
    'zod',
    'pixi.js',
  ],
  serialization: [
    '@protomake/prefabs',
    '@protomake/animation',
    '@protomake/audio',
    '@protomake/core',
    '@protomake/assets',
    '@protomake/physics2d',
    '@protomake/input',
    '@protomake/graphs',
    '@protomake/persistence',
    '@protomake/tilemap',
    'zod',
  ],
  runtime: ['@protomake/core'],
  player: [
    '@protomake/core',
    '@protomake/serialization',
    '@protomake/runtime',
    '@protomake/renderer',
    '@protomake/physics2d',
    '@protomake/input',
    '@protomake/scripting',
    '@protomake/prefabs',
    '@protomake/animation',
    '@protomake/audio',
    '@protomake/assets',
    '@protomake/graphs',
    '@protomake/ui',
    '@protomake/persistence',
    '@protomake/tilemap',
  ],
  editor: [
    '@protomake/player',
    '@protomake/prefabs',
    '@protomake/animation',
    '@protomake/audio',
    '@protomake/core',
    '@protomake/serialization',
    '@protomake/runtime',
    '@protomake/assets',
    '@protomake/renderer',
    '@protomake/scripting',
    '@protomake/physics2d',
    '@protomake/input',
    '@protomake/graphs',
    '@protomake/ui',
    '@protomake/persistence',
    '@protomake/tilemap',
  ],
};
let errors = 0;
for (const [name, dependencies] of Object.entries(allowed)) {
  for (const file of await readdir(`packages/${name}/src`)) {
    if (!file.endsWith('.ts')) continue;
    const text = await readFile(`packages/${name}/src/${file}`, 'utf8');
    for (const match of text.matchAll(
      /(?:from\s*|import\s*\()['"]([^'"]+)['"]/g,
    )) {
      const specifier = match[1];
      if (specifier.startsWith('./') && !specifier.includes('/../')) continue;
      if (
        !dependencies.includes(specifier) &&
        !dependencies.includes(specifier.split('/').slice(0, 2).join('/'))
      ) {
        console.error(`${name}/${file}: forbidden dependency ${specifier}`);
        errors++;
      }
    }
  }
}
if (errors) process.exit(1);
console.log('Package boundaries verified.');
