# ADR 010: Target-neutral one-way Interchange

## Decision

ProtoMake lowers validated project data into a versioned target-neutral IR before any external engine exporter runs. The Interchange package owns coordinate/unit profiles, stable target IDs, capability decisions, graph-node portability, manifests, and deterministic diagnostics. ProtoMake remains canonical; target outputs are one-way generated migration/build artifacts.

## Rationale

Direct exporters coupled to editor/project internals would drift, duplicate conversions, and silently disagree about support. A smaller explicit IR lets each target generator consume the same scene hierarchy and declared portable subset. Four fidelity tiers make approximation and manual work visible before migration.

## Consequences

ProtoMake-native features remain free to exceed target capabilities. Arbitrary TypeScript is manual unless a specific translator exists. Generated target files must be separated from creator-owned files and preserve ProtoMake GUID metadata. Round-trip target edits, undocumented native serialization, and silent omission are outside this architecture.
