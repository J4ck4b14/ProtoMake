# Archived ProtoMake 0.8 scope

This file records the scope immediately before the ProtoMake 0.8 lighting/continuity polish and is retained only as release history. **It is not the current capability list.** ProtoMake 0.9 supersedes the lighting/editor limitations described by the old roadmap; see `README.md`, `docs/polish-pass.md` and `docs/editor-quality-0.9.md` for the current contracts.

ProtoMake 0.8 introduced the accepted startup patch, animation playback and scrub controls, a proportional frame timeline, an automatically laid out state graph with connections and transition priority controls, and the original ambient/point/spot/rectangular area light model. Existing media could be reopened and edited without changing asset identity. Removing a state cleaned its transitions; removing a parameter removed affected transitions instead of silently making them unconditional.

The release included editable shooter, platformer and two-player local fighting projects, standalone builds, raw assets/scripts and the three-prototype workshop. Those projects remain regression content in 0.9.

Historical limitations at that point included centre-sampled lighting without shadows, an automatically laid out (non-freeform) Animator graph, local-only fighter multiplayer and limited small-screen authoring. ProtoMake 0.8's later polish and ProtoMake 0.9's Editor Quality pass specifically supersede the lighting/shadow, scripting-authoring, mobile workspace and project-continuity limitations. Normal-map/HDR lighting, skeletal animation/blend trees and online multiplayer remain outside the current release.
