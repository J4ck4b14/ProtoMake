# Visual Logic 0.11

ProtoMake Behaviour Graphs are versioned JSON assets (`application/x-protomake-behaviour-graph`). Graph, node, connection and group identities are stable; graph variables and node properties remain authored data rather than generated source.

## Runtime architecture

Graph and TypeScript Behaviours occupy the same ordered `protomake.behaviours` component and run through `ScriptSystem`. Both receive the same `ScriptContext`, including input, physics, animation, audio, signals, timers, tweens, prefabs, coordinates and scene loading. Owner-scoped cleanup therefore applies equally to both forms.

`NodeRegistry` owns node definitions and typed ports. Project loading rejects unknown definitions, missing or incorrectly directed ports, incompatible types, duplicate single-input connections, invalid variable defaults, empty signals and broken prefab references. The runtime also limits synchronous flow execution to prevent runaway graphs.

## Authoring

Create or open a graph from the Assets panel. Search uses titles, categories and gameplay synonyms. The workspace supports:

- node create, delete, drag, duplicate, copy and paste;
- pan, zoom and frame selected;
- shift multi-select and shift-drag box selection;
- typed connection creation and click-to-remove connections;
- local undo and redo;
- comment groups and editable node properties.

Graph Behaviours can be attached from the Inspector beside TypeScript Behaviours. Declared variables appear as per-instance overrides.

## Debugging

During Play Mode, each executed graph node emits a structured trace containing the graph ID, node ID, phase and inspected input values. An open graph highlights the active node and displays current values in its status bar. This trace boundary is intended to support later watches, breakpoints and execution history without changing authored graph data.

## V1 nodes

V1 includes lifecycle, collision/trigger, input and signal events; branch, sequence, once and delay flow; constants, variables, arithmetic and comparison; entity/tag queries; position reads/writes; input, pointer and physics values/actions; prefab spawning; animation/audio hooks; signals; scene loading; position tweens; and logging. Definitions are registered rather than dispatched through a permanent type switch.
