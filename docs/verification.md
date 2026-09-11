# Verification through Milestone 7

Required gates: clean `npm ci`, strict typecheck, lint/format/import-boundaries, tests, and both production builds.

The automated suite covers the original core/editor/assets/physics/input/script tests, plus:

- Ten linked prefab instances, per-instance speed override preservation during base sprite propagation, per-property apply/revert, cross-scene updates, reload resolution, hierarchy/reference remapping and unpacking.
- Frame timing/loop/hold, controller/condition validation, parameter-driven transitions, integer constraints and trigger consumption.
- Audio buffer reuse, output-bus routing, pause/resume offset and one-shot node recreation, activation cleanup and decode failure. These audio tests use a mocked AudioContext; they do not establish audible output or browser codec support.
- Folder moves/identity, empty-folder persistence and undo; keyboard resizing and saved layout; frame/controller/mixer authoring through DOM controls.
- The supplied Workshop fixture running actual compiled project scripts, Rapier physics and animation; a jump is verified to request playback on its AudioSource.
- Static script linking/execution, startup/dependency output, pre-export validation and store-only ZIP integrity/CRC/UTF-8 filename checks using a platform-independent TypeScript reader.

DOM tests use jsdom, fake IndexedDB and mocked graphics. GPU appearance, audible playback, file-picker/download behavior and Service Worker preview behavior are covered by TESTING-CHECKLIST.md rather than asserted by the mocked DOM suite.

Production verification builds the editor and a separate player, checks that the player's bundled module graph contains neither editor modules nor TypeScript, exports the Workshop using the same build code as the editor button, checks archive integrity, and serves the resulting static files at both root and subdirectory paths. This tests HTTP availability and exact bytes, not execution in a graphical browser. Remote CI and deployment to an external host have not been performed.

Rapier's compat initialization emits an upstream deprecation warning despite its published no-argument API. Large chunks include embedded WASM and, in the editor only, the TypeScript compiler. Their size warnings are documented performance limitations rather than failed builds.

## ProtoMake 0.9.1 Editor Quality certification delta

The first clean Windows certification run of 0.9.0 successfully completed `npm ci`, strict `npm run typecheck`, and both production builds. It also exposed three release defects before certification: the new shadow-caster component used the invalid camelCase id `protomake.shadowCaster`, the account server relied on Node globals that were not declared to ESLint, and one export test assumed a `python3` executable. The component-id defect caused registration to abort and cascaded into 54 otherwise unrelated test failures.

0.9.1 corrects the canonical component id to `protomake.shadow-caster`, imports `Buffer`/`URL` explicitly in the account server, and replaces the Python subprocess ZIP check with a pure TypeScript store-only ZIP reader that verifies UTF-8 flags, CRC32, directory offsets/counts and exact payload bytes. Project/scene validation accepts the briefly shipped `protomake.shadowCaster` alias and canonicalizes it (including prefab documents) on validated load/save, so work authored in the broken build remains recoverable. A regression case covers that compatibility path, bringing the expected suite to 106 tests.

ProtoMake 0.9.2 completed the full Windows certification sequence: clean dependency installation, formatting, strict typecheck, lint and package-boundary checks, all 106 automated tests, and both production builds. The 0.9.1 hotfix notes below remain as historical context for the defects that certification uncovered.

## 0.9.1 dependency security note

ProtoMake 0.9.1 pins Vite 7.3.2 rather than 7.3.1 because ProtoMake can intentionally expose the development server to a LAN for mobile testing. Continue to inspect `npm audit` output after a clean install; the Vite patch does not imply that every transitive advisory reported by npm has been resolved.
