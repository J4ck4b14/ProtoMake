# ADR 001: Component-oriented world, sparse stores

Accepted for Milestone 0.

Use world-local monotonic numeric handles with scene-scoped UUID identity. Keep component membership in per-type sparse Maps and hierarchy in a child index. Public state is immutable; mutation is validated and explicit.

This provides indexed iteration and predictable destruction without heavy per-entity behavior objects. It avoids prematurely choosing an archetype ECS. Snapshot writes allocate, so high-frequency large-component workloads need profiling before adding packed stores or an explicit trusted write path.
