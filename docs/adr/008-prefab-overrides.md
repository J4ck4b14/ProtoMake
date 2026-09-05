# ADR 008: Linked prefab identity and tokenized overrides

Accepted for Milestone 5.

Prefab bases are typed project assets containing one validated entity hierarchy. Instance members retain asset ID, base entity ID, instance-root ID and explicit property patches. Token arrays avoid ambiguity between a component ID such as protomake.script and a nested property path. Object leaves are diffed, arrays replaced atomically, and deletion is represented separately from null.

The editor records patches at transaction/gesture completion. Applying a base change resolves all affected scenes while retaining instance patches. Reverting the instance preserves root placement. Project loading resolves inherited values again; serialized resolved data remains available for runtime instantiation. Undo captures the entire project mutation.

Nested prefabs and structural removals/reparenting are intentionally rejected until a structural override model exists. Unpack gives an explicit way to leave the relationship. This trades some flexibility for predictable inheritance and recoverable edits.
