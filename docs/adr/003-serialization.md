# ADR 003: Strict JSON with independent schema versions

Accepted for Milestone 0.

Keep Zod in serialization; core needs only a parse contract. Scene and project formats are strict JSON with separate versions, durable IDs and deterministic object ordering. Validate all content before instantiating a new world. Unknown components fail with context.

V1 embeds scenes in projects to establish a portable format without inventing the asset database. Later layout changes require real migrations. Migration infrastructure exists now; no fake historical schema is shipped.
