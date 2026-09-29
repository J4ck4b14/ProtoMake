# Roadmap

ProtoMake already covers the full authoring path from scene construction through scripting/visual logic, runtime UI and persistence, 2D gameplay systems, live iteration, standalone web builds and one-way project export for Godot, Unity and Unreal Engine.

Current development priorities are evidence-led:

- profile larger projects and remove measured editor/runtime bottlenecks;
- validate generated target-engine projects in installed engine versions;
- expand Behaviour Graph portability only where translators can be tested end to end;
- improve browser, touch-device and accessibility coverage;
- tighten diagnostics around features that cannot be represented exactly by a target exporter;
- keep project/runtime boundaries small enough that standalone builds remain independent of editor code.

Round-trip editing from target engines, arbitrary TypeScript translation and claims of lossless export are outside the current scope unless the architecture changes to support them explicitly.
