import type { ScriptContext } from '@protomake/scripting';
export const fields = {
  speed: { type: 'number', default: 2 },
  minimumOpacity: { type: 'number', default: 0.25 },
} as const;
export default class Pulse {
  speed = 2;
  minimumOpacity = 0.25;
  update(ctx: ScriptContext) {
    const sprite = ctx.get<Record<string, unknown>>('protomake.sprite');
    if (!sprite) return;
    const wave = (Math.sin(ctx.elapsed * this.speed) + 1) / 2;
    ctx.set('protomake.sprite', {
      ...sprite,
      opacity: this.minimumOpacity + (1 - this.minimumOpacity) * wave,
    });
  }
}
