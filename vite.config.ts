import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        editor: 'index.html',
        play: 'play.html',
        foundation: 'foundation.html',
      },
    },
  },
  resolve: {
    alias: {
      '@protomake/physics2d/rapier': fileURLToPath(
        new URL('./packages/physics2d/src/rapier.ts', import.meta.url),
      ),
      '@protomake/renderer/pixi': fileURLToPath(
        new URL('./packages/renderer/src/pixi.ts', import.meta.url),
      ),
      ...Object.fromEntries(
        [
          'core',
          'serialization',
          'runtime',
          'editor',
          'assets',
          'physics2d',
          'input',
          'renderer',
        ].map((name) => [
          `@protomake/${name}`,
          fileURLToPath(
            new URL(`./packages/${name}/src/index.ts`, import.meta.url),
          ),
        ]),
      ),
    },
  },
});
