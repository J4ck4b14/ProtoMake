import { readdir, readFile } from 'node:fs/promises';
const allowed = {
  core: [],
  scripting: [
    '@protomake/core',
    '@protomake/runtime',
    '@protomake/assets',
    '@protomake/input',
    '@protomake/physics2d',
    'typescript',
    'zod',
  ],
  input: ['zod'],
  physics2d: [
    '@protomake/core',
    '@protomake/runtime',
    'zod',
    '@dimforge/rapier2d-compat',
  ],
  assets: ['@protomake/core', 'zod'],
  renderer: ['@protomake/core', '@protomake/assets', 'zod', 'pixi.js'],
  serialization: [
    '@protomake/core',
    '@protomake/assets',
    '@protomake/physics2d',
    '@protomake/input',
    'zod',
  ],
  runtime: ['@protomake/core'],
  editor: [
    '@protomake/core',
    '@protomake/serialization',
    '@protomake/runtime',
    '@protomake/assets',
    '@protomake/renderer',
    '@protomake/scripting',
    '@protomake/physics2d',
    '@protomake/input',
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
