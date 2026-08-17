# Architecture

## Dependency ownership

| Package                | Dependencies            | Responsibility                                                             |
| ---------------------- | ----------------------- | -------------------------------------------------------------------------- |
| `@protomake/core`          | No third-party packages | Identity, components, world/hierarchy, affine math, events                 |
| `@protomake/serialization` | Core, Zod 4.3.6         | Scene/project schemas, validation, deterministic serialization, migrations |
| `@protomake/runtime`       | Core                    | Time and ordered system lifecycle                                          |
| Foundation example     | All three               | Browser host, authored fixture and verification UI                         |

The example uses DOM to display diagnostics. Core and runtime neither reference DOM nor render games. `scripts/check-boundaries.mjs` rejects imports against the allowed package graph during lint. The editor will be a separate consumer of data and runtime packages.

## State and identity

A `World` owns entities, GUID lookup, parent/children indexes and one sparse store per component type. Numeric IDs increase monotonically and are local to one world. Do not pass numeric IDs between worlds; resolve durable GUIDs in the target world. Destroyed handles throw on read/write. Destroying a parent destroys its subtree; callers can explicitly unparent children first if they need to survive.

Entity records and component values are immutable snapshots. Component writes validate and clone values before storing them. Systems iterate the relevant component index through `query` instead of scanning all entities. Query iterators are live Map iterators: defer structural mutation until after iteration if traversal must be stable. `components()` is a detached map for authoring/serialization, not a hot-path API.

`enabled` is local authored state; `isActive` walks ancestors. Systems decide whether their operation should filter inactive entities.

## Transforms

Each entity always has `protomake.transform`. The canonical local value is a six-number affine matrix `[a,b,c,d,tx,ty]`. `compose(x,y,rotation,sx,sy)` creates ordinary TRS data; rotation is radians. World matrices compose root-to-leaf. Matrix columns contain transformed basis vectors, and translation is world position. There is deliberately no ambiguous scalar world rotation/scale getter for a sheared transform.

Reparent with `local` preserves the local matrix; `world` preserves the full world matrix, including shear caused by rotated nonuniform scales. World-preserving reparenting to a singular or near-singular matrix throws before changing hierarchy. Zero-scale local transforms themselves are permitted. Cyclic parenting and missing parents throw. Traversal/destruction is iterative rather than recursive. World matrices are computed on demand: dirty caching is deferred until measured need.

## Runtime ownership

The host passes seconds to `Engine.tick`; no hidden animation-frame singleton exists. Systems register only while stopped and run in insertion order. Startup and reverse teardown define service lifetime. Fixed update occurs before update, then late update. Timing bounds prevent an unbounded catch-up loop. The browser example owns requestAnimationFrame.

`instantiateScene` creates a new independent world from validated serialized data. The isolation test verifies mutation cannot reach authored state. This establishes the data boundary for future Play Mode; an iframe/script security boundary is **not** implemented in Milestone 0.

## Trust and extensibility

Component schemas are explicit parsers; inspector metadata is registered alongside them. The serialization package uses strict Zod envelopes and delegates component payload validation to registered schemas. An unknown component is an error, not silently discarded. Registered parsers must be deterministic and return serializable plain data. This is trusted engine/plugin code, not arbitrary untrusted validation code.

Project JSON is data only; there is no script evaluation, compilation or module loading. Future script execution needs an explicit origin/isolation threat model. No `eval` or generated authoring layer exists.
