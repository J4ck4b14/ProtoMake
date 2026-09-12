# Architecture

## Dependency ownership

| Package                | Dependencies                                                          | Responsibility                                                                   |
| ---------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `@protomake/core`          | None                                                                  | Identity, component registry/stores, world/hierarchy, math, events               |
| `@protomake/assets`        | Core, Zod                                                             | Asset records, GUID/path indexes, import/dependency checks                       |
| `@protomake/input`         | Zod                                                                   | Action schemas and keyboard/mouse/gamepad state                                  |
| `@protomake/runtime`       | Core                                                                  | Time, ordered lifecycle, signals, timers and tweens                              |
| `@protomake/physics2d`     | Core, runtime types, Zod, Rapier adapter                              | Physics configuration, components and simulation                                 |
| `@protomake/renderer`      | Core, assets, Zod, Pixi adapter                                       | Sprite/camera data and rendering contract                                        |
| `@protomake/serialization` | Core, assets, physics/input/prefab/animation/audio/graph schemas, Zod | Strict project/scene validation and migrations                                   |
| `@protomake/scripting`     | Core, runtime, assets, input/physics types, TypeScript compiler, Zod  | Script data, compilation/linking and behavior lifecycle                          |
| `@protomake/graphs`        | Core, assets, scripting/physics types, Zod                            | Behaviour Graph schema, typed node registry and shared-context execution         |
| `@protomake/prefabs`       | Core, Zod                                                             | Linked hierarchy identity, property patches and propagation                      |
| `@protomake/animation`     | Core, assets, runtime types, renderer, Zod                            | Clips, controllers, parameter evaluation and playback                            |
| `@protomake/audio`         | Core, assets, runtime types, Zod                                      | AudioSource, decoded buffers and Web Audio bus routing                           |
| `@protomake/player`        | Runtime engine packages                                               | Shared GameSession composition and standalone player                             |
| `@protomake/editor`        | Public engine packages                                                | Authoring model, viewport, Inspector, persistence, project scripts and Play host |

The import-boundary checker runs during lint. Adapter and compiler subpaths keep schema contracts distinct from implementation. Editor UI is DOM; game rendering is Pixi. Core/runtime have no editor DOM knowledge. The Play host coordinates rendering, simulation, scripting and input without implementing those systems itself.

## State and identity

A `World` owns entities, GUID lookup, parent/children indexes and one sparse store per component type. Numeric IDs increase monotonically and are local to one world. Do not pass numeric IDs between worlds; resolve durable GUIDs in the target world. Destroyed handles throw on read/write. Destroying a parent destroys its subtree; callers can explicitly unparent children first if they need to survive.

Entity records and component values are immutable snapshots. Component writes validate and clone values before storing them. Systems iterate the relevant component index through `query` instead of scanning all entities. Query iterators are live Map iterators: defer structural mutation until after iteration if traversal must be stable. `components()` is a detached map for authoring/serialization, not a hot-path API.

`enabled` is local authored state; `isActive` walks ancestors. Lightweight `protomake.tags` data is indexed by `World`, which supplies component, tag, nearest-tag and radius queries without putting game semantics into core.

## Transforms

Each entity always has `protomake.transform`. The canonical local value is a six-number affine matrix `[a,b,c,d,tx,ty]`. `compose(x,y,rotation,sx,sy)` creates ordinary TRS data; rotation is radians. World matrices compose root-to-leaf. Matrix columns contain transformed basis vectors, and translation is world position. There is deliberately no ambiguous scalar world rotation/scale getter for a sheared transform.

Reparent with `local` preserves the local matrix; `world` preserves the full world matrix, including shear caused by rotated nonuniform scales. World-preserving reparenting to a singular or near-singular matrix throws before changing hierarchy. Zero-scale local transforms themselves are permitted. Cyclic parenting and missing parents throw. Traversal/destruction is iterative rather than recursive. World matrices are computed on demand: dirty caching is deferred until measured need.

## Runtime ownership

The host passes seconds to `Engine.tick`; no hidden animation-frame singleton exists. Systems register only while stopped and run in insertion order. Startup and reverse teardown define service lifetime. Fixed update occurs before update, then late update. Timing bounds prevent an unbounded catch-up loop. The browser example owns requestAnimationFrame.

`instantiateScene` creates a new independent world from validated serialized data. The isolation test verifies mutation cannot reach authored state. The editor executes Play in a separate iframe. This is data/lifetime isolation, not a hostile-code security boundary.

## Trust and extensibility

Component parsers and inspector metadata are explicit. The serializer validates envelopes and invokes registered schemas. Unknown components fail rather than disappearing. Physics/rendering/scripting components are registered by the editor without game-specific core logic.

Project TS source and Behaviour Graph data stay in authored assets and execute on Play only. `protomake.behaviours` stores ordered, identity-keyed slots so each TypeScript or Graph Behaviour has independent enable state, values and lifecycle. Both forms receive the same `ScriptContext`; registered graph nodes cannot introduce a parallel service layer. Runtime services are owner-scoped, so destroying a behaviour removes its signal listeners, timers and tweens. Static script field metadata is parsed without evaluation. See docs/scripting.md and docs/visual-logic-0.11.md for authoring and trust limits.

## Editor mutations

EditorModel owns authored project/world state, selection and command history. History stores before/after snapshots for transactions; pointer gestures mutate only the working world until committed as one command. Invalid operations restore the prior snapshot. Asset bytes are serialized only on authoring/storage operations, never as part of the runtime frame loop.

SceneViewport owns camera navigation, selection geometry and gizmos. Inspector derives ordinary controls from component metadata and provides specialized TRS, tag and multi-behaviour authoring. ProjectStorage owns IndexedDB transactions and separate active-scene metadata. PlayMode exchanges cloned project data with an iframe; removing it discards runtime changes.

## Production boundary

The player registry subpath contains component data contracts without importing rendering adapters or the compiler. GameSession composes services for both hosts. Editor Play compiles source to Blob modules; Build compiles it to static ES module files. The standalone player imports those files directly and has no editor UI or TypeScript compiler dependency. scripts/build-player.mjs checks its bundled module graph before writing the runtime manifest.
