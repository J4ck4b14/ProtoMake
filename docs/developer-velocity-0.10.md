# ProtoMake 0.10 Developer Velocity

ProtoMake 0.10 removes the single-script attachment limit and makes common runtime coordination available through shared engine services.

## Behaviour composition

`protomake.behaviours` contains an authored order plus identity-keyed behaviour records. Each record owns its enabled state, TypeScript asset and exposed values. IDs remain stable through save/load and prefab propagation; runtime ownership combines the entity GUID with the behaviour ID. Lifecycle teardown clears listeners, timers and tweens even when a script is replaced or its entity is destroyed.

The Inspector presents each behaviour separately. **Attach to selection** adds a slot instead of replacing an existing script.

## Runtime services

- `ctx.entities` provides tag, component, closest-tag and radius queries.
- `ctx.events` provides named signals with owner-scoped subscriptions.
- `ctx.time` provides one-shot and repeating timers driven by engine time.
- `ctx.tween` interpolates world transform properties and sprite opacity with cancellation and easing.
- `ctx.prefabs` creates validated prefab hierarchies and returns the spawned root GUID.
- `ctx.pointer` and `ctx.camera` expose screen/world coordinates without leaking renderer objects.

Spawned prefabs enter the same world queried by rendering, physics, animation, audio and scripting. Script lifecycle synchronization discovers new behaviour slots on the next phase. Destruction removes the full hierarchy; behaviour cleanup occurs during synchronization.

## Authoring improvements

Transform remains a six-number affine matrix in project data. The normal Inspector exposes Position X/Y, Rotation in degrees and Scale X/Y; an Advanced section retains direct matrix access. TRS edits preserve residual shear.

Tags use comma-separated identifier-like names in the Inspector and a maintained runtime index. Entity names remain organizational and `ctx.find` remains available for simple projects, but tags and explicit references are the preferred gameplay lookup mechanisms.

Project Settings now provides action maps and per-action controls for type, bindings, sensitivity, dead zone and axis inversion. Project schema v5 migrates older action records with compatible defaults.

## Acceptance coverage

`tests/developer-velocity.test.ts` composes independent behaviours that move a player, read pointer world coordinates, emit a trigger signal, tween a door, close it through a timer, spawn a prefab enemy and find it through an `Enemy` tag. It also covers disabled behaviour lifecycle, transform decomposition, spatial queries and input-map processing.
