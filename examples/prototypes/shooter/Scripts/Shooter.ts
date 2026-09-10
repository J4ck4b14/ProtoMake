import type { ScriptContext } from '@protomake/scripting';
import { sprite, show, bar, clamp } from './Helpers';
export const fields = { speed: { type: 'number', default: 230 } } as const;
/** Fixed-size projectile pool and swept hits keep this prototype easy to inspect. */
export default class Shooter {
  speed = 230;
  private bullets: { id: string; alive: boolean }[] = [];
  private enemies: { id: string; alive: boolean; x: number; y: number }[] = [];
  private health = 3;
  private score = 0;
  private cooldown = 0;
  private invulnerable = 0;
  private done = false;
  start(c: ScriptContext): void {
    this.bullets = Array.from({ length: 12 }, (_, i) => ({
      id: c.find(`Bullet ${i + 1}`)!,
      alive: false,
    }));
    this.enemies = Array.from({ length: 6 }, (_, i) => ({
      id: c.find(`Drone ${i + 1}`)!,
      alive: true,
      x: 180 + (i % 2) * 110,
      y: -140 + Math.floor(i / 2) * 140,
    }));
    this.reset(c);
  }
  private reset(c: ScriptContext): void {
    this.health = 3;
    this.score = 0;
    this.done = false;
    this.cooldown = 0;
    this.invulnerable = 0;
    c.setPosition(-280, 0);
    for (const b of this.bullets) {
      b.alive = false;
      sprite(c, b.id, { visible: false });
    }
    for (const e of this.enemies) {
      e.alive = true;
      c.setPosition(e.x, e.y, e.id);
      sprite(c, e.id, { visible: true });
    }
    show(c, 'Victory', false);
    show(c, 'Defeat', false);
    bar(c, 'Health', this.health, 3);
    bar(c, 'Score', this.score, 6);
  }
  private damage(c: ScriptContext): void {
    if (this.invulnerable > 0) return;
    this.health--;
    this.invulnerable = 1;
    bar(c, 'Health', this.health, 3);
    if (!this.health) {
      this.done = true;
      show(c, 'Defeat', true);
    }
  }
  update(c: ScriptContext): void {
    if (c.input.wasPressed('Restart')) this.reset(c);
    if (this.done) {
      c.setParameter('active', false);
      return;
    }
    const dt = Math.min(c.delta, 0.05);
    this.cooldown -= dt;
    this.invulnerable -= dt;
    const move = c.input.getVector('Move'),
      [x, y] = c.position();
    c.setPosition(
      clamp(x + move[0] * this.speed * dt, -350, 350),
      clamp(y + move[1] * this.speed * dt, -190, 190),
    );
    c.setParameter('active', c.input.isPressed('Fire'));
    sprite(c, c.entity, {
      tint: this.invulnerable > 0 ? '#ff9988' : '#ffffff',
    });
    if (c.input.isPressed('Fire') && this.cooldown <= 0) {
      const b = this.bullets.find((b) => !b.alive);
      if (b) {
        b.alive = true;
        c.setPosition(c.position()[0] + 24, c.position()[1], b.id);
        sprite(c, b.id, { visible: true });
        c.playAudio();
        this.cooldown = 0.18;
      }
    }
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const p = c.position(e.id);
      c.setPosition(p[0] - 28 * dt, p[1], e.id);
      if (p[0] < -370) {
        c.setPosition(350, e.y, e.id);
        this.damage(c);
      }
      if (Math.hypot(p[0] - c.position()[0], p[1] - c.position()[1]) < 34)
        this.damage(c);
    }
    for (const b of this.bullets) {
      if (!b.alive) continue;
      const [bx, by] = c.position(b.id),
        next = bx + 650 * dt;
      const hit = this.enemies
        .filter((e) => e.alive)
        .sort((a, b) => c.position(a.id)[0] - c.position(b.id)[0])
        .find((e) => {
          const [ex, ey] = c.position(e.id);
          return bx <= ex + 18 && next >= ex - 18 && Math.abs(by - ey) < 22;
        });
      if (hit) {
        hit.alive = false;
        sprite(c, hit.id, { visible: false });
        this.score++;
        bar(c, 'Score', this.score, 6);
      }
      b.alive = !hit && next < 390;
      c.setPosition(next, by, b.id);
      sprite(c, b.id, { visible: b.alive });
    }
    if (this.score === 6 && !this.done) {
      this.done = true;
      show(c, 'Victory', true);
    }
  }
}
