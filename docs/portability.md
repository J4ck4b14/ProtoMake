# ProtoMake Interchange and portability

ProtoMake is the source of truth. External exports are one-way migration/build outputs, not lossless round trips. **Analyze portability** lowers the current project into target-neutral ProtoMake Interchange IR v1 and reports every asset, entity, component, and behaviour for Godot, Unity, and Unreal Engine 5.

Each report uses four explicit tiers:

- **Fully portable:** the target representation preserves the declared ProtoMake meaning.
- **Approximated:** generated target content is useful, but the report names the semantic difference.
- **Manual work:** source data is retained and identified, but creator work is required in the target engine.
- **Unsupported:** no trustworthy mapping is generated; the item remains visible in diagnostics.

Arbitrary project TypeScript is always manual unless a specific translator is added. The portable Behaviour Graph subset is declared by node type; exporters must not infer support. ProtoMake-native semantics are not weakened to increase a target score.

## Coordinate contract

ProtoMake uses pixels, +X right, +Y down, and clockwise radians. Conversion is centralized in `@protomake/interchange`: Godot retains pixel/Y-down coordinates, Unity uses 100 pixels per unit with Y inversion, and the Unreal bundle uses centimeters with Y inversion for its 2D plane. Target exporters consume these profiles instead of embedding conversion constants.

Every export manifest includes the Interchange version, source project/engine version, deterministic source fingerprint, fidelity report, and stable ProtoMake GUID → generated target identity map. Generated files live under a clearly named ProtoMake-owned root. Re-export may replace that root; it must not merge into or delete creator-owned target code.
