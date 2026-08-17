import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    alias: Object.fromEntries(
      ['core', 'serialization', 'runtime'].map((name) => [
        `@protomake/${name}`,
        fileURLToPath(
          new URL(`./packages/${name}/src/index.ts`, import.meta.url),
        ),
      ]),
    ),
  },
});
