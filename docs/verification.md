# Verification through Milestone 7

Required gates: clean `npm ci`, strict typecheck, lint/format/import-boundaries, tests, and both production builds.

The automated suite covers the original core/editor/assets/physics/input/script tests, plus:

- Ten linked prefab instances, per-instance speed override preservation during base sprite propagation, per-property apply/revert, cross-scene updates, reload resolution, hierarchy/reference remapping and unpacking.
- Frame timing/loop/hold, controller/condition validation, parameter-driven transitions, integer constraints and trigger consumption.
- Audio buffer reuse, output-bus routing, pause/resume offset and one-shot node recreation, activation cleanup and decode failure. These audio tests use a mocked AudioContext; they do not establish audible output or browser codec support.
- Folder moves/identity, empty-folder persistence and undo; keyboard resizing and saved layout; frame/controller/mixer authoring through DOM controls.
- The supplied Workshop fixture running actual compiled project scripts, Rapier physics and animation; a jump is verified to request playback on its AudioSource.
- Static script linking/execution, startup/dependency output, pre-export validation and ZIP integrity checked with Python's independent zipfile reader.

DOM tests use jsdom, fake IndexedDB and mocked graphics. GPU appearance, audible playback, file-picker/download behavior and Service Worker preview behavior are covered by TESTING-CHECKLIST.md rather than asserted by the mocked DOM suite.

Production verification builds the editor and a separate player, checks that the player's bundled module graph contains neither editor modules nor TypeScript, exports the Workshop using the same build code as the editor button, checks archive integrity, and serves the resulting static files at both root and subdirectory paths. This tests HTTP availability and exact bytes, not execution in a graphical browser. Remote CI and deployment to an external host have not been performed.

Rapier's compat initialization emits an upstream deprecation warning despite its published no-argument API. Large chunks include embedded WASM and, in the editor only, the TypeScript compiler. Their size warnings are documented performance limitations rather than failed builds.
