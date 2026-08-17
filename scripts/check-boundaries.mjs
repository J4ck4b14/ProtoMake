import { readdir, readFile } from 'node:fs/promises';
const allowed = {
  core: [],
  serialization: ['@protomake/core', 'zod'],
  runtime: ['@protomake/core'],
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
      if (!dependencies.includes(specifier)) {
        console.error(`${name}/${file}: forbidden dependency ${specifier}`);
        errors++;
      }
    }
  }
}
if (errors) process.exit(1);
console.log('Package boundaries verified.');
