# ProtoMake Interchange and portability

ProtoMake is the source of truth. External exports are one-way migration/build outputs, not lossless round trips. **Analyze portability** lowers the current project into target-neutral ProtoMake Interchange IR v1 and reports every asset, entity, component, and behaviour for Godot, Unity, and Unreal Engine 5.

Each report uses four explicit tiers:

- **Fully portable:** the target representation preserves the declared ProtoMake meaning.
- **Approximated:** generated target content is useful, but the report names the semantic difference.
- **Manual work:** source data is retained and identified, but creator work is required in the target engine.
- **Unsupported:** no trustworthy mapping is generated; the item remains visible in diagnostics.

Arbitrary project TypeScript is always manual unless a specific translator is added. The portable Behaviour Graph subset is declared by node type; exporters must not infer support. ProtoMake-native semantics are not weakened to increase a target score.

## Godot 4 export

ProtoMake 0.16.1 generates a ZIP that opens as a Godot 4 project. Use **Analyze portability → Export Godot project**. The export writes ordinary `project.godot`, `.tscn`, `.gd`, `.tres`, JSON, image and audio files; it does not depend on undocumented engine formats.

Generated scenes retain hierarchy and stable ProtoMake identity metadata. Media is copied byte-for-byte under `Generated/ProtoMake/Assets`; core sprites, cameras, 2D lights, audio players, rigid/character bodies and collision shapes are reconstructed. The generated input autoload preserves named keyboard, mouse and gamepad bindings, while the graph runtime executes only the explicitly reported portable node subset.

Keep custom Godot work outside `Generated/ProtoMake`. Re-export may replace that directory and the generated scene files. ProtoMake TypeScript, UI, tilemaps, prefab source assets, advanced animation/state behavior, sensors/one-way collision details and target-specific platform services remain explicitly classified for manual work or review rather than being silently omitted.

## Unity export

ProtoMake 0.16.2 generates a Unity 2022.3+ project. Open the exported directory in Unity; after package and script compilation, the importer runs once for each source fingerprint. **Tools → ProtoMake → Reimport** provides an explicit rerun.

The bundle intentionally contains no generated `.unity`, `.prefab`, `.anim`, `.controller` or `.meta` serialization. The importer creates those through `EditorSceneManager`, `AssetDatabase`, `AnimationUtility`, `AnimatorController` and Input System APIs. It reconstructs hierarchy/TRS, source media and sprite references, Rigidbody2D/colliders and layer collision rules, cameras, audio, particles, input actions, sprite animation/state controllers, and portable Behaviour Graph components.

Generated assets live in `Assets/Generated/ProtoMake`; keep target-side code and content elsewhere. Affine shear, atlas-region slicing, exact animation threshold semantics, custom audio buses/polyphony, UI, render-pipeline-specific 2D lighting, prefab authoring assets, arbitrary TypeScript and platform services are retained and explicitly reported for review or manual work.

## Unreal Engine 5 export

ProtoMake 0.16.3 generates a UE 5.4+ project with the ProtoMake Portability plugin. Its Editor module imports media through AssetTools, creates maps and attached actors through world/component APIs, reconstructs supported Paper2D sprites and flipbooks, collision primitives, orthographic cameras, audio components and Enhanced Input assets, and stores the complete ProtoMake payload on stable identity components. **Tools → ProtoMake → Reimport** reruns the source-fingerprint-aware import.

The plugin's separate Runtime module provides the portable Behaviour Graph ActorComponent in C++. Unreal Python is not part of gameplay or import. ProtoMake writes source code, JSON and source media only—never `.uasset` or `.umap` binaries. Unreal creates those under `/Game/Generated/ProtoMake` through its own asset system.

Keep custom Unreal work outside that generated Content path. TRS reduction of affine shear, atlas slicing, detailed physics/material parity, complete animation state logic, Enhanced Input modifiers, UMG, Niagara, 2D lighting, prefab/Blueprint authoring assets, arbitrary TypeScript and platform services remain explicit fidelity notes rather than silent omissions.

## Coordinate contract

ProtoMake uses pixels, +X right, +Y down, and clockwise radians. Conversion is centralized in `@protomake/interchange`: Godot retains pixel/Y-down coordinates, Unity uses 100 pixels per unit with Y inversion, and the Unreal bundle uses centimeters with Y inversion for its 2D plane. Target exporters consume these profiles instead of embedding conversion constants.

Every export manifest includes the Interchange version, source project/engine version, deterministic source fingerprint, fidelity report, and stable ProtoMake GUID → generated target identity map. Generated files live under a clearly named ProtoMake-owned root. Re-export may replace that root; it must not merge into or delete creator-owned target code.
