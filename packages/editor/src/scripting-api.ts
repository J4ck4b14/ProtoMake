export interface ScriptApiEntry {
  name: string;
  signature: string;
  description: string;
}

export const SCRIPT_CONTEXT_API: readonly ScriptApiEntry[] = [
  {
    name: 'position',
    signature: 'ctx.position(entity?)',
    description: 'Read a world-space entity position.',
  },
  {
    name: 'setPosition',
    signature: 'ctx.setPosition(x, y, entity?)',
    description: 'Move an entity, respecting a physics body when present.',
  },
  {
    name: 'illumination',
    signature: 'ctx.illumination(entity?)',
    description:
      'Read 0..1 occlusion-aware illumination for stealth/visibility.',
  },
  {
    name: 'lightAt',
    signature: 'ctx.lightAt(x, y, channel?)',
    description:
      'Sample 0..1 lighting at an arbitrary world point and optional lighting channel.',
  },
  {
    name: 'canSee',
    signature: 'ctx.canSee(target, range?, fovDegrees?, observer?)',
    description:
      'Range + view-cone + occlusion line-of-sight primitive for detection and stealth.',
  },
  {
    name: 'get',
    signature: 'ctx.get<T>(componentType, entity?)',
    description: 'Read a component snapshot.',
  },
  {
    name: 'set',
    signature: 'ctx.set(componentType, value, entity?)',
    description: 'Replace a component value at runtime.',
  },
  {
    name: 'find',
    signature: 'ctx.find(name)',
    description: 'Find the first entity with a matching name.',
  },
  {
    name: 'entities.withTag',
    signature: "ctx.entities.withTag('Enemy')",
    description: 'Query stable entity IDs through an authored tag.',
  },
  {
    name: 'events.emit',
    signature: "ctx.events.emit('door.open', payload?)",
    description: 'Emit a named project signal.',
  },
  {
    name: 'events.on',
    signature: "ctx.events.on('door.open', handler)",
    description: 'Listen until this behaviour is destroyed.',
  },
  {
    name: 'time.after',
    signature: 'ctx.time.after(seconds, callback)',
    description: 'Schedule a behaviour-owned one-shot timer.',
  },
  {
    name: 'time.every',
    signature: 'ctx.time.every(seconds, callback)',
    description: 'Schedule a behaviour-owned repeating timer.',
  },
  {
    name: 'tween.to',
    signature: 'ctx.tween.to(entity, options)',
    description:
      'Tween transform or opacity through the shared runtime service.',
  },
  {
    name: 'prefabs.instantiate',
    signature: 'ctx.prefabs.instantiate(prefab, options?)',
    description: 'Instantiate a prefab into the active scene.',
  },
  {
    name: 'pointer',
    signature: 'ctx.pointer.worldPosition',
    description: 'Read screen/world pointer position, delta and wheel.',
  },
  {
    name: 'camera',
    signature: 'ctx.camera.screenToWorld(position)',
    description: 'Convert coordinates through the active camera.',
  },
  {
    name: 'camera.shake',
    signature: 'ctx.camera.shake(camera, intensity, duration)',
    description: 'Apply decaying camera shake.',
  },
  {
    name: 'camera.kick',
    signature: 'ctx.camera.kick(camera, x, y, duration)',
    description: 'Apply a directional impact kick.',
  },
  {
    name: 'camera.zoomPulse',
    signature: 'ctx.camera.zoomPulse(camera, amount, duration)',
    description: 'Pulse camera zoom with a smooth attack and release.',
  },
  {
    name: 'particles.emit',
    signature: 'ctx.particles.emit(entity?, count?)',
    description: 'Emit a bounded particle burst from an emitter.',
  },
  {
    name: 'body.velocity',
    signature: 'ctx.body.velocity(entity?)',
    description: 'Read rigid-body linear velocity.',
  },
  {
    name: 'body.setVelocity',
    signature: 'ctx.body.setVelocity(x, y, entity?)',
    description: 'Set rigid-body linear velocity.',
  },
  {
    name: 'body.impulse',
    signature: 'ctx.body.impulse(x, y, entity?)',
    description: 'Apply an instantaneous rigid-body impulse.',
  },
  {
    name: 'body.teleport',
    signature: 'ctx.body.teleport(x, y, entity?)',
    description: 'Teleport a rigid body and wake it.',
  },
  {
    name: 'loadScene',
    signature: 'ctx.loadScene(idOrName)',
    description: 'Load another project scene.',
  },
  {
    name: 'ui.setText',
    signature: 'ctx.ui.setText(entity, text)',
    description: 'Update a runtime UI Text entity.',
  },
  {
    name: 'ui.setVisible',
    signature: 'ctx.ui.setVisible(entity, visible)',
    description: 'Show or hide a runtime UI entity.',
  },
  {
    name: 'ui.setValue',
    signature: 'ctx.ui.setValue(entity, value)',
    description: 'Update progress, slider, toggle or text-input state.',
  },
  {
    name: 'save.register',
    signature: 'ctx.save.register(key, capture, restore)',
    description: 'Register behaviour-owned state for save and load.',
  },
  {
    name: 'save.save',
    signature: "await ctx.save.save('profile', 'slot')",
    description: 'Capture registered state into a named profile and slot.',
  },
  {
    name: 'save.load',
    signature: "await ctx.save.load('profile', 'slot')",
    description: 'Restore a versioned named save slot.',
  },
  {
    name: 'achievements.unlock',
    signature: "ctx.achievements.unlock('first_step')",
    description: 'Unlock a project-defined, vendor-neutral achievement.',
  },
  {
    name: 'log',
    signature: 'ctx.log(message)',
    description: 'Write a message to the ProtoMake runtime console.',
  },
  {
    name: 'setParameter',
    signature: 'ctx.setParameter(name, value, entity?)',
    description: 'Set an Animator parameter.',
  },
  {
    name: 'trigger',
    signature: 'ctx.trigger(name, entity?)',
    description: 'Fire an Animator trigger.',
  },
  {
    name: 'animationState',
    signature: 'ctx.animationState(entity?)',
    description: 'Read the current Animator state.',
  },
  {
    name: 'playAudio',
    signature: 'ctx.playAudio(entity?, resume?)',
    description: 'Play or resume an Audio Source.',
  },
  {
    name: 'pauseAudio',
    signature: 'ctx.pauseAudio(entity?)',
    description: 'Pause an Audio Source.',
  },
  {
    name: 'stopAudio',
    signature: 'ctx.stopAudio(entity?)',
    description: 'Stop an Audio Source.',
  },
  {
    name: 'setBus',
    signature: 'ctx.setBus(name, volume, muted?)',
    description: 'Adjust an audio mixer bus.',
  },
  {
    name: 'input.getVector',
    signature: "ctx.input.getVector('Move')",
    description: 'Read a named vector input action.',
  },
  {
    name: 'input.getAxis',
    signature: "ctx.input.getAxis('Action')",
    description: 'Read a named scalar input action.',
  },
  {
    name: 'input.isPressed',
    signature: "ctx.input.isPressed('Action')",
    description: 'Test whether a named action is held.',
  },
  {
    name: 'input.wasPressed',
    signature: "ctx.input.wasPressed('Action')",
    description: 'Test a named action on its pressed edge.',
  },
  {
    name: 'input.wasReleased',
    signature: "ctx.input.wasReleased('Action')",
    description: 'Test a named action on its released edge.',
  },
  {
    name: 'delta',
    signature: 'ctx.delta',
    description: 'Frame/fixed-step delta time in seconds.',
  },
  {
    name: 'elapsed',
    signature: 'ctx.elapsed',
    description: 'Elapsed play time in seconds.',
  },
  {
    name: 'entity',
    signature: 'ctx.entity',
    description: 'Stable GUID of the entity running this behaviour.',
  },
  {
    name: 'world',
    signature: 'ctx.world',
    description: 'Advanced access to the runtime ECS world.',
  },
  {
    name: 'physics',
    signature: 'ctx.physics',
    description: 'Advanced access to the 2D physics service.',
  },
] as const;
