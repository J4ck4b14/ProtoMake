# Project and scene formats

The current project schema is **v4**; the scene schema remains **v1**. Engine release 0.8.0 is independent of these schema numbers.

| Project version | Added data                                                                           | Migration                              |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| 1               | Project identity, name, informational engine version, startup scene, embedded scenes | Original Milestone 0 format            |
| 2               | Embedded GUID-addressed image/text assets                                            | v1 → v2 adds an empty asset collection |
| 3               | Gravity, physics layers/matrix and input actions                                     | v2 → v3 adds working defaults          |
| 4               | Folder paths, scene folder assignments, audio mixer buses                            | v3 → v4 adds defaults                  |

Scene v1 contains schemaVersion, UUID id, name and entities. Each entity has UUID id, name, enabled, nullable parent UUID and component payloads keyed by stable type ID. Numeric runtime handles never enter serialized data. Transform stores a six-number affine matrix. New registered component types do not require changing the outer scene envelope.

Asset records contain id, relative path, kind, MIME type, data, width and height. Image data is a base64 data URL; text data is source text. Paths are case-insensitive for uniqueness, cannot traverse directories and are organizational only. Sprite/script component references use UUIDs. Text types include plain text, JSON and TypeScript. PNG/JPEG/WebP images are supported; SVG/HTML assets are excluded.

Loaded envelopes reject unknown fields, malformed UUIDs, duplicate identities, cycles, missing parents/transforms, unregistered components, invalid component payloads, missing startup scenes, missing/incompatible asset references, undefined physics layers and malformed collision/input definitions. Registered component parsers validate payloads. Script compilation and exposed-entity-reference validation add contextual errors before execution.

Canonical scene serialization sorts entities by UUID and object keys lexically. General arrays, including project scene order, preserve authored order. Output is two-space JSON with a trailing newline. Values must be plain JSON-compatible data, without non-finite numbers, functions or cycles.

IndexedDB stores the complete project transactionally. The active editor scene is stored alongside the project record, separate from the game's startup scene. Selection, viewport and undo history are session state. JSON export contains the project and asset bytes; it does not contain editor history or browser storage internals.

`examples/milestones-5-7/Workshop.protomake.json` is a complete current project. The previous physics-playground example remains a migration fixture. Its checked-in Images and Scripts directories also provide convenient individual files for import and editing. The JSON is the portable authored project; it is not generated engine geometry. `dist/` and node_modules are disposable and excluded from delivery.

Milestone 5–7 migration: schema 3 → 4 adds `folders`, `sceneFolders` (scene GUID → folder path), and `mixer`. Existing v1–v3 projects migrate sequentially. Panel sizes are local preferences and never enter project JSON. Prefabs, AnimationClips and Animator controllers are typed text assets; AudioClips embed their imported bytes. Current engineVersion is 0.8.0.

Release 0.8 lighting now includes defaulted Sprite Renderer fields `lit` and `castShadow`, `protomake.light.mobility` (`static | mixed | dynamic`), and the optional `protomake.shadowCaster` rectangle component. Older component payloads receive defaults during registered-component parsing; projects without active lights render as before. These additions do not change the enclosing project schema version. Editor appearance/account state remain browser preferences/services and are not serialized into project JSON.
