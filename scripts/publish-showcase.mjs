import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';

const output = 'dist/showcase';
await rm(output, { recursive: true, force: true });
await rm(`${output}.zip`, { force: true });
execFileSync(
  process.execPath,
  [
    'scripts/export-project.mjs',
    'examples/prototypes/showcase/showcase.protomake.json',
    output,
  ],
  { stdio: 'inherit' },
);
await rm(`${output}.zip`, { force: true });
