import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, rm } from 'node:fs/promises';

await rm('examples/prototypes/web', { recursive: true, force: true });
for (const game of ['showcase', 'shooter', 'platformer', 'fighter']) {
  execFileSync(
    process.execPath,
    [
      'scripts/export-project.mjs',
      `examples/prototypes/${game}/${game}.protomake.json`,
      `examples/prototypes/web/${game}`,
    ],
    { stdio: 'inherit' },
  );
}
await mkdir('examples/prototypes/web', { recursive: true });
await copyFile(
  'examples/prototypes/launcher.html',
  'examples/prototypes/web/index.html',
);
console.log(
  'The flagship showcase, three focused labs and launcher are ready. Run npm run preview:prototypes.',
);
