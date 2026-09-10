import { execFileSync } from 'node:child_process';
import { mkdir, copyFile } from 'node:fs/promises';
for (const game of ['shooter', 'platformer', 'fighter']) {
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
  'Three standalone games and launcher ready. Run npm run preview:prototypes.',
);
