# Completion scope

ProtoMake 0.8 includes the accepted startup patch, animation playback and scrub controls, a proportional frame timeline, an automatically laid out state graph with connections and transition priority controls, and ambient/point/spot/rectangular area lights with per-sprite shading. Existing media can be reopened and edited without changing asset identity. Removing a state cleans its transitions; removing a parameter removes affected transitions instead of silently making them unconditional.

The release includes editable shooter, platformer and two-player local fighting projects, standalone builds, raw assets/scripts and the three-prototype workshop. See `examples/prototypes/README.md` and `docs/ProtoMake-Prototype-Workshop.docx`.

The scope remains a reusable 2D web engine development release. Lighting does not include shadows or normal maps; the Animator is a sprite state machine with cut transitions, not skeletal animation or blend trees. Its graph layout is automatic, not freely draggable. The fighter is local two-player only. Online play, gamepad controls for these new prototypes, persistent game saves and mobile touch controls are outside this release. Engine project saves remain supported.
