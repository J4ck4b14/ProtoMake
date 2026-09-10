# Animation and audio

## Animation authoring

Import images, then **+ Animation clip** in Assets. Add/remove/reorder frames, choose an image per frame and set its duration in seconds. **Set all frame durations** converts the FPS field to durations. Loop and clip playback speed are authored properties. A non-looping clip holds its final frame.

Create **+ Animator** after at least one clip exists. Its form edits named states, clip choices, state speed, initial state, parameters and transitions. State names are project data. A single-state Animator is also the basic clip player. Select a controller asset and **Attach media** to a selected entity with a Sprite Renderer; or add Animator in the Inspector and choose its controller.

**Reopen and edit:** double-click an existing clip or Animator in Assets, or select it and choose **Edit animation**. The Animator section in the entity Inspector also provides **Edit controller** and **Edit clip** shortcuts. Saving updates the same asset ID, preserving references; Undo restores the previous edit. Stop Play before authoring.

Parameters support bool, float, int and trigger. Transition conditions are ANDed. Rules are evaluated in authored order; the first matching rule wins, at most once per rendered engine update. `Any state` matches every state. Blank exit time allows an immediate transition; a numeric value waits for that many clip cycles. Referenced triggers are consumed only by a taken transition. Transitions cut to the first frame of their destination. There is no cross-fade/blend tree, skeletal animation, atlas slicing or skeletal timeline editor in this checkpoint.

The effective speed is Animator × state × clip speed. Disabling the entity suspends its animation; re-enabling retains playback state. Stop destroys runtime playback state. Animations run after script update, so a parameter written by a script can affect that frame.

```ts
update(ctx: ScriptContext) {
  ctx.setParameter('moving', Math.abs(ctx.input.getAxis('Move')) > 0.1);
  // ctx.trigger('attack');
  // ctx.animationState();
}
```

The optional final argument selects another entity for `setParameter`, `trigger` and `animationState`.

## Audio authoring

Import WAV, MP3 or OGG. Actual codec decoding depends on the browser; invalid/unsupported files produce an error naming the asset during runtime loading. Select a clip and **Attach media**, or add **Audio Source** and assign the clip. Configure loop, volume (0–1), playback rate (0.01–4), output bus and Play on awake.

**Mixer** provides Master, Music, SFX, UI and Ambience, per-bus volume/mute, and custom buses. Every non-Master bus routes into Master. Missing buses are rejected. Mixer changes are authored project settings and support Undo. During Play, scripts may change runtime bus gains.

```ts
ctx.playAudio(); // Restart this entity's one voice.
ctx.pauseAudio();
ctx.playAudio(ctx.entity, true); // Resume its saved offset.
ctx.stopAudio();
ctx.setBus('Music', 0.4);
ctx.setBus('SFX', 1, true); // Mute SFX.
```

Click the game viewport in editor Play to enable sound. Exported games have a Start button. Engine Pause suspends the audio context; Step advances the simulation while audio remains suspended. Stop, disabled/destroyed sources and scene changes release their voices. Source playback rate changes pitch as well as speed. This is non-spatial mono/stereo playback with one voice per AudioSource; spatial listeners/attenuation, streaming and effects processing are deferred.

The adapter reuses decoded buffers and creates a fresh source node for each play/resume, as required by [AudioBufferSourceNode's one-shot lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode). It resumes suspended contexts through [AudioContext.resume](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume).

## Authoring tools in 0.8

Clips have Play/Pause preview, a scrub slider and a proportional frame timeline. Preview uses the unsaved frame durations, loop setting and clip speed. Clicking a numbered timeline segment jumps to its start; these controls do not modify runtime state. Closing or rerendering the editor releases its preview callback.

Controllers show an automatically laid out state graph. Select a node to jump to its fields. Connect creates a transition from the selected node with exit time 1 and no conditions; edit its rule before saving if a conditional transition is intended. Arrow labels jump to transition fields. Earlier rule and Later rule control priority. The dot identifies the initial state. State names remain unique; renaming updates references. Deleting a state removes attached transitions and chooses a remaining initial state. Deleting a parameter removes transitions using it so a removed condition cannot accidentally become an always-true rule.
