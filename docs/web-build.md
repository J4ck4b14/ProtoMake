# Standalone web games

**Set startup scene**, stop Play, then choose **Build ZIP**. ProtoMake validates the project, prefab links and asset/animation references, compiles and links TypeScript project modules, verifies the prebuilt player's file hashes, and downloads a static ZIP. Build failures appear in the editor Console.

Extract the ZIP. Upload its entire contents to an ordinary static host. The player needs HTTP(S), JavaScript, WebGL and Web Audio; opening index.html directly as `file://` is unsupported. The player requires no Node server, ProtoMake editor, external CDN or runtime TypeScript compiler. Paths are relative, including compiled script imports, so hosting in a subdirectory works. Use HTTPS for a deployed game.

**Preview build** opens the same production files in another tab. This requires popups and Service Workers on HTTPS or localhost. The worker intercepts only ProtoMake's generated preview paths; normal editor requests pass through. One cached preview is retained; creating another replaces its cached files. Cache eviction may require rebuilding the preview. Service Workers are only an editor preview mechanism, not a dependency of the exported player.

A command-line equivalent is included:

```sh
npm run build:player
npm run export:game -- examples/milestones-5-7/Workshop.protomake.json my-game
npm run preview:game -- my-game 4180
```

The export command requires an empty destination and writes both a folder and its sibling ZIP. The preview command is a local development HTTP server; it is not deployed with the game.

The delivery archive includes a generated example at `examples/milestones-5-7/web-build/`. After installing development dependencies, `npm run preview:game` serves that folder. You may instead upload that folder directly to your static host.

## Hosting the ProtoMake editor itself

The editor build is also static. `npm run build` writes it to `dist/`, including the reusable standalone player under `dist/player/`. ProtoMake 0.9.3 uses relative Vite asset paths, so the editor can live under a GitHub Pages repository path instead of requiring `/` at the domain root. For the no-backend public alpha, local IndexedDB saves plus portable `.protomake.json` export/import are sufficient; account sync is optional. See [GitHub Pages deployment](github-pages.md).

## What is included

- index.html with loading/error feedback and a click-to-start screen.
- Production player JS chunks with Pixi and embedded Rapier WASM.
- project.protomake.json containing all authored scenes and assets.
- scripts.json and compiled ES modules under scripts/; TS source strings are stripped from the runtime project.
- BUILD-REPORT.json documenting scene/asset IDs, script paths and collection policy.
- DEPLOY.txt with concise hosting instructions, and THIRD-PARTY-NOTICES.txt.

Collection deliberately retains **all** project scenes and assets because scripts may address them dynamically. This is conservative dependency collection, not an unused-asset optimizer. Builds can be larger than necessary. No minification/obfuscation of project script modules or source maps are offered yet; the engine/player bundle is production-minified.

The player and editor Play share GameSession service composition. On hidden tabs, standalone gameplay pauses and presents Resume. Arbitrary user scripts are trusted code: the runtime cannot recover from infinite loops or safely execute malicious projects. Full semantic checking of project scripts remains the external TypeScript editor/tsc's responsibility.

## Startup patch

The original 0.7 export could deadlock: its entry module awaited startup while a dynamically loaded Pixi renderer imported shared exports from that same entry. Startup now runs inside an async function without blocking module evaluation. Production builds reject top-level await in player chunks to prevent this regression.

The loading screen now has a spinner, current stage and elapsed seconds, and keeps Start hidden until initialization completes. Individual asynchronous stages time out after 30 seconds; an independent HTML watchdog reports a 35-second stall even if the engine module never starts. Errors provide Reload. These indicators cannot recover a main thread blocked by an infinite user script.

Rebuild previously exported games with the patched editor. The bundled web-build example has already been rebuilt. Fully stop the old development server before starting this archive; do not mix files from old and new exports.
