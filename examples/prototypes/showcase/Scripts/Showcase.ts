import type { ScriptContext } from '@protomake/scripting';
import type { LightData, SpriteData } from '@protomake/renderer';
import { clamp, show, sprite } from './Helpers';

export const fields = {
  speed: { type: 'number', default: 225 },
  jumpSpeed: { type: 'number', default: 500 },
} as const;

type Weapon = 'Sunblade' | 'Arc Caster';
interface Enemy {
  id: string;
  homeX: number;
  homeY: number;
  minX: number;
  maxX: number;
  hp: number;
  direction: number;
  cooldown: number;
  alive: boolean;
}
interface Shot {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
}

/**
 * A single vertical slice deliberately exercises ProtoMake systems together:
 * platforming physics, melee/ranged combat, inventory, a two-node light puzzle,
 * live UI, camera feedback, pooled projectiles, lighting and shadow gameplay.
 */
export default class Showcase {
  speed = 225;
  jumpSpeed = 500;
  private health = 5;
  private ammo = 0;
  private potions = 0;
  private hasCaster = false;
  private hasKey = false;
  private crystals = [false, false];
  private weapon: Weapon = 'Sunblade';
  private facing = 1;
  private jumpBuffer = 0;
  private coyote = 0;
  private attackRequest = false;
  private jumpRequest = false;
  private attackTime = 0;
  private attackHit = new Set<string>();
  private invulnerable = 0;
  private messageTime = 0;
  private done = false;
  private lantern = true;
  private enemies: Enemy[] = [];
  private shots: Shot[] = [];
  private hostileShots: Shot[] = [];

  start(c: ScriptContext): void {
    this.enemies = [
      this.enemy(c, 'Sentinel 1', -70, 166, -150, 15),
      this.enemy(c, 'Sentinel 2', 205, 166, 155, 270),
      this.enemy(c, 'Sentinel 3', 285, -6, 235, 340),
    ];
    this.shots = this.pool(c, 'Player bolt', 10);
    this.hostileShots = this.pool(c, 'Enemy bolt', 8);
    this.reset(c);
  }

  private enemy(
    c: ScriptContext,
    name: string,
    x: number,
    y: number,
    minX: number,
    maxX: number,
  ): Enemy {
    return {
      id: c.find(name)!,
      homeX: x,
      homeY: y,
      minX,
      maxX,
      hp: 3,
      direction: 1,
      cooldown: 1.2,
      alive: true,
    };
  }

  private pool(c: ScriptContext, prefix: string, count: number): Shot[] {
    return Array.from({ length: count }, (_, index) => ({
      id: c.find(`${prefix} ${index + 1}`)!,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      alive: false,
    }));
  }

  private reset(c: ScriptContext): void {
    this.health = 5;
    this.ammo = 0;
    this.potions = 0;
    this.hasCaster = false;
    this.hasKey = false;
    this.crystals = [false, false];
    this.weapon = 'Sunblade';
    this.facing = 1;
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.attackRequest = false;
    this.jumpRequest = false;
    this.attackTime = 0;
    this.attackHit.clear();
    this.invulnerable = 0;
    this.done = false;
    this.lantern = true;
    c.setPosition(-345, 166);
    c.physics.setVelocity(c.entity, 0, 0);
    for (const enemy of this.enemies) {
      enemy.hp = 3;
      enemy.direction = 1;
      enemy.cooldown = 0.8 + this.enemies.indexOf(enemy) * 0.45;
      enemy.alive = true;
      c.setPosition(enemy.homeX, enemy.homeY, enemy.id);
      sprite(c, enemy.id, { visible: true, tint: '#ffffff' });
    }
    for (const shot of [...this.shots, ...this.hostileShots])
      this.hideShot(c, shot);
    for (const pickup of [
      'Arc Caster pickup',
      'Potion pickup',
      'Energy cell 1',
      'Energy cell 2',
      'Vault Key',
    ])
      show(c, pickup, pickup !== 'Vault Key');
    show(c, 'Seal barrier', true);
    show(c, 'Bridge', false);
    show(c, 'Exit aura', false);
    show(c, 'Slash', false);
    show(c, 'Victory', false);
    show(c, 'Defeat', false);
    for (let i = 0; i < 2; i++) this.setCrystal(c, i, false);
    this.setLight(c, 'Player lantern', { intensity: 1.15 });
    this.setLight(c, 'Exit area light', { intensity: 0.12 });
    this.say(
      c,
      'Recover the Arc Caster. Its bolts can wake the two sun crystals.',
      5,
    );
    this.updateUi(c);
  }

  update(c: ScriptContext): void {
    if (c.input.wasPressed('Restart')) {
      this.reset(c);
      return;
    }
    if (this.done) return;
    if (c.input.wasPressed('Jump')) this.jumpRequest = true;
    if (c.input.wasPressed('Attack')) this.attackRequest = true;
    if (c.input.wasPressed('Sword')) this.selectWeapon(c, 'Sunblade');
    if (c.input.wasPressed('Blaster')) this.selectWeapon(c, 'Arc Caster');
    if (c.input.wasPressed('Switch'))
      this.selectWeapon(
        c,
        this.weapon === 'Sunblade' ? 'Arc Caster' : 'Sunblade',
      );
    if (c.input.wasPressed('Potion')) this.usePotion(c);
    if (c.input.wasPressed('Lantern')) {
      this.lantern = !this.lantern;
      this.setLight(c, 'Player lantern', {
        intensity: this.lantern ? 1.15 : 0,
      });
      this.say(c, `Lantern ${this.lantern ? 'lit' : 'extinguished'}.`, 1.5);
    }
  }

  fixedUpdate(c: ScriptContext): void {
    if (this.done) {
      c.physics.setVelocity(c.entity, 0, 0);
      return;
    }
    const dt = c.delta,
      [x, y] = c.position(),
      move = c.input.getAxis('Move');
    if (Math.abs(move) > 0.1) this.facing = Math.sign(move);
    const grounded =
      Boolean(c.physics.raycast([x, y + 16], [0, 1], 9, c.entity)) &&
      c.physics.velocity(c.entity)[1] >= 0;
    this.coyote = grounded ? 0.11 : Math.max(0, this.coyote - dt);
    if (this.jumpRequest) this.jumpBuffer = 0.13;
    this.jumpRequest = false;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    let vy = c.physics.velocity(c.entity)[1];
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      vy = -this.jumpSpeed;
      this.jumpBuffer = 0;
      this.coyote = 0;
      c.playAudio();
    }
    let vx = move * this.speed;
    if (!this.crystals.every(Boolean) && x < 63 && x + vx * dt > 63) {
      vx = 0;
      c.setPosition(62, y);
      this.say(c, 'The sun seal needs both crystals.', 1.2);
    }
    c.physics.setVelocity(c.entity, vx, vy);
    sprite(c, c.entity, {
      flipX: this.facing < 0,
      tint: this.invulnerable > 0 ? '#ff9b9b' : '#ffffff',
    });
    c.setParameter('active', Math.abs(move) > 0.1 || this.attackTime > 0);

    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.messageTime = Math.max(0, this.messageTime - dt);
    if (!this.messageTime) c.ui.setText(c.find('Message')!, '');

    this.updateAttack(c, dt);
    this.updateEnemies(c, dt);
    this.updateShots(c, dt);
    this.collectPickups(c);
    this.checkWorld(c);
    this.updateUi(c);
  }

  private selectWeapon(c: ScriptContext, weapon: Weapon): void {
    if (weapon === 'Arc Caster' && !this.hasCaster) {
      this.say(c, 'The Arc Caster is still sealed in the entrance chamber.', 2);
      return;
    }
    this.weapon = weapon;
    this.say(c, `${weapon} equipped.`, 1.2);
  }

  private usePotion(c: ScriptContext): void {
    if (!this.potions) return this.say(c, 'No restorative charges.', 1.5);
    if (this.health === 5) return this.say(c, 'Health is already full.', 1.5);
    this.potions--;
    this.health = Math.min(5, this.health + 2);
    this.say(c, 'Restorative charge consumed: +2 health.', 1.8);
    c.camera.zoomPulse(c.find('Camera')!, 0.05, 0.18);
  }

  private updateAttack(c: ScriptContext, dt: number): void {
    this.attackTime = Math.max(0, this.attackTime - dt);
    if (this.attackRequest && this.attackTime <= 0) {
      this.attackRequest = false;
      if (this.weapon === 'Sunblade') {
        this.attackTime = 0.28;
        this.attackHit.clear();
        c.playAudio();
        c.camera.kick(c.find('Camera')!, this.facing * 5, 0, 0.1);
      } else if (this.ammo > 0) {
        const shot = this.shots.find((candidate) => !candidate.alive);
        if (shot) {
          const [x, y] = c.position();
          this.ammo--;
          this.attackTime = 0.2;
          this.launch(c, shot, x + this.facing * 24, y, this.facing * 620, 0);
          c.playAudio();
          c.camera.kick(c.find('Camera')!, -this.facing * 4, 0, 0.08);
        }
      } else this.say(c, 'Arc Caster empty. Find an energy cell.', 1.5);
    }
    const active = this.weapon === 'Sunblade' && this.attackTime > 0.12;
    const slash = c.find('Slash')!,
      [x, y] = c.position();
    c.setPosition(x + this.facing * 33, y, slash);
    sprite(c, slash, { visible: active, flipX: this.facing < 0 });
    if (!active) return;
    for (const enemy of this.enemies) {
      if (!enemy.alive || this.attackHit.has(enemy.id)) continue;
      const [ex, ey] = c.position(enemy.id);
      if (
        (ex - x) * this.facing > 0 &&
        Math.abs(ex - x) < 67 &&
        Math.abs(ey - y) < 48
      ) {
        this.attackHit.add(enemy.id);
        this.damageEnemy(c, enemy, 2);
      }
    }
  }

  private updateEnemies(c: ScriptContext, dt: number): void {
    const [px, py] = c.position();
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const position = c.position(enemy.id),
        y = position[1];
      let x = position[0];
      x += enemy.direction * 34 * dt;
      if (x <= enemy.minX || x >= enemy.maxX) {
        enemy.direction *= -1;
        x = clamp(x, enemy.minX, enemy.maxX);
      }
      c.setPosition(x, y, enemy.id);
      sprite(c, enemy.id, { flipX: enemy.direction < 0 });
      enemy.cooldown -= dt;
      const distance = Math.hypot(px - x, py - y);
      if (distance < 285 && enemy.cooldown <= 0) {
        const shot = this.hostileShots.find((candidate) => !candidate.alive);
        if (shot) {
          const length = distance || 1;
          this.launch(
            c,
            shot,
            x,
            y,
            ((px - x) / length) * 250,
            ((py - y) / length) * 250,
          );
          enemy.cooldown = 1.7 + this.enemies.indexOf(enemy) * 0.25;
        }
      }
      if (distance < 35) this.damagePlayer(c, 1, x);
    }
  }

  private updateShots(c: ScriptContext, dt: number): void {
    for (const shot of this.shots) {
      if (!shot.alive) continue;
      const previousX = shot.x;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      c.setPosition(shot.x, shot.y, shot.id);
      for (let i = 0; i < 2; i++) {
        if (this.crystals[i]) continue;
        const [cx, cy] = c.position(c.find(`Sun crystal ${i + 1}`)!);
        if (
          Math.min(previousX, shot.x) <= cx + 18 &&
          Math.max(previousX, shot.x) >= cx - 18 &&
          Math.abs(shot.y - cy) < 28
        ) {
          this.setCrystal(c, i, true);
          this.hideShot(c, shot);
          break;
        }
      }
      if (!shot.alive) continue;
      const hit = this.enemies.find((enemy) => {
        if (!enemy.alive) return false;
        const [ex, ey] = c.position(enemy.id);
        return (
          Math.min(previousX, shot.x) <= ex + 20 &&
          Math.max(previousX, shot.x) >= ex - 20 &&
          Math.abs(shot.y - ey) < 26
        );
      });
      if (hit) {
        this.damageEnemy(c, hit, 1);
        this.hideShot(c, shot);
      } else if (Math.abs(shot.x) > 440 || Math.abs(shot.y) > 290)
        this.hideShot(c, shot);
    }
    for (const shot of this.hostileShots) {
      if (!shot.alive) continue;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      c.setPosition(shot.x, shot.y, shot.id);
      const [px, py] = c.position();
      if (Math.hypot(px - shot.x, py - shot.y) < 24) {
        this.damagePlayer(c, 1, shot.x);
        this.hideShot(c, shot);
      } else if (Math.abs(shot.x) > 440 || Math.abs(shot.y) > 290)
        this.hideShot(c, shot);
    }
  }

  private launch(
    c: ScriptContext,
    shot: Shot,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): void {
    Object.assign(shot, { x, y, vx, vy, alive: true });
    c.setPosition(x, y, shot.id);
    sprite(c, shot.id, { visible: true, flipX: vx < 0 });
  }

  private hideShot(c: ScriptContext, shot: Shot): void {
    shot.alive = false;
    sprite(c, shot.id, { visible: false });
  }

  private damageEnemy(c: ScriptContext, enemy: Enemy, amount: number): void {
    enemy.hp = Math.max(0, enemy.hp - amount);
    sprite(c, enemy.id, { tint: enemy.hp ? '#ff8f9b' : '#ffffff' });
    c.camera.shake(c.find('Camera')!, 4, 0.12);
    if (!enemy.hp) {
      enemy.alive = false;
      sprite(c, enemy.id, { visible: false });
      this.say(c, 'Sentinel dispersed.', 1);
    }
  }

  private damagePlayer(
    c: ScriptContext,
    amount: number,
    sourceX: number,
  ): void {
    if (this.invulnerable > 0 || this.done) return;
    this.health = Math.max(0, this.health - amount);
    this.invulnerable = 0.9;
    const [x] = c.position(),
      velocity = c.physics.velocity(c.entity);
    c.physics.setVelocity(
      c.entity,
      sourceX < x ? 180 : -180,
      velocity[1] - 120,
    );
    c.camera.shake(c.find('Camera')!, 9, 0.22);
    this.say(c, 'The vault answers violence with violence.', 1.3);
    if (!this.health) {
      this.done = true;
      show(c, 'Defeat', true);
    }
  }

  private collectPickups(c: ScriptContext): void {
    const [x, y] = c.position();
    const near = (name: string, radius = 34) => {
      const point = c.position(c.find(name)!);
      return Math.hypot(x - point[0], y - point[1]) < radius;
    };
    if (!this.hasCaster && near('Arc Caster pickup')) {
      this.hasCaster = true;
      this.ammo = 6;
      show(c, 'Arc Caster pickup', false);
      this.weapon = 'Arc Caster';
      this.say(c, 'ARC CASTER ACQUIRED — press 1/2 or Q to switch.', 3);
    }
    if (!this.potions && near('Potion pickup')) {
      this.potions = 1;
      show(c, 'Potion pickup', false);
      this.say(c, 'Restorative charge stored. Press H when wounded.', 2.5);
    }
    for (let i = 1; i <= 2; i++) {
      const name = `Energy cell ${i}`;
      if (
        c.get<SpriteData>('protomake.sprite', c.find(name)!)?.visible &&
        near(name)
      ) {
        this.ammo += 4;
        show(c, name, false);
        this.say(c, '+4 Arc Caster cells.', 1.5);
      }
    }
    if (
      this.crystals.every(Boolean) &&
      !this.hasKey &&
      c.get<SpriteData>('protomake.sprite', c.find('Vault Key')!)?.visible &&
      near('Vault Key')
    ) {
      this.hasKey = true;
      show(c, 'Vault Key', false);
      show(c, 'Exit aura', true);
      this.setLight(c, 'Exit area light', { intensity: 0.92 });
      this.say(c, 'VAULT KEY ACQUIRED — climb to the illuminated aperture.', 3);
    }
  }

  private checkWorld(c: ScriptContext): void {
    let [x, y] = c.position();
    if (y > 285 || Math.abs(x) > 430) {
      this.health = Math.max(0, this.health - 1);
      c.setPosition(this.crystals.every(Boolean) ? 145 : -345, 150);
      c.physics.setVelocity(c.entity, 0, 0);
      this.invulnerable = 1;
      this.say(c, 'The abyss rejects you. One health lost.', 1.8);
      if (!this.health) {
        this.done = true;
        show(c, 'Defeat', true);
      }
      [x, y] = c.position();
    }
    if (this.hasKey && x > 292 && y < -34) {
      this.done = true;
      show(c, 'Victory', true);
      c.achievements.unlock('vaultbreaker');
      c.camera.zoomPulse(c.find('Camera')!, 0.12, 0.5);
    }
  }

  private setCrystal(c: ScriptContext, index: number, active: boolean): void {
    this.crystals[index] = active;
    sprite(c, c.find(`Sun crystal ${index + 1}`)!, {
      tint: active ? '#fff3a6' : '#586579',
    });
    this.setLight(c, `Crystal light ${index + 1}`, {
      intensity: active ? 1.05 : 0.05,
    });
    if (!active) return;
    c.camera.shake(c.find('Camera')!, 6, 0.18);
    if (this.crystals.every(Boolean)) {
      show(c, 'Seal barrier', false);
      show(c, 'Bridge', true);
      show(c, 'Vault Key', true);
      this.say(
        c,
        'SUN SEAL BROKEN — bridge formed and inner vault opened.',
        3.2,
      );
    } else this.say(c, 'First sun crystal awakened. One remains.', 2.2);
  }

  private setLight(
    c: ScriptContext,
    name: string,
    changes: Partial<LightData>,
  ): void {
    const id = c.find(name)!,
      current = c.get<LightData>('protomake.light', id)!;
    c.set('protomake.light', { ...current, ...changes }, id);
  }

  private say(c: ScriptContext, message: string, seconds: number): void {
    c.ui.setText(c.find('Message')!, message);
    this.messageTime = seconds;
  }

  private updateUi(c: ScriptContext): void {
    c.ui.setText(
      c.find('Status')!,
      `HEALTH ${'◆'.repeat(this.health)}${'◇'.repeat(5 - this.health)}   ` +
        `${this.weapon.toUpperCase()}${this.weapon === 'Arc Caster' ? ` • ${this.ammo}` : ''}`,
    );
    c.ui.setText(
      c.find('Inventory')!,
      `INVENTORY  Caster ${this.hasCaster ? '✓' : '—'}  ` +
        `Crystals ${this.crystals.filter(Boolean).length}/2  ` +
        `Key ${this.hasKey ? '✓' : '—'}  Restorative ${this.potions}`,
    );
    const objective = !this.hasCaster
      ? 'Find the Arc Caster'
      : !this.crystals.every(Boolean)
        ? 'Shoot both sun crystals'
        : !this.hasKey
          ? 'Cross the bridge and recover the Vault Key'
          : 'Climb to the illuminated exit';
    c.ui.setText(c.find('Objective')!, `OBJECTIVE  ${objective}`);
  }
}
