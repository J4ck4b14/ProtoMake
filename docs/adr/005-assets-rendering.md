# ADR 005: Portable assets and a Pixi adapter

Accepted at Milestone 2.

Project schema v2 embeds asset metadata and bytes for portable JSON exports and transactional browser saves. Each asset has a durable UUID independent of a case-insensitive, relative organizational path. Images accept PNG/JPEG/WebP only; no executable SVG/HTML import. Single-file imports are capped at 20 MiB. Browser storage quotas still apply and failed saves are reported without marking the project saved.

Registered asset-reference inspector metadata drives dependency checks. Missing references block project validation; referenced assets cannot be deleted. Renaming and moving preserve identity. Image decoding precedes import. Texture caches use identity plus content; replaced/deleted textures are released.

ProtoMake owns SpriteRenderer, Camera2D and Renderer2D contracts. Pixi 8.16.0 lives behind a separate adapter entry point, keeping component/data use independent of browser graphics. The editor and isolated Play iframe each own their own renderer and texture lifetime. Empty sprite texture means an explicit tinted primitive rectangle; unavailable textures are magenta. Layers and order are integers; equal sort keys use durable entity IDs. The highest-priority enabled camera is used, with stable-ID tie breaking. Multiple simultaneous cameras are deferred.
