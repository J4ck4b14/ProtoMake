# ADR 007: Project modules and explicit fields

Accepted at Milestone 4.

Keep TypeScript source as GUID-addressed text assets. Use the installed TypeScript compiler for ES module output and its AST for static literal field metadata and import resolution. Do not execute code to discover fields. Use temporary Blob URLs for an acyclic graph of relative project imports. Missing imports, cycles, invalid metadata and syntax fail before the scene runs.

Keep runtime behavior interfaces separate from compiler implementation. Pass explicit ScriptContext services into lifecycle hooks rather than exposing renderer/physics internals. Script instances are world-scoped, and complete reverse teardown precedes physics disposal. Scene transitions are queued after a frame to avoid lifecycle reentrancy.

Retain the same-origin Play iframe from Milestone 1 and document it as a lifetime/data-isolation boundary, not a hostile-code sandbox. Recompile on each Play; do not attempt unsafe state-preserving hot swapping. A complete semantic TS language service and multiple behavior slots per entity are future improvements, not claimed current features.
