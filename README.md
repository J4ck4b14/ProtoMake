# ProtoMake

A browser-native 2D engine under construction, designed for human-authored games.

**Status: Milestone 0 — foundation implemented.** This repository is not yet a general-purpose game engine or visual editor. The browser application is an executable foundation harness. Milestones 1–7 remain unimplemented.

## Run

Requires Node.js 22.12+ (validated on 24.19.0), npm 11.9.0, and a modern browser. From this directory:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Click **Run acceptance check** to validate scene instantiation and a deterministic serialization round trip. Start/Pause/Step/Resume/Stop exercise the real runtime lifecycle. The counter is an example system, not game logic in engine core.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

`npm install` also works for initial setup. `npm ci` reproduces the committed lockfile. `npm run format` formats source and docs; `npm run test:watch` runs tests during development. Development and preview bind loopback by default; explicitly pass `--host 0.0.0.0` if network access is needed.

## Implemented

- Three private npm workspaces with enforced dependency direction.
- World-local, non-recycled numeric entity IDs and durable UUID identities.
- Extensible component registry, validation contracts, inspector metadata and sparse component stores.
- Validated, immutable component snapshots; explicit component writes.
- Required affine Transform, indexed hierarchy, inherited enabled state, cycle rejection, subtree destruction and world-preserving reparenting.
- Typed synchronous events with unsubscribe and explicit error propagation.
- Deterministic system lifecycle with fixed updates, bounded catch-up, pause, step and teardown.
- Strict versioned scene/project schemas, deterministic JSON, isolated scene instantiation and migration infrastructure.
- Automated acceptance, regression and runtime tests; lint, formatting, typecheck and production-build CI configuration.

The fixture in `examples/foundation/scene.json` is authored data. No level geometry is encoded in engine TypeScript.

## First acceptance criterion

`tests/core.test.ts` creates two entities, attaches a custom component, sets local transforms, parents the child, serializes and restores the scene, and checks identical canonical output and world transforms. Additional tests cover invalid content, cleanup, singular transforms, deep hierarchy and runtime-state isolation.

## Scope boundary

There is no visual editor, asset database, PixiJS renderer, Rapier physics, input mapping, project scripting, prefab system, animation, audio, persistent editor storage or game exporter yet. Vite's production output builds the **foundation harness**, not a creator's game. The editor is Milestone 1; rendering/assets are Milestone 2.

Current workspaces export TypeScript source for this repository's Vite/test tooling. They are private packages, not separately published npm libraries. `ComponentStore` uses sparse maps; a packed representation and cached world matrices require profiling before adoption.

See [ARCHITECTURE.md](ARCHITECTURE.md), [CONTRIBUTING.md](CONTRIBUTING.md), [project format](docs/project-format.md), [components](docs/components.md), [runtime](docs/runtime.md) and [verification](docs/verification.md).
