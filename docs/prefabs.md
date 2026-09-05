# Prefabs

Select a single entity hierarchy and choose **Create prefab** in Assets. The selected hierarchy becomes the first linked instance. Select that prefab asset and choose **Instantiate prefab** to create more instances. Move them with normal scene tools.

The Inspector shows the prefab asset, override count, highlighted property fields and individual tokenized paths. **Revert** restores one inherited property. **Apply to base** publishes one override to the base and propagates it across every project scene. **Revert instance** reverts the whole linked hierarchy while preserving the root's placement. Root placement cannot be applied to the base. **Unpack instance** removes the relationship, preserving the resolved scene entities.

To edit the shared sprite, change a linked instance's sprite property, then use that property's **Apply to base**. This is the usual visual workflow. **Edit prefab base** additionally exposes the serialized hierarchy for advanced edits. Preserve its IDs and root identity. Base additions propagate; removing base entities or reparenting/deleting linked children requires unpacking first. Nested prefabs and structural overrides are deferred.

Assets use `application/x-protomake-prefab` with a validated scene document. Each instance entity carries `protomake.prefab`: `{ prefab, source, root, overrides }`. Overrides use path token arrays, for example `["components", "protomake.script", "values", "speed"]`; dotted component IDs are a single token. Object properties are compared recursively, arrays atomically. Empty/removal patches distinguish a removed property from null. Scene JSON stores resolved values for runtime use, and project load resolves inherited properties from the base again. Save/export and undo retain the links and patches.

Local GUID references are remapped when instantiating hierarchies. Applying an external scene-entity reference to a base is rejected. Duplicate instances receive fresh entity/root IDs. Incomplete hierarchies and invalid asset/source/root links fail validation rather than silently becoming independent copies.
