# Game feel 0.15

ProtoMake 0.15 adds a compact set of production-facing feedback tools that remain ordinary authored components and services.

- **Particle Emitter 2D** supports continuous rate, startup burst, bounded capacity, lifetime/speed ranges, angle/spread, gravity, size/color fade, sorting, and script-triggered bursts through `ctx.particles.emit()`.
- Animation clips carry named timed events with optional scalar payloads. Runtime events enter the shared signal service, so `ctx.events.on('footstep', handler)` can drive sound or VFX. Transitions have an authored blend duration and cross-fade the source/destination sprite frames.
- Audio Source supports bounded one-shot polyphony plus optional 2D distance attenuation and stereo pan relative to the highest-priority active camera. Loop/resume semantics remain explicit, decoded buffers stay shared, and every voice is released on disable, destroy, scene change, or Stop.
- Camera effects include decaying shake, directional kick, and smooth zoom pulse. `ctx.body` provides velocity, setVelocity, impulse, and teleport conveniences without exposing Rapier handles.

Particle entities are runtime-owned and excluded from authored scenes. Emitter capacity and a per-call burst ceiling prevent accidental unbounded allocation. Spatial sound is an intentionally lightweight 2D model, not an HRTF or reverberation system.
