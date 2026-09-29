/**
 * Workshop enemy behaviour that moves a simple obstacle/enemy using the public script context.
 */
import type { ScriptContext } from '@protomake/scripting';
export const fields = { speed: { type: 'number', default: 1 } } as const;
export default class Enemy {
  speed = 1;
  private x = 0;
  private y = 0;
  start(ctx: ScriptContext) {
    [this.x, this.y] = ctx.position();
  }
  update(ctx: ScriptContext) {
    ctx.setPosition(this.x + Math.sin(ctx.elapsed * this.speed) * 10, this.y);
  }
}
