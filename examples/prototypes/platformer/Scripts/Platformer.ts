import type { ScriptContext } from '@protomake/scripting';
import { show, sprite, bar } from './Helpers';
export const fields = {
  speed: { type: 'number', default: 220 },
  jumpSpeed: { type: 'number', default: 480 },
} as const;
/** Edge input is latched in update and consumed once by the fixed simulation. */
export default class Platformer {
  speed = 220;
  jumpSpeed = 480;
  private buffer = 0;
  private coyote = 0;
  private lives = 3;
  private collected = new Set<string>();
  private spawn: [number, number] = [-310, 130];
  private done = false;
  start(c: ScriptContext): void {
    this.reset(c);
  }
  private reset(c: ScriptContext): void {
    this.done = false;
    this.lives = 3;
    this.collected.clear();
    this.spawn = [-310, 130];
    this.buffer = 0;
    this.coyote = 0;
    c.setPosition(...this.spawn);
    c.physics.setVelocity(c.entity, 0, 0);
    for (let i = 1; i <= 4; i++) show(c, `Coin ${i}`, true);
    sprite(c, c.find('Checkpoint')!, { tint: '#f3ac66' });
    show(c, 'Victory', false);
    show(c, 'Defeat', false);
    bar(c, 'Health', 3, 3);
    bar(c, 'Score', 0, 4);
  }
  update(c: ScriptContext): void {
    if (c.input.wasPressed('Restart')) this.reset(c);
    if (!this.done && c.input.wasPressed('Jump')) this.buffer = 0.12;
    c.setParameter(
      'active',
      !this.done && Math.abs(c.input.getAxis('Move')) > 0.1,
    );
  }
  fixedUpdate(c: ScriptContext): void {
    if (this.done) {
      c.physics.setVelocity(c.entity, 0, 0);
      return;
    }
    const [x, y] = c.position(),
      dt = c.delta;
    const grounded =
      Boolean(c.physics.raycast([x, y + 15], [0, 1], 8, c.entity)) &&
      c.physics.velocity(c.entity)[1] >= 0;
    this.coyote = grounded ? 0.1 : Math.max(0, this.coyote - dt);
    this.buffer = Math.max(0, this.buffer - dt);
    let vy = c.physics.velocity(c.entity)[1];
    if (this.buffer > 0 && this.coyote > 0) {
      vy = -this.jumpSpeed;
      this.buffer = 0;
      this.coyote = 0;
      c.playAudio();
    }
    c.physics.setVelocity(c.entity, c.input.getAxis('Move') * this.speed, vy);
    for (let i = 1; i <= 4; i++) {
      const name = `Coin ${i}`,
        p = c.position(c.find(name)!);
      if (!this.collected.has(name) && Math.hypot(x - p[0], y - p[1]) < 30) {
        this.collected.add(name);
        show(c, name, false);
        bar(c, 'Score', this.collected.size, 4);
      }
    }
    const checkpoint = c.position(c.find('Checkpoint')!);
    if (Math.hypot(x - checkpoint[0], y - checkpoint[1]) < 35) {
      this.spawn = [-80, 55];
      sprite(c, c.find('Checkpoint')!, { tint: '#6ee7b7' });
    }
    if (y > 270 || Math.abs(x) > 400) {
      this.lives--;
      bar(c, 'Health', this.lives, 3);
      this.buffer = 0;
      this.coyote = 0;
      c.setPosition(...this.spawn);
      c.physics.setVelocity(c.entity, 0, 0);
      if (!this.lives) {
        this.done = true;
        show(c, 'Defeat', true);
      }
    }
    const goal = c.position(c.find('Goal')!);
    if (
      this.collected.size === 4 &&
      Math.hypot(x - goal[0], y - goal[1]) < 35
    ) {
      this.done = true;
      show(c, 'Victory', true);
    }
  }
}
