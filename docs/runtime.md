# Runtime contract

`Engine(world, time?)` coordinates registered systems. A system has a unique `id` and optional `start`, `fixedUpdate`, `update`, `lateUpdate`, `stop` callbacks, each receiving `{ world, time }`. A system must perform real work; systems are not created for future features.

- `start`: requires stopped, resets the clock, starts systems in order.
- `tick(seconds)`: running only; paused/stopped calls do nothing; faulted calls throw.
- `pause` / `resume`: require running / paused respectively.
- `step`: requires paused and advances one fixed interval while remaining paused.
- `stop`: tears down all started systems in reverse order, including a partially started system after startup failure. Cleanup continues after failures, then throws an AggregateError. Calling stop while already stopped is harmless.

Lifecycle mutation from inside a system callback is rejected to prevent reentrant execution. A system callback failure emits `{ system, phase, cause }`, faults the engine and propagates the exception. The host must handle it and call stop for cleanup; subsequent ticks do not run systems. Host event listeners are trusted synchronous callbacks; their exceptions also propagate. Listeners should not throw or recursively change lifecycle state.

The default clock uses 1/60-second fixed intervals, clamps admitted frame time to 0.25 seconds and runs at most 8 fixed substeps per tick. Excess whole substeps are discarded, keeping fractional interpolation remainder. `dropped` reports both frame-clamped and catch-up-discarded seconds; `elapsed` is admitted variable time, `fixedElapsed` is executed fixed time. These may differ after overload. `alpha` is meaningful after fixed updates finish and describes the remaining fraction.

`engine.profile` reports the most recent frame duration, fixed-step count, dropped time and accumulated callback time by system. Play Mode publishes this with runtime hierarchy, component, exposed behaviour and graph-trace snapshots. Live edits cross the isolated iframe through explicit validated messages; no runtime object references leak into authoring.

A standalone TimeService caller must call `consumeFixed()` once per step returned by `advance()` before advancing again. Engine does this automatically. Time is in seconds. This is scheduling infrastructure, not a physics implementation or script-behaviour API.
