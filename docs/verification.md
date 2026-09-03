# Verification through Milestone 4

The required gate is `npm run typecheck && npm run lint && npm test && npm run build`. Clean installation is verified with `npm ci`.

The 71 automated tests include:

- Core identity/component lifetime, immutable snapshots, affine hierarchy, cyclic/singular-parent rejection and deterministic serialization.
- Editor history, whole-gesture undo/cancel, subtree duplication, scene lifecycle, saved-project reopen and independent active-scene persistence.
- Actual Inspector and viewport event handlers, plus full editor startup/create/edit/save/open/settings/script-compilation through DOM controls.
- Asset identity after moves, dependency and compatibility checks, image metadata, deterministic sorting and project schema migrations.
- Actual Rapier/WASM falling, landing, jumping, sensors, collision matrix, raycasts, shapes and destroyed-body cleanup.
- Named input edges, diagonal normalization, invalid bindings and synthetic gamepad state.
- Actual TypeScript compilation and execution of project modules, module resolution errors, multiple independent mechanics, trigger script callbacks, overrides, lifecycle transitions, duplicated entity references and contextual runtime faults.

DOM tests use jsdom, a fake IndexedDB implementation and mocked graphics. They verify application logic and controls, not WebGL pixels, real file dialogs or physical input devices. GPU/browser visual checks and hardware-dependent behavior are covered by TESTING-CHECKLIST.md.

Vite development startup and the production build are checked locally. Production HTTP smoke verifies the editor/Play HTML and emitted assets are served. This is a build of the editor, not the Milestone 7 creator-game exporter. Remote GitHub CI and deployment have not been performed.

Rapier's compat initialization may print an upstream deprecation warning even though the adapter uses its published no-argument init API. Large production chunks contain the in-browser TypeScript compiler and embedded Rapier WASM; bundle-size warnings do not mean a failed build.
