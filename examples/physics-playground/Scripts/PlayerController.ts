import type { ScriptContext } from '@protomake/scripting';
export const fields = {
  speed: { type: 'number', default: 220 },
  jumpSpeed: { type: 'number', default: 440 },
} as const;
export default class PlayerController {
  speed = 220;
  jumpSpeed = 440;
  private jumpReady = true;
  fixedUpdate(ctx: ScriptContext) {
    const position = ctx.position();
    const move = ctx.input.getVector('Move');
    let vy = ctx.physics.velocity(ctx.entity)[1];
    if (!ctx.input.isPressed('Jump')) this.jumpReady = true;
    const ground = ctx.physics.raycast(position, [0, 1], 23, ctx.entity);
    if (ctx.input.isPressed('Jump') && this.jumpReady && ground && vy >= -1) {
      vy = -this.jumpSpeed;
      this.jumpReady = false;
    }
    ctx.physics.setVelocity(ctx.entity, move[0] * this.speed, vy);
    if (position[1] > 600) {
      ctx.setPosition(-250, 40);
      ctx.physics.setVelocity(ctx.entity, 0, 0);
      ctx.log('Respawned');
    }
  }
}
