# Project and scene format — schema v1

`ProjectData` has `schemaVersion`, UUID `id`, nonempty `name`, informational `engineVersion`, nullable `startupScene`, and embedded `scenes`. `SceneData` has its own `schemaVersion`, UUID `id`, `name`, and `entities`. Each entity has UUID `id`, `name`, `enabled`, nullable parent UUID, and a component map keyed by stable type ID. See `examples/foundation/scene.json` for a complete valid scene.

A Transform payload is `{ "local": [1, 0, 0, 1, 0, 0] }`. Each component type supplies its payload parser. Outer records reject unknown fields; malformed UUIDs, duplicate IDs, missing parents/transforms, cycles, unregistered components, invalid payloads, duplicate scenes and missing startup scenes fail with contextual errors.

Loading validates before constructing a fresh world; runtime numeric IDs are never serialized. Duplicate entity GUIDs across different scenes are permitted because their identity scope is the scene. Cross-scene entity references have not been defined.

`serializeScene` sorts entities by UUID and object keys lexically; hierarchy order has no serialized semantic meaning in v1. General array order is preserved. `serializeProject` preserves authored scene-list order. Output is two-space JSON with a trailing newline. Component values must be JSON-compatible plain data, without non-finite numbers, functions or cycles.

`MigrationChain` copies its input, checks schema versions, then runs registered one-version steps. Version 1 is the first real schema; it has no historical migration. Tests use synthetic versions only to verify chaining and rejection. Future project migrations must explicitly account for nested scene versions before the project envelope is validated.

Current projects are portable single JSON documents. File-system Assets/ProjectSettings layouts, GUID asset metadata, disk persistence, caches and exports belong to later milestones. `dist/` is disposable output of the harness build; it is never canonical project state. No fake asset folders are created.
