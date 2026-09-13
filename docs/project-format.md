# Project and scene formats

The current project schema is **v9**; the scene schema remains **v1**. Engine releases are independent of these schema numbers.

| Project version | Added data                                                                           | Migration                              |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| 1               | Project identity, name, informational engine version, startup scene, embedded scenes | Original Milestone 0 format            |
| 2               | Embedded GUID-addressed image/text assets                                            | v1 → v2 adds an empty asset collection |
| 3               | Gravity, physics layers/matrix and input actions                                     | v2 → v3 adds working defaults          |
| 4               | Folder paths, scene folder assignments, audio mixer buses                            | v3 → v4 adds defaults                  |
| 5               | Stable multi-behaviour slots and per-slot enabled state                              | v4 → v5 converts `protomake.script` data   |
| 6               | Behaviour Graph assets and Graph Behaviour slots                                     | v5 → v6 updates engine metadata        |
| 7               | Persistence settings and achievement definitions                                     | v6 → v7 adds safe defaults             |
| 8               | ProtoMake 0.13 2D authoring generation                                                   | v7 → v8 updates engine metadata        |
| 9               | ProtoMake 0.14 live-iteration generation                                                 | v8 → v9 updates engine metadata        |

Scene v1 contains schemaVersion, UUID id, name and entities. Each entity has UUID id, name, enabled, nullable parent UUID and component payloads keyed by stable type ID. Numeric runtime handles never enter serialized data. Transform stores a six-number affine matrix. New registered component types do not require changing the outer scene envelope.

Asset records contain id, relative path, kind, MIME type, data, width and height. Image data is a base64 data URL; text data is source text. Paths are case-insensitive for uniqueness, cannot traverse directories and are organizational only. Sprite and behaviour script references use UUIDs. Text types include plain text, JSON and TypeScript. PNG/JPEG/WebP images are supported; SVG/HTML assets are excluded.

Loaded envelopes reject unknown fields, malformed UUIDs, duplicate identities, cycles, missing parents/transforms, unregistered components, invalid component payloads, missing startup scenes, missing/incompatible asset references, undefined physics layers and malformed collision/input definitions. Registered component parsers validate payloads. Script compilation and exposed-entity-reference validation add contextual errors before execution.

Canonical scene serialization sorts entities by UUID and object keys lexically. General arrays, including project scene order, preserve authored order. Output is two-space JSON with a trailing newline. Values must be plain JSON-compatible data, without non-finite numbers, functions or cycles.

IndexedDB stores the complete project transactionally. The active editor scene is stored alongside the project record, separate from the game's startup scene. Selection, viewport and undo history are session state. In ProtoMake 0.9.3 the UI names this operation **Save locally** to make its scope explicit. **Export backup** writes the project and asset bytes to a portable `.protomake.json`; it does not contain editor history or browser storage internals. **Import project** validates that portable JSON before replacing the current editor state. Browser-local saves are scoped to the hosting origin, while exported files are independent of the site URL.

`examples/milestones-5-7/Workshop.protomake.json` is a complete current project. The previous physics-playground example remains a migration fixture. Its checked-in Images and Scripts directories also provide convenient individual files for import and editing. The JSON is the portable authored project; it is not generated engine geometry. `dist/` and node_modules are disposable and excluded from delivery.

Schema 4 → 5 replaces the single `protomake.script` payload with `protomake.behaviours`: an ordered identity list and an object keyed by stable behaviour IDs. Existing script data, exposed values and prefab override paths migrate together. Prefab instance copies retain source behaviour IDs within their entity scope, so override paths remain deterministic. Schema 5 → 6 introduces Graph Behaviour slots and versioned Behaviour Graph assets. Schema 6 → 7 adds persistence version/autosave settings and achievement definitions. Schema 7 → 8 marks the 0.13 2D authoring generation; its assets and components remain separately versioned. Schema 8 → 9 marks the 0.14 live-iteration generation without changing authored scene payloads. Existing v1–v8 projects migrate sequentially. Current engineVersion is 0.14.0.

Sprite-region assets reference one immutable source image and store a pixel rectangle, normalized pivot, filtering and atlas label. Tile-set assets store stable tile IDs, image/region references, collision flags, animation frames and neighbour rules. `protomake.tilemap` stores cell size, chunk size, collision layer and ordered sparse layers keyed by signed `x,y` coordinates.

Release 0.8 lighting now includes defaulted Sprite Renderer fields `lit` and `castShadow`, `protomake.light.mobility` (`static | mixed | dynamic`), and the optional `protomake.shadow-caster` rectangle component. Older component payloads receive defaults during registered-component parsing; projects without active lights render as before. ProtoMake 0.9.3 also accepts the briefly shipped `protomake.shadowCaster` key on import/recovery and canonicalizes it to `protomake.shadow-caster` on the next validated save. These additions do not change the enclosing project schema version. Editor appearance/account state remain browser preferences/services and are not serialized into project JSON.
