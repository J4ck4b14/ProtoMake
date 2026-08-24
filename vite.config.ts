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
