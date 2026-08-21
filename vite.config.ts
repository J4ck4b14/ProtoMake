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
    alias: Object.fromEntries(
      ['core', 'serialization', 'runtime', 'editor'].map((name) => [
        `@protomake/${name}`,
        fileURLToPath(
          new URL(`./packages/${name}/src/index.ts`, import.meta.url),
        ),
      ]),
    ),
  },
});
