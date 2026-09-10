import type { ScriptContext } from '@protomake/scripting';
import { sprite, show, bar, clamp } from './Helpers';
export const fields = { speed: { type: 'number', default: 180 } } as const;
interface FighterState {
  id: string;
  x: number;
  y: number;
  vy: number;
  hp: number;
  attack: number;
  hit: boolean;
  stun: number;
  facing: number;
  block: boolean;
}
/** Two local players share one fixed-step combat clock. No networking or computer-controlled opponent. */
export default class Fighter {
  speed = 180;
  private fighters: FighterState[] = [];
  private requests = [false, false];
  private jumps = [false, false];
  private done = false;
  start(c: ScriptContext): void {
    this.reset(c);
  }
  private reset(c: ScriptContext): void {
    this.fighters = [0, 1].map((i) => ({
      id: c.find(`Fighter ${i + 1}`)!,
      x: i ? 160 : -160,
      y: 128,
      vy: 0,
      hp: 100,
      attack: 0,
      hit: false,
      stun: 0,
      facing: i ? -1 : 1,
      block: false,
    }));
    this.done = false;
    this.requests = [false, false];
    this.jumps = [false, false];
    show(c, 'Victory', false);
    show(c, 'Defeat', false);
    this.fighters.forEach((f, i) => {
      c.setPosition(f.x, f.y, f.id);
      bar(c, `Health ${i + 1}`, 100, 100);
    });
  }
  update(c: ScriptContext): void {
    if (c.input.wasPressed('Restart')) this.reset(c);
    for (let i = 0; i < 2; i++) {
      if (c.input.wasPressed(`Attack${i + 1}`)) this.requests[i] = true;
      if (c.input.wasPressed(`Jump${i + 1}`)) this.jumps[i] = true;
    }
  }
  fixedUpdate(c: ScriptContext): void {
    if (this.done) return;
    const dt = c.delta;
    for (let i = 0; i < 2; i++) {
      const f = this.fighters[i]!,
        other = this.fighters[1 - i]!;
      f.stun = Math.max(0, f.stun - dt);
      f.attack = Math.max(0, f.attack - dt);
      if (!f.attack && !f.stun) f.facing = other.x >= f.x ? 1 : -1;
      f.block =
        c.input.isPressed(`Block${i + 1}`) &&
        f.y >= 128 &&
        !f.attack &&
        !f.stun;
      if (this.requests[i] && !f.attack && !f.stun && !f.block) {
        f.attack = 0.43;
        f.hit = false;
      }
      if (this.jumps[i] && f.y >= 128 && !f.stun && !f.block) f.vy = -390;
      this.requests[i] = false;
      this.jumps[i] = false;
      if (!f.stun && !f.attack && !f.block)
        f.x += c.input.getAxis(`Move${i + 1}`) * this.speed * dt;
      f.vy += 980 * dt;
      f.y += f.vy * dt;
      if (f.y > 128) {
        f.y = 128;
        f.vy = 0;
      }
      f.x = clamp(f.x, -340, 340);
    }
    const a = this.fighters[0]!,
      b = this.fighters[1]!;
    if (Math.abs(a.x - b.x) < 36 && Math.abs(a.y - b.y) < 48) {
      const push = (36 - Math.abs(a.x - b.x)) / 2,
        sign = a.x <= b.x ? 1 : -1;
      a.x = clamp(a.x - push * sign, -340, 340);
      b.x = clamp(b.x + push * sign, -340, 340);
    }
    // Gather both hits before applying them so simultaneous attacks can trade.
    const hits: {
      attacker: FighterState;
      target: FighterState;
      blocked: boolean;
    }[] = [];
    for (const f of this.fighters) {
      const other = this.fighters.find((v) => v !== f)!;
      if (
        !f.hit &&
        f.attack <= 0.33 &&
        f.attack > 0.25 &&
        !f.stun &&
        (other.x - f.x) * f.facing > 0 &&
        Math.abs(other.x - f.x) < 78 &&
        Math.abs(other.y - f.y) < 44
      ) {
        hits.push({
          attacker: f,
          target: other,
          blocked: other.block && (f.x - other.x) * other.facing > 0,
        });
        f.hit = true;
      }
    }
    for (const { attacker, target, blocked } of hits) {
      target.hp = Math.max(0, target.hp - (blocked ? 2 : 18));
      if (!blocked) {
        target.stun = 0.2;
        target.attack = 0;
        target.x = clamp(target.x + attacker.facing * 24, -340, 340);
      }
      c.playAudio();
    }
    this.fighters.forEach((f, i) => {
      c.setPosition(f.x, f.y, f.id);
      c.setParameter('active', f.attack > 0, f.id);
      sprite(c, f.id, {
        flipX: f.facing < 0,
        tint: f.stun ? '#ff9988' : f.block ? '#82baff' : '#ffffff',
      });
      const active = f.attack <= 0.33 && f.attack > 0.25 && !f.stun;
      const fist = c.find(`Hitbox ${i + 1}`)!;
      c.setPosition(f.x + f.facing * 45, f.y, fist);
      sprite(c, fist, { visible: active });
      bar(c, `Health ${i + 1}`, f.hp, 100);
    });
    if (this.fighters.some((f) => f.hp === 0)) {
      this.done = true;
      show(c, a.hp === 0 ? 'Defeat' : 'Victory', true);
      for (const f of this.fighters) c.setParameter('active', false, f.id);
      for (let i = 1; i <= 2; i++) show(c, `Hitbox ${i}`, false);
    }
  }
}
