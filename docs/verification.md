# Verification

Run the repository gates from a clean dependency install:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

The automated suite covers core entity/component behavior, serialization, editor history, asset management, physics/input, scripting, prefabs, animation, audio, visual graphs, runtime UI/persistence, tilemaps, live iteration, player loading and export.

Key integration checks include:

- linked prefab instances, override propagation, reference remapping and unpacking;
- animation timing, state transitions, parameter validation and trigger consumption;
- audio buffer reuse, routing, pause/resume behavior and lifecycle cleanup;
- asset folders, saved editor layout and media-authoring controls;
- the workshop fixture running compiled project scripts with Rapier physics, animation and audio requests;
- static script linking/execution and pre-export validation;
- standalone player composition that excludes editor-only modules;
- deterministic Interchange output and target-specific export diagnostics;
- ZIP structure, UTF-8 filenames, CRC checks and exact payload bytes.

DOM tests use jsdom, fake IndexedDB and mocked graphics where browser rendering is not the subject of the test. They validate editor/application behavior, not GPU appearance. Audible playback, native file pickers/downloads, Service Worker behavior and target-engine import/compilation still require manual verification in the environments that own those capabilities.

Production verification builds both the editor and standalone player, exports the workshop project through the same build path used by the editor, checks the produced files, and serves static output from root and subdirectory paths.

Rapier's compatibility initializer may emit an upstream deprecation warning even when using its published no-argument API. Production bundles also include WASM and, in the editor, the TypeScript compiler; size warnings for those chunks should be evaluated as performance information rather than treated automatically as build failures.

Before publishing, also run `npm audit` and review current advisories. Apply dependency updates deliberately, regenerate the lockfile, and rerun the full gate after any dependency change.
