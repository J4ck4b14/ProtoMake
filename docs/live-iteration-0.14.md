# Live iteration 0.14

ProtoMake 0.14 keeps Play Mode isolated while exposing a deliberate live-tuning bridge. Open **Runtime** during Play to inspect the active hierarchy, registered component fields, script and graph variables, recent graph values, global gravity, and per-system frame timings.

Changing a control updates the running scene immediately. **Apply** copies that one value into authored project data through validation and undo history. Dynamic rigid bodies own their runtime transforms, so their Transform values are intentionally rejected by Apply; tune their body or behaviour fields instead. Runtime-created entities and missing authoring targets are never invented silently.

**Restart** rebuilds the current scene from the Play snapshot. Scripts can be edited and saved while Play is active, then **Recompile** validates the current authored project, recompiles every project module, and restarts the scene. **Play Here** starts the Player-tagged entity at the Scene viewport center. It reports a clear error when no Player tag exists.

The profiler measures the current frame and aggregates callback time by system. It is lightweight diagnostic timing, not a browser sampling profiler. Graph inspection retains the most recent trace for each graph node.
