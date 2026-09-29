# ProtoMake

ProtoMake is a browser-native 2D game engine and visual editor built around portable, human-authored projects. The repository contains the editor, runtime/player, project scripting, physics, rendering, audio, animation, UI, persistence, visual logic, prefabs, export tooling, examples and automated tests.

## Highlights

- Scene and entity authoring with hierarchy, transforms, selection tools, snapping, undo/redo and IndexedDB project storage.
- PNG/JPEG/WebP, text, JSON, TypeScript, audio and animation assets with a GUID-based asset database.
- Pixi-based 2D rendering, cameras, particles, configurable lighting and shadow casters.
- Rapier 2D physics with rigid bodies, colliders, sensors, raycasts, character movement and contact events.
- TypeScript behaviours with exposed fields, entity references, lifecycle callbacks and editor diagnostics.
- Behaviour Graphs for visual game logic using the same runtime services as TypeScript behaviours.
- Prefabs with linked instances, inherited properties and per-property overrides.
- Runtime UI, named save profiles/slots, achievements and session-scoped state.
- Animation clips/controllers, audio sources, buses and lightweight spatial sound.
- Standalone web builds plus deterministic project export for Godot 4, Unity and Unreal Engine 5.
- Optional account-backed project continuity through the included reference server.

## Showcase

**The Luminous Vault: Blackward** is a three-room action-platforming vertical slice built around constrained visibility. It demonstrates lighting and stealth, melee and ranged combat, persistence across scene transitions, platforming, particles, UI, animation, camera feedback and achievements using ordinary editable project systems.

After installing dependencies, run `npm run dev`, then choose **Play showcase** to launch it or **Edit showcase** to inspect the project first. `npm run build` also publishes a standalone showcase build.

## Prototype workshop

The repository includes a step-by-step [prototype workshop](docs/workshop.md) and a formatted [DOCX version](docs/ProtoMake-Prototype-Workshop.docx). The guide rebuilds the included examples from a blank scene and covers assets, scripts, tests, common mistakes and export.

Run:

```sh
npm run build:prototypes
npm run preview:prototypes
```

This serves the showcase plus three focused teaching examples: **Signal Patrol** (shooter), **Lantern Steps** (platformer) and **Sparring Room** (two-player local fighter). Their editable projects, scripts and media live under [`examples/prototypes`](examples/prototypes/README.md).

For a focused lighting/perception example, see [`examples/lighting-shadow-demo`](examples/lighting-shadow-demo/README.md).

## Requirements

- Node.js 22.12 or newer
- npm 11.9 or newer

Install and start the editor:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The root page is the editor. `/foundation.html` is a compact systems harness used for low-level engine inspection.

To load the workshop project, choose **Import project** and select:

```text
examples/workshop/Workshop.protomake.json
```

Press **Play**, then focus the game viewport. Move with A/D or the arrow keys and jump with Space. Gamepad movement and jump are also mapped.

For optional account-backed continuity during local development, run:

```sh
npm run dev:account
```

See [account continuity](docs/account-sync.md) for the storage and conflict model.

## Repository layout

```text
packages/       Engine, editor and runtime packages
scripts/        Build, export, preview and example-generation tools
tests/          Automated regression and integration tests
examples/       Editable example projects and teaching material
public/         Static assets copied into web builds
docs/           Architecture and authoring documentation
```

The package split keeps runtime/editor boundaries explicit. Project scripts use the public runtime context instead of importing renderer or editor internals directly.

## Development commands

```sh
npm run typecheck   # strict TypeScript validation
npm run lint        # ESLint, Prettier check and package-boundary validation
npm test            # Vitest test suite
npm run build       # player, editor and showcase production builds
npm run preview     # preview the production editor build
npm run format      # apply repository formatting
npm run test:watch  # interactive test runner
```

CI performs a clean install, typecheck, lint/format/boundary checks, tests and a production build.

## Builds and export

**Build ZIP** exports the current project as a standalone web game. **Preview build** runs those production files separately from the editor. The workshop fixture can also be exported from the command line:

```sh
npm run build:player
npm run export:game -- examples/workshop/Workshop.protomake.json my-game
npm run preview:game -- my-game
```

ProtoMake also provides one-way project export for Godot 4, Unity and Unreal Engine 5 through the Interchange layer. Exporters report unsupported or partially portable features instead of silently changing project semantics. See [portability](docs/portability.md).

## Hosting

The editor can be hosted as a static site. **Save locally** stores projects in IndexedDB for the current browser/origin, while **Export backup** and **Import project** provide portable project files. Accounts are optional.

The checked-in GitHub Pages workflow verifies and builds the project before deployment. Vite uses relative production paths so the same build can work at a domain root or a repository subpath. See [GitHub Pages deployment](docs/github-pages.md).

## Important boundaries

- Project TypeScript is compiled and linked by ProtoMake, but full semantic project-script checking remains better suited to an external TypeScript editor/`tsc` workflow.
- Play Mode isolates ordinary runtime state and lifetime; it is not a security sandbox. Only run projects you trust.
- Physics assumes non-sheared, nonzero transforms. Circles and capsules require uniform scale.
- JSON project exports embed asset bytes, so browser storage quotas and import-size limits still apply.
- Runtime rendering uses the highest-priority enabled camera; simultaneous multi-camera composition is not provided.
- Prefabs do not support nested prefab relationships or structural overrides.
- Animation is sprite-based rather than skeletal, and spatial audio uses a lightweight 2D attenuation/pan model rather than HRTF.

## Documentation

- [Editor](docs/editor.md)
- [Runtime](docs/runtime.md)
- [Project scripting](docs/scripting.md)
- [Development workflow](docs/development-workflow.md)
- [Visual logic](docs/visual-logic.md)
- [Runtime UI and persistence](docs/ui-persistence.md)
- [2D authoring](docs/authoring-2d.md)
- [Live iteration](docs/live-iteration.md)
- [Game feel](docs/game-feel.md)
- [Lighting](docs/lighting.md)
- [Prefabs](docs/prefabs.md)
- [Animation and audio](docs/animation-audio.md)
- [Project format](docs/project-format.md)
- [Portability](docs/portability.md)
- [Web builds](docs/web-build.md)
- [Browser support](docs/browser-support.md)
- [Versioning policy](docs/versioning.md)
- [Verification](docs/verification.md)
- [Showcase](docs/showcase.md)
- [Prototype workshop](docs/workshop.md)

## License

See [LICENSE](LICENSE).
