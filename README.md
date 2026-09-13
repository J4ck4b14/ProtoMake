# ProtoMake 0.16.2

A reusable, browser-native 2D engine and visual editor for human-authored projects.

**Milestones 0–7 and ProtoMake 0.9–0.16.2 are implemented.** ProtoMake 0.16.2 adds deterministic Unity project generation through a supported Editor importer. It reconstructs scenes/hierarchy, central-profile transforms, copied media, sprites, 2D physics/layers, cameras, audio, particles, Input System actions, AnimationClips/AnimatorControllers, and the portable Behaviour Graph runtime without using undocumented Unity scene YAML as its primary mechanism. Godot 4 export remains available from 0.16.1.

## Three prototype workshop

Read [ProtoMake-Prototype-Workshop.docx](docs/ProtoMake-Prototype-Workshop.docx) or its [Markdown source](docs/workshop.md). The 19-page guide explains reconstruction from a blank scene, exact entities/settings, scripts, tests, common mistakes and export.

After installing dependencies, run `npm run preview:prototypes` to open the launcher for **Signal Patrol** (shooter), **Lantern Steps** (platformer) and **Sparring Room** (two-player local fighter). Complete editable JSON projects and raw images/audio/scripts are in [examples/prototypes](examples/prototypes/README.md). These builds are included in the release archive.

Animation tools include clip playback/scrubbing, a proportional frame timeline, an automatic state graph and transition priority editing. [Light 2D](docs/lighting.md) offers ambient, point, spot and rectangular area types, static/mixed/dynamic mobility, screen-space surface falloff and rectangle shadow casters. Existing projects without active lights keep their previous appearance. ProtoMake does not yet provide normal-map lighting or HDR/bloom.

For a focused lighting/perception test, import [Lantern Shadow & Stealth Lab](examples/lighting-shadow-demo/README.md): it combines dim ambient fill, static/mixed/dynamic fixtures, channel masks, a carried torch, shadow-casting geometry, Perception 2D visualization and a guard using `ctx.canSee()` + `ctx.illumination()`.

## Start here

Extract the archive and open a terminal in the directory containing **package.json and package-lock.json**. This archive puts those files at its root; there is no extra `protomake` folder inside it.

Requires Node.js 22.12+ and npm 11.9.0 (validated with Node 24.19.0). Run:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The root page is the editor; `/foundation.html` retains the original Milestone 0 harness. If another server is still running, stop it or check the new URL carefully. IndexedDB project storage is scoped to browser and origin, including port. For optional account-backed project continuity, use `npm run dev:account`; see [account continuity](docs/account-sync.md).

In the editor click **Import project** and select:

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
| 0.10      | Multiple independently enabled script behaviours, friendly transforms, tags/queries, runtime prefab lifecycle, signals, timers, tweens, pointer/camera conversion and visual input authoring                                                             |
| 0.11      | Versioned Behaviour Graph assets, registered node definitions, typed ports, visual authoring, graph variables, shared runtime services and Play Mode execution highlighting                                                                              |
| 0.12      | DOM-backed runtime UI, flexible layout, text/image/controls, UI signals, named save profiles and slots, save migrations, integrity checks, autosave, achievements and persistent services                                                                |
| 0.13      | Sprite slicing and reusable regions, tile set/palette authoring, sparse layered tilemaps, animation/rules, chunked collision, Character Body 2D, camera follow/zones and shake                                                                           |
| 0.14      | Runtime hierarchy and property tuning, safe authoring Apply, Play From Here, scene restart, script recompile/restart, graph value inspection and per-system profiling                                                                                    |
| 0.15      | Particle emitters, animation events/cross-fades, bounded polyphonic and spatial audio, camera kick/zoom pulse, and rigid-body scripting conveniences                                                                                                     |
| 0.16      | Public release documentation, deterministic Interchange IR, target capability metadata, portability analysis, stable ID maps, coordinate conversion, manifests and diagnostics                                                                           |
| 0.16.1    | Deterministic Godot 4 project/scene generation, source media copying, input/audio setup, core 2D component reconstruction, portable Graph runtime and editor ZIP export                                                                                  |
| 0.16.2    | Unity 2022.3+ project output, supported Editor API importer, copied media, scenes, 2D physics, Input System actions, sprite animation/controllers, particles, Graph runtime and editor ZIP export                                                        |

## Editor Quality polish

- **Recovery + history:** project edits use the existing bounded undo/redo command history, while a separate rotating autosave/checkpoint journal and emergency snapshot protect against crashes without polluting undo.
- **Visual authoring:** light volumes/range handles, collider/trigger shapes, camera frames, shadow casters and Perception 2D cones are visible in the Scene view.
- **Lighting:** static/mixed/dynamic lights now have receiver/shadow channel masks, shadow opacity/bias/softness, cached static contributions and live profiling/debug heatmaps. `ctx.illumination()`, `ctx.lightAt()` and `ctx.canSee()` expose compatible gameplay primitives.
- **Editor colours:** Settings exposes accent and surface colours. Text/focus colours are derived automatically for readable contrast.
- **Scripts as assets:** the source editor adds line numbers, syntax colour, diagnostics/jump-to-error, `ctx` completion/API search, templates, exposed-field metadata, Ctrl/Cmd+S and protected drafts.
- **Project continuity:** Account is optional. The reference Node server has revision conflict protection plus expiring/revocable sessions, bounded auth attempts and storage quotas. Local IndexedDB and portable `.protomake.json` export/import remain independently available.
- **Mobile/tablet:** <=800 CSS px uses touch-sized panel tabs and explicit Scene controls; Scene view supports pinch zoom and the scripting workspace collapses cleanly on narrow/tablet layouts. Desktop retains the resizable multi-panel layout.

See [ProtoMake 0.9 Editor Quality](docs/editor-quality-0.9.md) for the implementation contracts.

## Public alpha: zero-cost hosting

ProtoMake can be hosted as a static site. **Save locally** writes projects to IndexedDB in the current browser; **Export backup** downloads a portable `.protomake.json`; **Import project** opens that file later or on another device. Accounts are therefore optional for the public alpha. A first-run notice explains the storage model instead of silently implying that browser storage is a cloud backup.

For a free launch, push the repository to GitHub and enable **Settings → Pages → GitHub Actions**. The checked-in Pages workflow verifies ProtoMake, builds `dist/`, and deploys it. Vite uses relative production paths, so a project URL such as `https://YOUR_USERNAME.github.io/ProtoMake/` works without a custom domain. See [zero-cost GitHub Pages deployment](docs/github-pages.md).

Before a public push, run `npm audit`, review current development-tool advisories, update deliberately, regenerate the lockfile, and rerun the complete launch verification. Build/test tooling is not served by the static production player, but the public repository should still record and address relevant advisories.

The early development-repository reflog format and milestone records are documented in [repository history and reflogs](docs/git-history.md); the public, human-readable timeline is in [HISTORY.md](HISTORY.md).

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

The suite includes 134 automated tests, with actual Rapier simulation, execution of compiled project modules, and deterministic Interchange/portability/Godot/Unity-generation checks. DOM tests exercise the full editor shell, Inspector, graph workspace, runtime UI, live-iteration inspector and viewport event handlers; graphics are mocked in these DOM tests. GPU appearance, real file picking, target-engine import, audio behavior and input feel remain part of the manual acceptance checklist.

`npm run format` formats source/docs, and `npm run test:watch` runs tests interactively. CI configuration runs clean install, typecheck, lint/format/boundaries, tests and production build. Remote GitHub CI has not run because this repository has not been pushed to GitHub.

## Boundaries and limitations

- **Build ZIP** exports the current project. **Preview build** runs those production files in a separate tab. `npm run build` builds the editor, Play host and reusable standalone player bundle. The included `examples/milestones-5-7/web-build/` is a generated game; `npm run preview:game` serves it independently. See [web build](docs/web-build.md).
- The included account server is a self-hostable reference backend, not a hosted production identity service. Cross-device use requires a reachable HTTPS deployment/reverse proxy. The reference server now includes basic auth rate limiting and quotas, but public deployment still needs durable sessions/database operations, backups, migrations, password recovery/email verification and operational monitoring as appropriate.
- Script compilation reports syntax, static metadata and import/link errors. Full semantic project-script TypeScript checking belongs to an external TS editor/`tsc` for now. The engine, editor and checked-in example scripts are strictly typechecked.
- Each entity can own multiple independently enabled TypeScript or Graph Behaviours with stable slot identities and exposed values. Runtime imports must be relative project TS modules; acyclic imports are supported. External runtime packages, dynamic imports and Node APIs are unsupported in project scripts.
- Scripts can be edited during Play; **Recompile** validates them and performs a fast scene restart. Stateful in-place class replacement is intentionally not claimed.
- The same-origin iframe isolates ordinary runtime state and lifetime, **not malicious code**. Only press Play on trusted projects. Arbitrary creator code can access browser APIs and an infinite loop can block the tab.
- Physics supports non-sheared, nonzero transforms; circles/capsules require uniform scale. Dynamic bodies own their position/rotation. Character Body 2D provides grounded/wall/ceiling state and move-and-slide; complex concave character shapes and tilemap object layers are deferred.
- JSON exports embed asset bytes. Imports are capped at 20 MiB per file; browser quotas apply. Undo retains up to 100 project snapshots. This is intended for small-to-medium authoring sessions until profiled further.
- The highest-priority enabled camera renders; simultaneous multi-camera composition is deferred. Scene selection markers for non-rendering entities appear only in the editor.

Prefabs do not yet support nested relationships or structural overrides. Animation remains sprite-based rather than skeletal; spatial audio is a lightweight 2D attenuation/pan model rather than HRTF. Export conservatively includes every project scene/asset. Detailed contracts are in [prefabs](docs/prefabs.md) and [animation/audio](docs/animation-audio.md).

See [architecture](ARCHITECTURE.md), [editor guide](docs/editor.md), [scripting guide](docs/scripting.md), [Developer Velocity 0.10](docs/developer-velocity-0.10.md), [Visual Logic 0.11](docs/visual-logic-0.11.md), [Game UI & Persistence 0.12](docs/game-ui-persistence-0.12.md), [2D Authoring 0.13](docs/authoring-2d-0.13.md), [Live Iteration 0.14](docs/live-iteration-0.14.md), [Game Feel 0.15](docs/game-feel-0.15.md), [Interchange and portability](docs/portability.md), [showcase](docs/showcase.md), [roadmap](docs/roadmap.md), [browser support](docs/browser-support.md), [versioning](docs/versioning.md), [lighting](docs/lighting.md), [account continuity](docs/account-sync.md), [GitHub Pages deployment](docs/github-pages.md), [project history](HISTORY.md), [project format](docs/project-format.md), [runtime](docs/runtime.md), [license](LICENSE), and [contributing](CONTRIBUTING.md).
