import type { ScriptContext } from '@protomake/scripting';
export const fields = {
  speed: { type: 'number', default: 1.2 },
  distance: { type: 'number', default: 90 },
} as const;
export default class MovingPlatform {
  speed = 1.2;
  distance = 90;
  private origin: readonly [number, number] = [0, 0];
  start(ctx: ScriptContext) {
    this.origin = ctx.position();
  }
  fixedUpdate(ctx: ScriptContext) {
    ctx.setPosition(
      this.origin[0] + Math.sin(ctx.elapsed * this.speed) * this.distance,
      this.origin[1],
    );
  }
}
