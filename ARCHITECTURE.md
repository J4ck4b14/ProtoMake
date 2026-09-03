# Architecture

## Dependency ownership

| Package                | Dependencies                                                         | Responsibility                                                                   |
| ---------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `@protomake/core`          | None                                                                 | Identity, component registry/stores, world/hierarchy, math, events               |
| `@protomake/assets`        | Core, Zod                                                            | Asset records, GUID/path indexes, import/dependency checks                       |
| `@protomake/input`         | Zod                                                                  | Action schemas and keyboard/mouse/gamepad state                                  |
| `@protomake/runtime`       | Core                                                                 | Time and ordered system lifecycle                                                |
| `@protomake/physics2d`     | Core, runtime types, Zod, Rapier adapter                             | Physics configuration, components and simulation                                 |
| `@protomake/renderer`      | Core, assets, Zod, Pixi adapter                                      | Sprite/camera data and rendering contract                                        |
| `@protomake/serialization` | Core, assets, physics/input schemas, Zod                             | Strict project/scene validation and migrations                                   |
| `@protomake/scripting`     | Core, runtime, assets, input/physics types, TypeScript compiler, Zod | Script data, compilation/linking and behavior lifecycle                          |
| `@protomake/editor`        | Public engine packages                                               | Authoring model, viewport, Inspector, persistence, project scripts and Play host |

The import-boundary checker runs during lint. Adapter and compiler subpaths keep schema contracts distinct from implementation. Editor UI is DOM; game rendering is Pixi. Core/runtime have no editor DOM knowledge. The Play host coordinates rendering, simulation, scripting and input without implementing those systems itself.

## State and identity

A `World` owns entities, GUID lookup, parent/children indexes and one sparse store per component type. Numeric IDs increase monotonically and are local to one world. Do not pass numeric IDs between worlds; resolve durable GUIDs in the target world. Destroyed handles throw on read/write. Destroying a parent destroys its subtree; callers can explicitly unparent children first if they need to survive.

Entity records and component values are immutable snapshots. Component writes validate and clone values before storing them. Systems iterate the relevant component index through `query` instead of scanning all entities. Query iterators are live Map iterators: defer structural mutation until after iteration if traversal must be stable. `components()` is a detached map for authoring/serialization, not a hot-path API.

`enabled` is local authored state; `isActive` walks ancestors. Systems decide whether their operation should filter inactive entities.

## Transforms

Each entity always has `protomake.transform`. The canonical local value is a six-number affine matrix `[a,b,c,d,tx,ty]`. `compose(x,y,rotation,sx,sy)` creates ordinary TRS data; rotation is radians. World matrices compose root-to-leaf. Matrix columns contain transformed basis vectors, and translation is world position. There is deliberately no ambiguous scalar world rotation/scale getter for a sheared transform.

Reparent with `local` preserves the local matrix; `world` preserves the full world matrix, including shear caused by rotated nonuniform scales. World-preserving reparenting to a singular or near-singular matrix throws before changing hierarchy. Zero-scale local transforms themselves are permitted. Cyclic parenting and missing parents throw. Traversal/destruction is iterative rather than recursive. World matrices are computed on demand: dirty caching is deferred until measured need.

## Runtime ownership

The host passes seconds to `Engine.tick`; no hidden animation-frame singleton exists. Systems register only while stopped and run in insertion order. Startup and reverse teardown define service lifetime. Fixed update occurs before update, then late update. Timing bounds prevent an unbounded catch-up loop. The browser example owns requestAnimationFrame.

`instantiateScene` creates a new independent world from validated serialized data. The isolation test verifies mutation cannot reach authored state. This establishes the data boundary for future Play Mode; the editor now executes Play in a separate iframe. This is data/lifetime isolation, not a hostile-code security boundary.

## Trust and extensibility

Component parsers and inspector metadata are explicit. The serializer validates envelopes and invokes registered schemas. Unknown components fail rather than disappearing. Physics/rendering/scripting components are registered by the editor without game-specific core logic.

Project TS source stays in authored assets and executes on Play only. Static field metadata is parsed without evaluation. Runtime code receives explicit context services and may call public entity/component APIs. The same-origin iframe runs trusted developer code and can access browser APIs; it does not safely contain malicious or nonterminating code. See docs/scripting.md for compiler and trust limits.

## Editor mutations

EditorModel owns authored project/world state, selection and command history. History stores before/after snapshots for transactions; pointer gestures mutate only the working world until committed as one command. Invalid operations restore the prior snapshot. Asset bytes are serialized only on authoring/storage operations, never as part of the runtime frame loop.

SceneViewport owns camera navigation, selection geometry and gizmos. Inspector derives controls from component metadata, extending ScriptBehaviour fields from static project metadata. ProjectStorage owns IndexedDB transactions and separate active-scene metadata. PlayMode exchanges cloned project data with an iframe; removing it discards runtime changes.
