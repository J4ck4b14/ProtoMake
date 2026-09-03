# ProtoMake 0.4.0

A reusable, browser-native 2D engine and visual editor for human-authored projects.

**Milestones 0–4 are implemented and ready for hands-on acceptance testing.** Milestones 5–7 (prefabs, animation/audio, creator-game export) have not started. This is a development checkpoint, not a finished general-purpose engine release.

## Start here

Extract the archive and open a terminal in the directory containing **package.json and package-lock.json**. This archive puts those files at its root; there is no extra `protomake` folder inside it.

Requires Node.js 22.12+ and npm 11.9.0 (validated with Node 24.19.0). Run:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The root page is the editor; `/foundation.html` retains the original Milestone 0 harness. If another server is still running, stop it or check the new URL carefully. IndexedDB project storage is scoped to browser and origin, including port.

In the editor click **Import JSON** and select:

```text
examples/physics-playground/Playground.protomake.json
```

Press **Play**, then click the game viewport. Move with A/D or left/right arrows; jump with Space. Gamepad left stick and the bottom face button are also mapped. The example has a moving platform, a pulsing marker and a sensor that changes the player's tint. Its four scripts are project assets; no engine code recognizes this example or any of its entity IDs.

Start testing with [TESTING-CHECKLIST.md](TESTING-CHECKLIST.md). Save your test project and export JSON when reporting a reproducible problem.

## Implemented

| Milestone | Working scope                                                                                                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0         | Strict TypeScript monorepo, entities/components, affine hierarchy, lifecycle/time/events, validated scenes, migrations, automated gates                                                                                                                  |
| 1         | Project/scene creation and metadata, hierarchy and Inspector, selection/multi-selection, marquee, pan/zoom/grid/snapping, explicit move/rotate/scale handles, parenting, duplication, clipboard, undo/redo, IndexedDB save/reopen, isolated Play context |
| 2         | PNG/JPEG/WebP import, text/JSON/TypeScript assets, GUID database, rename/move/delete checks, Pixi adapter, sprites with tint/opacity/flip/pivot/sorting, Camera2D, runtime rendering                                                                     |
| 3         | Real Rapier/WASM fixed-step simulation, static/dynamic/kinematic bodies, box/circle/capsule colliders, sensors/contact events, layer matrix, gravity, raycasts, debug lines, named keyboard/mouse/gamepad input                                          |
| 4         | Project TypeScript editing/compilation/module linking, ScriptBehaviour, exposed fields and entity references, lifecycle hooks, component/world/input/physics/scene access, collision/trigger callbacks, contextual Console errors, rebuild on Play       |

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

The suite includes 71 automated tests, with actual Rapier simulation and execution of compiled project modules. DOM tests exercise the full editor shell, Inspector and viewport event handlers; graphics are mocked in these DOM tests. GPU appearance, real file picking and input feel remain part of the browser acceptance checklist.

`npm run format` formats source/docs, and `npm run test:watch` runs tests interactively. CI configuration runs clean install, typecheck, lint/format/boundaries, tests and production build. Remote GitHub CI has not run because this repository has not been pushed to GitHub.

## Boundaries and limitations

- `npm run build` builds the **editor and its Play host**. It does not yet export a creator's game. Game export is Milestone 7.
- Script compilation reports syntax, static metadata and import/link errors. Full semantic project-script TypeScript checking belongs to an external TS editor/`tsc` for now. The engine, editor and checked-in example scripts are strictly typechecked.
- One ScriptBehaviour component is supported per entity. Compose behavior through local project modules when needed. Runtime imports must be relative project TS modules; acyclic imports are supported. External runtime packages, dynamic imports and Node APIs are unsupported in project scripts.
- Rebuild uses **Stop → edit/save script → Play**. Stateful hot replacement while running is not implemented.
- The same-origin iframe isolates ordinary runtime state and lifetime, **not malicious code**. Only press Play on trusted projects. Arbitrary creator code can access browser APIs and an infinite loop can block the tab.
- Physics supports non-sheared, nonzero transforms; circles/capsules require uniform scale. Dynamic bodies own their position/rotation. Use physics methods for velocity/impulse/teleport; transform-driven movement is for static/kinematic bodies.
- JSON exports embed asset bytes. Imports are capped at 20 MiB per file; browser quotas apply. Undo retains up to 100 project snapshots. This is intended for small-to-medium authoring sessions until profiled further.
- The highest-priority enabled camera renders; simultaneous multi-camera composition is deferred. Scene selection markers for non-rendering entities appear only in the editor.

See [architecture](ARCHITECTURE.md), [editor guide](docs/editor.md), [scripting guide](docs/scripting.md), [project format](docs/project-format.md), [runtime](docs/runtime.md), and [contributing](CONTRIBUTING.md).
