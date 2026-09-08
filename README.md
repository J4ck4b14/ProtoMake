# ProtoMake 0.7.0 — preview and authoring patch

A reusable, browser-native 2D engine and visual editor for human-authored projects.

**Milestones 0–7 are implemented.** This patch addresses the reported standalone startup hang and animation editing discoverability. This is a development checkpoint, not a finished general-purpose engine release.

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
examples/milestones-5-7/Workshop.protomake.json
```

Press **Play**, then click the game viewport. Move with A/D or left/right arrows; jump with Space. Gamepad left stick and the bottom face button are also mapped. The example adds ten linked prefab enemies, parameter-driven sprite animation and a jumping sound to the physics playground. Its mechanics are ordinary project scripts and assets.

Drag the panel dividers to resize your workspace. Assets now has real folders, and the Hierarchy has a Group selection command.

Start testing with [TESTING-CHECKLIST.md](TESTING-CHECKLIST.md). Save your test project and export JSON when reporting a reproducible problem.

## Implemented

| Milestone | Working scope                                                                                                                                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0         | Strict TypeScript monorepo, entities/components, affine hierarchy, lifecycle/time/events, validated scenes, migrations, automated gates                                                                                                                  |
| 1         | Project/scene creation and metadata, hierarchy and Inspector, selection/multi-selection, marquee, pan/zoom/grid/snapping, explicit move/rotate/scale handles, parenting, duplication, clipboard, undo/redo, IndexedDB save/reopen, isolated Play context |
| 2         | PNG/JPEG/WebP import, text/JSON/TypeScript assets, GUID database, rename/move/delete checks, Pixi adapter, sprites with tint/opacity/flip/pivot/sorting, Camera2D, runtime rendering                                                                     |
| 3         | Real Rapier/WASM fixed-step simulation, static/dynamic/kinematic bodies, box/circle/capsule colliders, sensors/contact events, layer matrix, gravity, raycasts, debug lines, named keyboard/mouse/gamepad input                                          |
| 4         | Project TypeScript editing/compilation/module linking, ScriptBehaviour, exposed fields and entity references, lifecycle hooks, component/world/input/physics/scene access, collision/trigger callbacks, contextual Console errors, rebuild on Play       |
| 5         | Linked hierarchy prefabs, inherited base properties, tokenized overrides, per-property apply/revert, propagation across scenes, Inspector indicators                                                                                                     |
| 6         | Ordered sprite frames, clip/state playback, bool/float/int/trigger parameters, transitions, frame/state editor forms, AudioSource, WAV/MP3/OGG import, Web Audio mixer and buses                                                                         |
| 7         | Separate production player, compiled project JS modules, dependency report, Build ZIP, standalone production preview and static-hosting instructions                                                                                                     |

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

The suite includes 95 automated tests, with actual Rapier simulation and execution of compiled project modules. DOM tests exercise the full editor shell, Inspector and viewport event handlers; graphics are mocked in these DOM tests. GPU appearance, real file picking and input feel remain part of the browser acceptance checklist.

`npm run format` formats source/docs, and `npm run test:watch` runs tests interactively. CI configuration runs clean install, typecheck, lint/format/boundaries, tests and production build. Remote GitHub CI has not run because this repository has not been pushed to GitHub.

## Boundaries and limitations

- **Build ZIP** exports the current project. **Preview build** runs those production files in a separate tab. `npm run build` builds the editor, Play host and reusable standalone player bundle. The included `examples/milestones-5-7/web-build/` is a generated game; `npm run preview:game` serves it independently. See [web build](docs/web-build.md).
- Script compilation reports syntax, static metadata and import/link errors. Full semantic project-script TypeScript checking belongs to an external TS editor/`tsc` for now. The engine, editor and checked-in example scripts are strictly typechecked.
- One ScriptBehaviour component is supported per entity. Compose behavior through local project modules when needed. Runtime imports must be relative project TS modules; acyclic imports are supported. External runtime packages, dynamic imports and Node APIs are unsupported in project scripts.
- Rebuild uses **Stop → edit/save script → Play**. Stateful hot replacement while running is not implemented.
- The same-origin iframe isolates ordinary runtime state and lifetime, **not malicious code**. Only press Play on trusted projects. Arbitrary creator code can access browser APIs and an infinite loop can block the tab.
- Physics supports non-sheared, nonzero transforms; circles/capsules require uniform scale. Dynamic bodies own their position/rotation. Use physics methods for velocity/impulse/teleport; transform-driven movement is for static/kinematic bodies.
- JSON exports embed asset bytes. Imports are capped at 20 MiB per file; browser quotas apply. Undo retains up to 100 project snapshots. This is intended for small-to-medium authoring sessions until profiled further.
- The highest-priority enabled camera renders; simultaneous multi-camera composition is deferred. Scene selection markers for non-rendering entities appear only in the editor.

Prefabs do not yet support nested relationships or structural overrides. Animation transitions are immediate cuts; audio is non-spatial with one voice per source. Export conservatively includes every project scene/asset. Detailed contracts are in [prefabs](docs/prefabs.md) and [animation/audio](docs/animation-audio.md).

See [architecture](ARCHITECTURE.md), [editor guide](docs/editor.md), [scripting guide](docs/scripting.md), [project format](docs/project-format.md), [runtime](docs/runtime.md), and [contributing](CONTRIBUTING.md).
