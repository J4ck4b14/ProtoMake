# Versioning policy

ProtoMake release versions follow `major.minor.patch`. While the project is pre-1.0, a minor release may add or revise public engine APIs; patch releases are reserved for compatible fixes and release hardening. The changelog and migration notes identify meaningful compatibility changes.

Project, scene, save, Behaviour Graph, and Interchange schema versions are independent integers. A schema change advances exactly one version and includes a sequential migration when old data can be upgraded safely. Newer unknown schemas fail visibly. Engine release metadata never substitutes for schema validation.

External exporter releases use the ProtoMake 0.16 series: 0.16 establishes Interchange, 0.16.1 adds Godot, 0.16.2 adds Unity, and 0.16.3 adds Unreal Engine 5 tooling. Target output manifests record both the engine release and Interchange schema.
