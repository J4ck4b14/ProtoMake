# Follow-up requests

This patch fixes preview startup and improves access to existing animation assets. The Animator remains a form-based state machine; a visual state graph and richer animation timeline/preview require a separate authoring pass.

Lighting is requested but not implemented: ambient, point, spot and rectangular/area lights, with controls for color, intensity, range, falloff, orientation and cone/area size as applicable. Renderer/material support and shadow behavior need design before exposing components.

Restitution now accepts finite values above one for deliberately energy-adding arcade bounces. Other constraints remain; review them individually according to runtime support rather than removing validation globally.

After the polishing pass is accepted, prepare a workshop document for three prototypes: a shooter, a platformer and a fighting game. Use the verified editor workflow, include assets and project scripts, explain inputs/scenes/prefabs/animation/audio/physics, and provide intermediate checks plus export instructions. This is a requested future deliverable, not a completed tutorial.
