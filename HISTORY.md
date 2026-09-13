# ProtoMake development history

This file summarizes the development milestones represented by the Git commit graph. It is intentionally versioned with the project; local reflogs under `.git/logs/` are recovery metadata and are not part of the published repository history.

| Stage                | Development step                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Milestone 0          | Strict TypeScript foundation, entities/components, transforms, lifecycle, validation and workspace/CI scaffolding                                                                                         |
| Milestone 1          | Scene editor, hierarchy/inspector/viewport authoring, undo/redo history and local project persistence                                                                                                     |
| Milestone 2          | Durable image assets, Pixi rendering, sprite/camera components and deterministic render ordering                                                                                                          |
| Milestone 3          | Rapier 2D physics, colliders/sensors/raycasts and keyboard/gamepad input actions                                                                                                                          |
| Milestone 4          | Project-authored TypeScript scripts, runtime lifecycle callbacks, script diagnostics and the acceptance playground                                                                                        |
| Milestones 5–7       | Animation/Animator authoring, audio/mixer controls, prefabs/overrides, project folders, resizable workspace and standalone export                                                                         |
| Player/animation fix | Standalone-player startup fix, loading/error UI, lifecycle hardening and animation/media authoring improvements                                                                                           |
| ProtoMake 0.8            | Platformer/shooter/local-fighter prototypes, initial 2D lighting foundation, workshop material and expanded acceptance coverage                                                                           |
| ProtoMake 0.9            | Static/mixed/dynamic lighting, shadows, lighting channels, stealth/perception primitives, recovery, gizmos, script editor/metadata, mobile workspace and optional account sync                            |
| ProtoMake 0.9.1          | Shadow-caster identifier migration, cross-platform ZIP verification, account-server lint fixes and Vite hotfix                                                                                            |
| ProtoMake 0.9.2          | Corrected partial-shadow regression coverage and final certification metadata                                                                                                                             |
| ProtoMake 0.9.3          | Explicit local-save/backup terminology, first-run storage guidance, relative-path production hosting, GitHub Pages deployment automation, repository-history documentation and public-alpha launch polish |
| ProtoMake 0.10           | Multiple behaviours, TRS-first transforms, tags and runtime queries, prefab spawning, signals, timers, tweens, pointer/camera coordinates and visual Input Action authoring                               |
| ProtoMake 0.11           | Versioned Behaviour Graphs, typed registered nodes, shared script/graph runtime services, visual graph authoring and Play Mode execution traces                                                           |
| ProtoMake 0.12           | Accessible runtime UI, flexible screen layout, save profiles/slots/migrations, autosave, achievements and project-persistent game services                                                                |
| ProtoMake 0.13           | Sprite regions, tilemap palette/rules/animation, chunked tile collision, Character Body 2D and reusable camera follow/zone behaviours                                                                     |
| ProtoMake 0.14           | Live runtime hierarchy/property tuning, safe authoring Apply, Play From Here, scene restart, script recompile/restart, graph values and per-system profiling                                              |
| ProtoMake 0.15           | Particle emitters, animation events/cross-fades, polyphonic/spatial audio, camera impact effects and rigid-body scripting conveniences                                                                    |
| ProtoMake 0.16           | Public release foundation, deterministic Interchange IR, target capability analysis, stable ID maps, centralized coordinate conversion, manifests and diagnostics                                         |
| ProtoMake 0.16.1         | Deterministic Godot 4 project/scene export, copied media, core 2D reconstruction, generated input/audio configuration and portable Behaviour Graph runtime                                                |
| ProtoMake 0.16.2         | Unity project output with a supported Editor API importer for media, scenes, physics, Input System actions, sprite animation/controllers, particles and portable Graphs                                   |

For the difference between published commits and local reflogs, see [docs/git-history.md](docs/git-history.md).
