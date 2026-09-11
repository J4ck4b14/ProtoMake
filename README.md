# ProtoMake 0.9.3

A reusable, browser-native 2D engine and visual editor for human-authored projects.

**Milestones 0–7 plus the Editor Quality pass are implemented.** ProtoMake 0.9.3 is the public-alpha launch pass: it keeps the 0.9.2 reliability/authoring work and makes browser-local persistence, portable backups and zero-cost GitHub Pages deployment explicit. The editor includes recovery/undo discipline, visual gizmos, channel-aware lighting with quality/performance diagnostics, a stronger in-editor TypeScript workflow, reusable perception primitives, mobile/tablet usability and safer optional account continuity. It remains a development release with the documented scope below.

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

Before the first public push, apply the currently recommended dev-tool security upgrades and regenerate the lockfile with `npm install --save-dev vite@7.3.6 vitest@4.1.11 esbuild@0.28.2`, then rerun the launch verification. These packages are build/test tooling and are not served as a development server in production, but a public repository should not knowingly retain avoidable advisories.

The early development-repository reflog format and milestone records are documented in [repository history and reflogs](docs/git-history.md); the public, human-readable timeline is in [HISTORY.md](HISTORY.md).

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

The suite includes 106 automated tests, with actual Rapier simulation and execution of compiled project modules. DOM tests exercise the full editor shell, Inspector and viewport event handlers; graphics are mocked in these DOM tests. GPU appearance, real file picking, audio behavior and input feel remain part of the browser acceptance checklist.

`npm run format` formats source/docs, and `npm run test:watch` runs tests interactively. CI configuration runs clean install, typecheck, lint/format/boundaries, tests and production build. Remote GitHub CI has not run because this repository has not been pushed to GitHub.

## Boundaries and limitations

- **Build ZIP** exports the current project. **Preview build** runs those production files in a separate tab. `npm run build` builds the editor, Play host and reusable standalone player bundle. The included `examples/milestones-5-7/web-build/` is a generated game; `npm run preview:game` serves it independently. See [web build](docs/web-build.md).
- The included account server is a self-hostable reference backend, not a hosted production identity service. Cross-device use requires a reachable HTTPS deployment/reverse proxy. The reference server now includes basic auth rate limiting and quotas, but public deployment still needs durable sessions/database operations, backups, migrations, password recovery/email verification and operational monitoring as appropriate.
- Script compilation reports syntax, static metadata and import/link errors. Full semantic project-script TypeScript checking belongs to an external TS editor/`tsc` for now. The engine, editor and checked-in example scripts are strictly typechecked.
- One ScriptBehaviour component is supported per entity. Compose behavior through local project modules when needed. Runtime imports must be relative project TS modules; acyclic imports are supported. External runtime packages, dynamic imports and Node APIs are unsupported in project scripts.
- Rebuild uses **Stop → edit/save script → Play**. Stateful hot replacement while running is not implemented.
- The same-origin iframe isolates ordinary runtime state and lifetime, **not malicious code**. Only press Play on trusted projects. Arbitrary creator code can access browser APIs and an infinite loop can block the tab.
- Physics supports non-sheared, nonzero transforms; circles/capsules require uniform scale. Dynamic bodies own their position/rotation. Use physics methods for velocity/impulse/teleport; transform-driven movement is for static/kinematic bodies.
- JSON exports embed asset bytes. Imports are capped at 20 MiB per file; browser quotas apply. Undo retains up to 100 project snapshots. This is intended for small-to-medium authoring sessions until profiled further.
- The highest-priority enabled camera renders; simultaneous multi-camera composition is deferred. Scene selection markers for non-rendering entities appear only in the editor.

Prefabs do not yet support nested relationships or structural overrides. Animation transitions are immediate cuts; audio is non-spatial with one voice per source. Export conservatively includes every project scene/asset. Detailed contracts are in [prefabs](docs/prefabs.md) and [animation/audio](docs/animation-audio.md).

See [architecture](ARCHITECTURE.md), [editor guide](docs/editor.md), [lighting](docs/lighting.md), [scripting guide](docs/scripting.md), [account continuity](docs/account-sync.md), [polish-pass notes](docs/polish-pass.md), [0.9 editor quality](docs/editor-quality-0.9.md), [0.9.1 hotfix](docs/hotfix-0.9.1.md), [0.9.2 certification hotfix](docs/hotfix-0.9.2.md), [0.9.3 launch pass](docs/launch-0.9.3.md), [GitHub Pages deployment](docs/github-pages.md), [Git history/reflogs](docs/git-history.md), [project history](HISTORY.md), [project format](docs/project-format.md), [runtime](docs/runtime.md), and [contributing](CONTRIBUTING.md).
