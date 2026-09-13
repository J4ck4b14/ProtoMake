# Game UI & Persistence 0.12

## Runtime UI

ProtoMake game UI is authored with ECS components and rendered into an accessible DOM overlay owned by the game session. It is separate from editor UI and is included in Play Mode and production builds.

Available components cover UI roots, panels, text, images, buttons, progress, sliders, toggles, text input, scroll areas and flex-style layout. Layout exposes direction, alignment, justification, spacing, flexible growth, explicit CSS sizing and screen anchors. Text exposes font family, size, color, alignment, wrapping and opacity.

Interactive controls emit their configured project signal with stable entity identity and current value. TypeScript uses `ctx.ui`; graphs provide Set UI Text, Set UI Visible and Set UI Value nodes. Image assets are validated as images.

## Save game

`ctx.save.register(key, capture, restore)` registers behaviour-owned state. `save`, `load`, `list` and `delete` operate on named profiles and slots. Records include the ProtoMake project ID, schema version, update time and an integrity checksum. Projects advance save formats with explicit sequential migrations; newer saves and missing migration steps fail visibly.

The browser backend uses origin-scoped local storage. A memory backend supports deterministic testing and host integrations. Optional project autosave writes the `default/auto` slot every 30 seconds of running game time. Project settings expose the save schema version, autosave and achievement definitions.

Achievements are vendor-neutral authored records with stable ID, name, description, optional image asset and hidden state. Unlock state is itself registered save data. Persistent services are reused when ProtoMake replaces a scene session, while scene-owned behaviour registrations are cleaned up.

Browser storage is not a cloud backup. Production projects should expose clear profile/slot UX and continue offering their own export or account strategy where needed.
