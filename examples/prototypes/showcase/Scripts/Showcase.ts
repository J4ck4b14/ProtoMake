import type { ScriptContext } from '@protomake/scripting';
import type { LightData, SpriteData } from '@protomake/renderer';
import { clamp, sprite } from './Helpers';

type Room = 'gate' | 'gallery' | 'reliquary';
type Weapon = 'Sunblade' | 'Arc Caster';
type Entry = 'west' | 'east';

export const fields = {
  room: {
    type: 'string',
    default: 'gate',
    options: ['gate', 'gallery', 'reliquary'],
  },
  speed: { type: 'number', default: 220 },
  jumpSpeed: { type: 'number', default: 500 },
} as const;

interface RunState {
  health: number;
  ammo: number;
  potions: number;
  hasCaster: boolean;
  hasKey: boolean;
  lantern: boolean;
  weapon: Weapon;
  wards: [boolean, boolean];
  defeated: string[];
  collected: string[];
}

interface Enemy {
  id: string;
  key: string;
  homeX: number;
  homeY: number;
  minX: number;
  maxX: number;
  hp: number;
  maxHp: number;
  direction: number;
  cooldown: number;
  charge: number;
  charging: boolean;
  tell: string | undefined;
  alive: boolean;
}

interface Shot {
  id: string;
  glow: string | undefined;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
}

const RUN_KEY = 'luminous-vault.run';
const ENTRY_KEY = 'luminous-vault.entry';

function freshRun(): RunState {
  return {
    health: 5,
    ammo: 0,
    potions: 0,
    hasCaster: false,
    hasKey: false,
    lantern: true,
    weapon: 'Sunblade',
    wards: [false, false],
    defeated: [],
    collected: [],
  };
}

/** One controller is used in all three rooms; ctx.session carries the run. */
export default class Showcase {
  room: Room = 'gate';
  speed = 220;
  jumpSpeed = 500;
  private state: RunState = freshRun();
  private entry: Entry = 'west';
  private facing = 1;
  private jumpBuffer = 0;
  private coyote = 0;
  private attackRequest = false;
  private jumpRequest = false;
  private attackTime = 0;
  private attackHit = new Set<string>();
  private invulnerable = 0;
  private messageTime = 0;
  private transitioning = false;
  private done = false;
  private enemies: Enemy[] = [];
  private shots: Shot[] = [];
  private hostileShots: Shot[] = [];

  start(c: ScriptContext): void {
    this.state = c.session.get<RunState>(RUN_KEY) ?? freshRun();
    this.entry = c.session.get<Entry>(ENTRY_KEY) ?? 'west';
    this.enemies = this.readEnemies(c);
    this.shots = this.readPool(c, 'Player bolt', 'Player bolt glow', 8);
    this.hostileShots = this.readPool(c, 'Enemy bolt', 'Enemy bolt glow', 8);
    this.prepareRoom(c);
  }

  private readEnemies(c: ScriptContext): Enemy[] {
    const enemies: Enemy[] = [];
    for (let index = 1; index <= 4; index++) {
      const name = index === 4 ? 'Warden' : `Sentinel ${index}`,
        id = c.find(name);
      if (!id) continue;
      const [x, y] = c.position(id),
        maxHp = name === 'Warden' ? 7 : 3;
      enemies.push({
        id,
        key: `${this.room}.${name}`,
        homeX: x,
        homeY: y,
        minX: x - (name === 'Warden' ? 72 : 54),
        maxX: x + (name === 'Warden' ? 72 : 54),
        hp: maxHp,
        maxHp,
        direction: index % 2 ? 1 : -1,
        cooldown: 0.65 + index * 0.28,
        charge: 0,
        charging: false,
        tell: c.find(`Enemy tell ${index}`),
        alive: true,
      });
    }
    return enemies;
  }

  private readPool(
    c: ScriptContext,
    prefix: string,
    glowPrefix: string,
    count: number,
  ): Shot[] {
    return Array.from({ length: count }, (_, index) => ({
      id: c.find(`${prefix} ${index + 1}`)!,
      glow: c.find(`${glowPrefix} ${index + 1}`),
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      alive: false,
    }));
  }

  private prepareRoom(c: ScriptContext): void {
    this.transitioning = false;
    this.done = false;
    this.attackTime = 0;
    this.invulnerable = 0;
    const spawn = this.spawnPoint();
    c.setPosition(spawn[0], spawn[1]);
    c.physics.setVelocity(c.entity, 0, 0);
    for (const enemy of this.enemies) {
      enemy.alive = !this.state.defeated.includes(enemy.key);
      enemy.hp = enemy.maxHp;
      enemy.charge = 0;
      enemy.charging = false;
      this.setVisible(c, enemy.id, enemy.alive);
      if (enemy.tell) this.setVisible(c, enemy.tell, false);
      sprite(c, enemy.id, { tint: '#ffffff' });
    }
    for (const shot of [...this.shots, ...this.hostileShots])
      this.hideShot(c, shot);
    this.applyRoomState(c);
    this.setLight(c, 'Player lantern', {
      intensity: this.state.lantern ? 1.05 : 0,
    });
    this.setVisibleByName(c, 'Lantern flame', this.state.lantern);
    this.setVisibleByName(c, 'Lantern shutter', !this.state.lantern);
    this.setVisibleByName(c, 'Slash', false);
    this.setVisibleByName(c, 'Victory', false);
    this.setVisibleByName(c, 'Defeat', false);
    const veil = c.find('Transition veil');
    if (veil) {
      sprite(c, veil, { visible: true, opacity: 1 });
      c.tween.to(veil, {
        opacity: 0,
        duration: 0.42,
        easing: 'easeOutQuad',
        onComplete: () => this.setVisible(c, veil, false),
      });
    }
    this.say(c, this.arrivalMessage(), 3.8);
    this.store(c);
    this.updateUi(c);
  }

  private spawnPoint(): readonly [number, number] {
    if (this.room === 'gallery' && this.entry === 'east') return [342, -82];
    return [this.entry === 'west' ? -350 : 350, 166];
  }

  private arrivalMessage(): string {
    if (this.room === 'gate')
      return this.entry === 'east'
        ? 'THE BLACK GATE — the western threshold remains open.'
        : 'THE BLACK GATE — light reveals the way, but also reveals you. L shutters it.';
    if (this.room === 'gallery')
      return this.entry === 'east'
        ? 'THE DROWNED GALLERY — descend toward the western threshold.'
        : 'THE DROWNED GALLERY — recover the weapon sleeping below.';
    return 'THE RELIQUARY — the Warden carries the last seal.';
  }

  private applyRoomState(c: ScriptContext): void {
    if (this.room === 'gate') {
      this.setVisibleByName(
        c,
        'Potion pickup',
        !this.state.collected.includes('gate.potion'),
      );
      return;
    }
    if (this.room === 'gallery') {
      this.setVisibleByName(c, 'Arc Caster pickup', !this.state.hasCaster);
      for (let index = 1; index <= 2; index++)
        this.setVisibleByName(
          c,
          `Energy cell ${index}`,
          !this.state.collected.includes(`gallery.cell-${index}`),
        );
      for (let index = 0; index < 2; index++)
        this.setWard(c, index, this.state.wards[index] ?? false, false);
      const open = this.state.wards.every(Boolean);
      this.setEnabledByName(c, 'Ward bridge', open);
      this.setEnabledByName(c, 'East seal', !open);
      return;
    }
    const cleared = this.enemies.every((enemy) => !enemy.alive);
    this.setVisibleByName(c, 'Vault Key', cleared && !this.state.hasKey);
    this.setVisibleByName(c, 'Exit sigil', this.state.hasKey);
    this.setLight(c, 'Relic glimmer', {
      intensity: cleared && !this.state.hasKey ? 0.24 : 0,
    });
    this.setLight(c, 'Exit area light', {
      intensity: this.state.hasKey ? 0.62 : 0,
    });
  }

  update(c: ScriptContext): void {
    if (c.input.wasPressed('Restart')) {
      c.session.clear();
      c.session.set(ENTRY_KEY, 'west');
      c.loadScene('The Black Gate');
      return;
    }
    if (this.done || this.transitioning) return;
    if (c.input.wasPressed('Jump')) this.jumpRequest = true;
    if (c.input.wasPressed('Attack')) this.attackRequest = true;
    if (c.input.wasPressed('Sword')) this.selectWeapon(c, 'Sunblade');
    if (c.input.wasPressed('Blaster')) this.selectWeapon(c, 'Arc Caster');
    if (c.input.wasPressed('Switch'))
      this.selectWeapon(
        c,
        this.state.weapon === 'Sunblade' ? 'Arc Caster' : 'Sunblade',
      );
    if (c.input.wasPressed('Potion')) this.usePotion(c);
    if (c.input.wasPressed('Lantern')) {
      this.state.lantern = !this.state.lantern;
      this.setLight(c, 'Player lantern', {
        intensity: this.state.lantern ? 1.05 : 0,
      });
      this.setVisibleByName(c, 'Lantern flame', this.state.lantern);
      this.setVisibleByName(c, 'Lantern shutter', !this.state.lantern);
      this.say(
        c,
        this.state.lantern
          ? 'Lantern opened. You can see—and the sentinels can find you.'
          : 'Lantern shuttered. Distant sentinels lose your trail.',
        2.2,
      );
      this.sound(c, 'Transition audio');
      this.store(c);
    }
  }

  fixedUpdate(c: ScriptContext): void {
    if (this.done || this.transitioning) {
      c.physics.setVelocity(c.entity, 0, 0);
      return;
    }
    const dt = c.delta,
      [x, y] = c.position(),
      move = c.input.getAxis('Move');
    if (Math.abs(move) > 0.1) this.facing = Math.sign(move);
    const grounded =
      Boolean(c.physics.raycast([x, y + 17], [0, 1], 8, c.entity)) &&
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
    c.physics.setVelocity(c.entity, move * this.speed, vy);
    sprite(c, c.entity, {
      flipX: this.facing < 0,
      tint: this.invulnerable > 0 ? '#ff7f91' : '#ffffff',
    });
    if (this.state.lantern)
      this.setLight(c, 'Player lantern', {
        intensity:
          1.01 +
          Math.sin(c.elapsed * 7.3) * 0.035 +
          Math.sin(c.elapsed * 17) * 0.015,
      });
    for (let index = 1; index <= 7; index++) {
      const glint = c.find(`Water glint ${index}`);
      if (glint)
        sprite(c, glint, {
          opacity: 0.28 + Math.sin(c.elapsed * 1.7 + index * 1.31) * 0.14,
        });
    }
    c.setParameter('active', Math.abs(move) > 0.1 || this.attackTime > 0);

    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.messageTime = Math.max(0, this.messageTime - dt);
    if (!this.messageTime) {
      const message = c.find('Message')!;
      c.ui.setText(message, '');
      c.ui.setVisible(message, false);
    }

    this.updateAttack(c, dt);
    this.updateEnemies(c, dt);
    this.updateShots(c, dt);
    this.collectPickups(c);
    this.checkRoom(c);
    this.store(c);
    this.updateUi(c);
  }

  private selectWeapon(c: ScriptContext, weapon: Weapon): void {
    if (weapon === 'Arc Caster' && !this.state.hasCaster) {
      this.say(c, 'The Arc Caster lies deeper in the gallery.', 1.8);
      return;
    }
    this.state.weapon = weapon;
    this.say(c, `${weapon} equipped.`, 1.1);
    this.sound(c, 'Pickup audio');
  }

  private usePotion(c: ScriptContext): void {
    if (!this.state.potions) {
      this.say(c, 'No restorative charge.', 1.4);
      return;
    }
    if (this.state.health === 5) {
      this.say(c, 'Health is already full.', 1.4);
      return;
    }
    this.state.potions--;
    this.state.health = Math.min(5, this.state.health + 2);
    this.say(c, 'Restorative consumed: +2 health.', 1.6);
    this.sound(c, 'Pickup audio');
    const [x, y] = c.position();
    this.effect(c, 'Gold impact', x, y, 10);
    c.camera.zoomPulse(c.find('Camera')!, 0.05, 0.18);
  }

  private updateAttack(c: ScriptContext, dt: number): void {
    this.attackTime = Math.max(0, this.attackTime - dt);
    if (this.attackRequest && this.attackTime <= 0) {
      this.attackRequest = false;
      if (this.state.weapon === 'Sunblade') {
        this.attackTime = 0.28;
        this.attackHit.clear();
        this.sound(c, 'Sword audio');
        const [x, y] = c.position();
        this.effect(c, 'Gold impact', x + this.facing * 29, y, 5);
        c.camera.kick(c.find('Camera')!, this.facing * 5, 0, 0.09);
      } else if (this.state.ammo > 0) {
        const shot = this.shots.find((candidate) => !candidate.alive);
        if (shot) {
          const [x, y] = c.position();
          this.state.ammo--;
          this.attackTime = 0.2;
          const [aimX, aimY] = this.rangedAim(c, x, y);
          this.launch(c, shot, x + this.facing * 24, y, aimX * 600, aimY * 600);
          this.sound(c, 'Caster audio');
          this.effect(c, 'Cyan impact', x + this.facing * 25, y, 6);
          c.camera.kick(c.find('Camera')!, -this.facing * 4, 0, 0.08);
        }
      } else this.say(c, 'Arc Caster empty. Search for a cyan cell.', 1.6);
    }
    const active = this.state.weapon === 'Sunblade' && this.attackTime > 0.12,
      slash = c.find('Slash')!,
      [x, y] = c.position();
    c.setPosition(x + this.facing * 32, y, slash);
    sprite(c, slash, { visible: active, flipX: this.facing < 0 });
    if (!active) return;
    for (const enemy of this.enemies) {
      if (!enemy.alive || this.attackHit.has(enemy.id)) continue;
      const [ex, ey] = c.position(enemy.id);
      if (
        (ex - x) * this.facing > 0 &&
        Math.abs(ex - x) < 64 &&
        Math.abs(ey - y) < 46
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
      let x = position[0] + enemy.direction * (enemy.maxHp > 3 ? 26 : 31) * dt;
      if (x <= enemy.minX || x >= enemy.maxX) {
        enemy.direction *= -1;
        x = clamp(x, enemy.minX, enemy.maxX);
      }
      c.setPosition(x, y, enemy.id);
      sprite(c, enemy.id, { flipX: enemy.direction < 0 });
      const distance = Math.hypot(px - x, py - y);
      if (enemy.charging) {
        enemy.charge = Math.max(0, enemy.charge - dt);
        if (enemy.tell) {
          c.setPosition(x, y - (enemy.maxHp > 3 ? 6 : 2), enemy.tell);
          sprite(c, enemy.tell, {
            visible: true,
            opacity: 0.48 + Math.sin(c.elapsed * 34) * 0.38,
          });
        }
        if (!enemy.charge) this.fireEnemy(c, enemy, px, py, x, y);
      } else {
        enemy.cooldown = Math.max(0, enemy.cooldown - dt);
        const awareness = this.state.lantern
            ? enemy.maxHp > 3
              ? 340
              : 286
            : enemy.maxHp > 3
              ? 150
              : 112,
          exposed =
            distance < awareness &&
            c.canSee(c.entity, awareness, 360, enemy.id);
        if (exposed && !enemy.cooldown) {
          enemy.charging = true;
          enemy.charge = enemy.maxHp > 3 ? 0.46 : 0.34;
        }
      }
      if (distance < 34) this.damagePlayer(c, 1, x);
    }
  }

  private fireEnemy(
    c: ScriptContext,
    enemy: Enemy,
    playerX: number,
    playerY: number,
    x: number,
    y: number,
  ): void {
    enemy.charging = false;
    enemy.cooldown = enemy.maxHp > 3 ? 1.3 : 1.85;
    if (enemy.tell) this.setVisible(c, enemy.tell, false);
    const base = Math.atan2(playerY - y, playerX - x),
      spreads = enemy.maxHp > 3 ? [-0.16, 0, 0.16] : [0];
    let fired = false;
    for (const spread of spreads) {
      const shot = this.hostileShots.find((candidate) => !candidate.alive);
      if (!shot) break;
      const angle = base + spread,
        speed = enemy.maxHp > 3 ? 255 : 235;
      this.launch(
        c,
        shot,
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
      );
      fired = true;
    }
    if (fired) {
      this.sound(c, 'Enemy audio');
      this.effect(c, 'Red impact', x, y, enemy.maxHp > 3 ? 9 : 4);
    }
  }

  private updateShots(c: ScriptContext, dt: number): void {
    for (const shot of this.shots) {
      if (!shot.alive) continue;
      const previousX = shot.x;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      this.positionShot(c, shot);
      if (this.room === 'gallery') {
        for (let index = 0; index < 2; index++) {
          if (this.state.wards[index]) continue;
          const ward = c.find(`Ward crystal ${index + 1}`),
            point = ward ? c.position(ward) : undefined;
          if (
            point &&
            Math.min(previousX, shot.x) <= point[0] + 18 &&
            Math.max(previousX, shot.x) >= point[0] - 18 &&
            Math.abs(shot.y - point[1]) < 27
          ) {
            this.setWard(c, index, true, true);
            this.hideShot(c, shot);
            break;
          }
        }
      }
      if (!shot.alive) continue;
      const hit = this.enemies.find((enemy) => {
        if (!enemy.alive) return false;
        const [ex, ey] = c.position(enemy.id);
        return (
          Math.min(previousX, shot.x) <= ex + 21 &&
          Math.max(previousX, shot.x) >= ex - 21 &&
          Math.abs(shot.y - ey) < 27
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
      const previousX = shot.x,
        previousY = shot.y;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      this.positionShot(c, shot);
      const travel = Math.hypot(shot.x - previousX, shot.y - previousY),
        worldHit = travel
          ? c.physics.raycast(
              [previousX, previousY],
              [shot.x - previousX, shot.y - previousY],
              travel,
            )
          : null;
      if (worldHit) {
        if (worldHit.entity === c.entity)
          this.damagePlayer(c, 1, worldHit.point[0]);
        else
          this.effect(c, 'Red impact', worldHit.point[0], worldHit.point[1], 7);
        this.hideShot(c, shot);
        continue;
      }
      const [px, py] = c.position();
      if (Math.hypot(px - shot.x, py - shot.y) < 23) {
        this.damagePlayer(c, 1, shot.x);
        this.hideShot(c, shot);
      } else if (Math.abs(shot.x) > 440 || Math.abs(shot.y) > 290)
        this.hideShot(c, shot);
    }
  }

  private rangedAim(
    c: ScriptContext,
    x: number,
    y: number,
  ): readonly [number, number] {
    const candidates: { x: number; y: number; ward: boolean }[] = [];
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const [targetX, targetY] = c.position(enemy.id);
      candidates.push({ x: targetX, y: targetY, ward: false });
    }
    if (this.room === 'gallery')
      for (let index = 0; index < 2; index++) {
        if (this.state.wards[index]) continue;
        const ward = c.find(`Ward crystal ${index + 1}`);
        if (!ward) continue;
        const [targetX, targetY] = c.position(ward);
        candidates.push({ x: targetX, y: targetY, ward: true });
      }
    const target = candidates
      .map((candidate) => {
        const dx = candidate.x - x,
          dy = candidate.y - y,
          distance = Math.hypot(dx, dy),
          forward = dx * this.facing,
          angle = Math.abs(Math.atan2(dy, Math.max(1, forward)));
        return {
          ...candidate,
          dx,
          dy,
          distance,
          score: angle * 260 + distance - (candidate.ward ? 45 : 0),
          valid: forward > -4 && distance < 390 && angle < 1.15,
        };
      })
      .filter((candidate) => candidate.valid)
      .sort((a, b) => a.score - b.score)[0];
    if (!target) return [this.facing, 0];
    const length = target.distance || 1;
    return [target.dx / length, target.dy / length];
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
    this.positionShot(c, shot);
    sprite(c, shot.id, { visible: true, flipX: vx < 0 });
    if (shot.glow)
      this.setLightById(c, shot.glow, {
        intensity: this.shots.includes(shot) ? 0.28 : 0.5,
      });
  }

  private positionShot(c: ScriptContext, shot: Shot): void {
    c.setPosition(shot.x, shot.y, shot.id);
    if (shot.glow) c.setPosition(shot.x, shot.y, shot.glow);
  }

  private hideShot(c: ScriptContext, shot: Shot): void {
    shot.alive = false;
    sprite(c, shot.id, { visible: false });
    if (shot.glow) this.setLightById(c, shot.glow, { intensity: 0 });
  }

  private damageEnemy(c: ScriptContext, enemy: Enemy, amount: number): void {
    enemy.hp = Math.max(0, enemy.hp - amount);
    sprite(c, enemy.id, { tint: enemy.hp ? '#ff7089' : '#ffffff' });
    const [x, y] = c.position(enemy.id);
    this.effect(c, 'Red impact', x, y, enemy.hp ? 7 : 15);
    this.sound(c, 'Impact audio');
    c.camera.shake(c.find('Camera')!, enemy.maxHp > 3 ? 7 : 4, 0.12);
    if (!enemy.hp) {
      enemy.alive = false;
      enemy.charging = false;
      this.setVisible(c, enemy.id, false);
      if (enemy.tell) this.setVisible(c, enemy.tell, false);
      if (!this.state.defeated.includes(enemy.key))
        this.state.defeated.push(enemy.key);
      this.say(
        c,
        enemy.maxHp > 3 ? 'THE WARDEN IS DARK.' : 'Sentinel extinguished.',
        1.5,
      );
      if (
        this.room === 'reliquary' &&
        this.enemies.every((item) => !item.alive)
      ) {
        this.setVisibleByName(c, 'Vault Key', true);
        this.setLight(c, 'Relic glimmer', { intensity: 0.24 });
        this.sound(c, 'Ward audio');
        this.say(c, 'The last seal breaks. Take the Vault Key.', 3);
      }
    }
  }

  private damagePlayer(
    c: ScriptContext,
    amount: number,
    sourceX: number,
  ): void {
    if (this.invulnerable > 0 || this.done) return;
    this.state.health = Math.max(0, this.state.health - amount);
    this.invulnerable = 0.85;
    const [x] = c.position(),
      velocity = c.physics.velocity(c.entity);
    c.physics.setVelocity(
      c.entity,
      sourceX < x ? 170 : -170,
      velocity[1] - 110,
    );
    this.effect(c, 'Red impact', x, c.position()[1], 11);
    this.sound(c, 'Hurt audio');
    c.camera.shake(c.find('Camera')!, 9, 0.22);
    this.say(c, 'A red bolt finds you in the dark.', 1.3);
    if (!this.state.health) {
      this.done = true;
      this.setVisibleByName(c, 'Defeat', true);
    }
  }

  private collectPickups(c: ScriptContext): void {
    const [x, y] = c.position(),
      near = (name: string, radius = 33) => {
        const id = c.find(name);
        if (!id || !c.get<SpriteData>('protomake.sprite', id)?.visible)
          return false;
        const point = c.position(id);
        return Math.hypot(x - point[0], y - point[1]) < radius;
      };
    if (this.room === 'gate' && near('Potion pickup')) {
      this.state.potions++;
      this.state.collected.push('gate.potion');
      this.setVisibleByName(c, 'Potion pickup', false);
      this.sound(c, 'Pickup audio');
      this.effect(c, 'Gold impact', x, y, 12);
      this.say(c, 'Restorative stored. Press H when wounded.', 2.2);
    }
    if (
      this.room === 'gallery' &&
      !this.state.hasCaster &&
      near('Arc Caster pickup')
    ) {
      this.state.hasCaster = true;
      this.state.ammo = 24;
      this.state.weapon = 'Arc Caster';
      this.setVisibleByName(c, 'Arc Caster pickup', false);
      this.sound(c, 'Pickup audio');
      this.effect(c, 'Cyan impact', x, y, 15);
      this.say(
        c,
        'ARC CASTER ACQUIRED — face a ward ring and fire. Bolts bend toward nearby targets.',
        3,
      );
    }
    for (let index = 1; index <= 2; index++) {
      const name = `Energy cell ${index}`;
      if (near(name)) {
        this.state.ammo += 8;
        this.state.collected.push(`gallery.cell-${index}`);
        this.setVisibleByName(c, name, false);
        this.sound(c, 'Pickup audio');
        this.effect(c, 'Cyan impact', x, y, 9);
        this.say(c, '+8 Arc Caster cells.', 1.4);
      }
    }
    if (this.room === 'reliquary' && !this.state.hasKey && near('Vault Key')) {
      this.state.hasKey = true;
      this.setVisibleByName(c, 'Vault Key', false);
      this.setVisibleByName(c, 'Exit sigil', true);
      this.setLight(c, 'Relic glimmer', { intensity: 0 });
      this.setLight(c, 'Exit area light', { intensity: 0.62 });
      this.sound(c, 'Ward audio');
      this.effect(c, 'Gold impact', x, y, 18);
      this.say(c, 'VAULT KEY ACQUIRED — follow the pale aperture east.', 3);
    }
  }

  private setWard(
    c: ScriptContext,
    index: number,
    active: boolean,
    announce: boolean,
  ): void {
    this.state.wards[index] = active;
    const ward = c.find(`Ward crystal ${index + 1}`);
    if (ward) sprite(c, ward, { tint: active ? '#d8ffff' : '#33485a' });
    this.setVisibleByName(c, `Ward beacon ${index + 1}`, active);
    this.setLight(c, `Ward light ${index + 1}`, {
      intensity: active ? 0.34 : 0.03,
    });
    if (!active) return;
    const point = ward ? c.position(ward) : [0, 0];
    this.effect(c, 'Cyan impact', point[0], point[1], 16);
    this.sound(c, 'Ward audio');
    c.camera.shake(c.find('Camera')!, 5, 0.16);
    const open = this.state.wards.every(Boolean);
    if (open) {
      this.setEnabledByName(c, 'Ward bridge', true);
      this.setEnabledByName(c, 'East seal', false);
      if (announce)
        this.say(c, 'BOTH WARDS ANSWER — the eastern passage opens.', 3);
    } else if (announce)
      this.say(c, 'One ward answers. Climb and face the second ring.', 2.2);
  }

  private checkRoom(c: ScriptContext): void {
    let [x, y] = c.position();
    if (y > 280) {
      this.state.health = Math.max(0, this.state.health - 1);
      this.effect(c, 'Water impact', x, 232, 18);
      this.sound(c, 'Hurt audio');
      const spawn = this.spawnPoint();
      c.setPosition(spawn[0], spawn[1]);
      c.physics.setVelocity(c.entity, 0, 0);
      this.invulnerable = 1;
      this.say(c, 'The black water takes one health.', 1.8);
      if (!this.state.health) {
        this.done = true;
        this.setVisibleByName(c, 'Defeat', true);
      }
      [x, y] = c.position();
    }
    if (this.room === 'gate' && x > 382) {
      this.travel(c, 'The Drowned Gallery', 'west');
      return;
    }
    if (this.room === 'gallery') {
      if (x < -382 && y > 112) {
        this.travel(c, 'The Black Gate', 'east');
        return;
      }
      if (x > 310 && y < 5 && !this.state.wards.every(Boolean)) {
        c.setPosition(308, y);
        c.physics.setVelocity(c.entity, 0, c.physics.velocity(c.entity)[1]);
        this.say(c, 'Two ward crystals hold the eastern seal.', 1.5);
      } else if (x > 382 && y < 5 && this.state.wards.every(Boolean)) {
        this.travel(c, 'The Reliquary', 'west');
        return;
      }
    }
    if (this.room === 'reliquary') {
      if (x < -382) {
        this.travel(c, 'The Drowned Gallery', 'east');
        return;
      }
      if (x > 382 && !this.state.hasKey) {
        c.setPosition(380, y);
        this.say(c, 'The aperture has no key and no light.', 1.4);
      } else if (x > 382 && this.state.hasKey) {
        this.done = true;
        this.setVisibleByName(c, 'Victory', true);
        this.sound(c, 'Ward audio');
        c.achievements.unlock('vaultbreaker');
        c.camera.zoomPulse(c.find('Camera')!, 0.12, 0.5);
      }
    }
  }

  private travel(c: ScriptContext, scene: string, entry: Entry): void {
    if (this.transitioning) return;
    this.transitioning = true;
    c.session.set(ENTRY_KEY, entry);
    this.store(c);
    this.sound(c, 'Transition audio');
    const veil = c.find('Transition veil');
    if (!veil) {
      c.loadScene(scene);
      return;
    }
    sprite(c, veil, { visible: true, opacity: 0 });
    c.tween.to(veil, {
      opacity: 1,
      duration: 0.2,
      easing: 'easeInQuad',
      onComplete: () => c.loadScene(scene),
    });
  }

  private store(c: ScriptContext): void {
    c.session.set(RUN_KEY, this.state);
  }

  private say(c: ScriptContext, message: string, seconds: number): void {
    const panel = c.find('Message')!;
    c.ui.setText(panel, message);
    c.ui.setVisible(panel, true);
    this.messageTime = seconds;
  }

  private updateUi(c: ScriptContext): void {
    c.ui.setText(
      c.find('Status')!,
      `HEALTH ${'◆'.repeat(this.state.health)}${'◇'.repeat(5 - this.state.health)}  ` +
        `${this.state.weapon.toUpperCase()}${this.state.weapon === 'Arc Caster' ? ` · ${this.state.ammo}` : ''}`,
    );
    c.ui.setText(
      c.find('Inventory')!,
      `CASTER ${this.state.hasCaster ? '✓' : '—'}   WARDS ${this.state.wards.filter(Boolean).length}/2   ` +
        `KEY ${this.state.hasKey ? '✓' : '—'}   RESTORE ${this.state.potions}   ` +
        `LIGHT ${this.state.lantern ? 'OPEN' : 'SHUTTERED'}`,
    );
    const room =
        this.room === 'gate'
          ? 'I · THE BLACK GATE'
          : this.room === 'gallery'
            ? 'II · THE DROWNED GALLERY'
            : 'III · THE RELIQUARY',
      objective =
        this.room === 'gate'
          ? 'Cross the eastern threshold'
          : this.room === 'gallery' && !this.state.hasCaster
            ? 'Recover the Arc Caster below'
            : this.room === 'gallery' && !this.state.wards.every(Boolean)
              ? 'Face each ward ring and fire the Arc Caster'
              : this.room === 'gallery'
                ? 'Climb through the eastern seal'
                : !this.enemies.every((enemy) => !enemy.alive)
                  ? 'Extinguish the Reliquary guard'
                  : !this.state.hasKey
                    ? 'Take the Vault Key'
                    : 'Enter the pale aperture';
    c.ui.setText(c.find('Objective')!, `${room}\n${objective}`);
  }

  private setVisibleByName(
    c: ScriptContext,
    name: string,
    visible: boolean,
  ): void {
    const id = c.find(name);
    if (id) this.setVisible(c, id, visible);
  }

  private setVisible(c: ScriptContext, id: string, visible: boolean): void {
    const current = c.get<SpriteData>('protomake.sprite', id);
    if (current) sprite(c, id, { visible });
  }

  private effect(
    c: ScriptContext,
    name: string,
    x: number,
    y: number,
    count: number,
  ): void {
    const id = c.find(name);
    if (!id) return;
    c.setPosition(x, y, id);
    c.particles.emit(id, count);
  }

  private sound(c: ScriptContext, name: string): void {
    const id = c.find(name);
    if (id) c.playAudio(id);
  }

  private setEnabledByName(
    c: ScriptContext,
    name: string,
    enabled: boolean,
  ): void {
    const stable = c.find(name),
      id = stable ? c.world.find(stable) : undefined;
    if (id !== undefined) c.world.setEnabled(id, enabled);
  }

  private setLight(
    c: ScriptContext,
    name: string,
    changes: Partial<LightData>,
  ): void {
    const id = c.find(name);
    if (id) this.setLightById(c, id, changes);
  }

  private setLightById(
    c: ScriptContext,
    id: string,
    changes: Partial<LightData>,
  ): void {
    const current = c.get<LightData>('protomake.light', id);
    if (current) c.set('protomake.light', { ...current, ...changes }, id);
  }
}
