import RAPIER from '@dimforge/rapier2d-compat';
import {
  World,
  EventBus,
  compose,
  inverse,
  multiply,
  type Matrix2D,
} from '@protomake/core';
import type { EngineContext } from '@protomake/runtime';
import {
  Rigidbody2D,
  BoxCollider2D,
  CircleCollider2D,
  CapsuleCollider2D,
  collisionGroups,
  PhysicsSettingsSchema,
  type PhysicsSettings,
  type BodyData,
} from './components';
export interface ContactEvent {
  a: string;
  b: string;
  started: boolean;
  sensor: boolean;
}
export interface RayHit {
  entity: string;
  distance: number;
  normal: readonly [number, number];
  point: readonly [number, number];
}
interface BodyRecord {
  body: RAPIER.RigidBody;
  mode: BodyData['mode'];
  sx: number;
  sy: number;
  signature: readonly unknown[];
}
let initialized: Promise<void> | undefined;
export class Physics2D {
  readonly id = 'protomake.physics';
  readonly events = new EventBus<{ contact: ContactEvent }>();
  private readonly bodies = new Map<number, BodyRecord>();
  private readonly colliderOwners = new Map<
    number,
    { entity: number; sensor: boolean }
  >();
  private disposed = false;
  private constructor(
    readonly world: World,
    readonly settings: PhysicsSettings,
    private readonly physics: RAPIER.World,
    private readonly queue: RAPIER.EventQueue,
  ) {}
  static async create(
    world: World,
    settings: PhysicsSettings,
  ): Promise<Physics2D> {
    initialized ??= RAPIER.init();
    await initialized;
    const validated = PhysicsSettingsSchema.parse(settings);
    const service = new Physics2D(
      world,
      validated,
      new RAPIER.World({ x: validated.gravityX, y: validated.gravityY }),
      new RAPIER.EventQueue(true),
    );
    try {
      service.sync();
      return service;
    } catch (error) {
      service.destroy();
      throw error;
    }
  }
  private affine(id: number): {
    x: number;
    y: number;
    rotation: number;
    sx: number;
    sy: number;
  } {
    const m = this.world.worldMatrix(id),
      sx = Math.hypot(m[0], m[1]),
      sy = Math.hypot(m[2], m[3]);
    if (
      sx < 1e-8 ||
      sy < 1e-8 ||
      Math.abs(m[0] * m[2] + m[1] * m[3]) / (sx * sy) > 1e-5
    )
      throw new Error(
        `Physics entity ${this.world.get(id).name}: zero scale and shear are unsupported`,
      );
    return {
      x: m[4],
      y: m[5],
      rotation: Math.atan2(m[1], m[0]),
      sx,
      sy: (m[0] * m[3] - m[1] * m[2] < 0 ? -1 : 1) * sy,
    };
  }
  private signature(id: number): readonly unknown[] {
    return [
      this.world.read(id, Rigidbody2D),
      this.world.read(id, BoxCollider2D),
      this.world.read(id, CircleCollider2D),
      this.world.read(id, CapsuleCollider2D),
    ];
  }
  private remove(id: number): void {
    const record = this.bodies.get(id);
    if (!record) return;
    for (let i = 0; i < record.body.numColliders(); i++)
      this.colliderOwners.delete(record.body.collider(i).handle);
    this.physics.removeRigidBody(record.body);
    this.bodies.delete(id);
  }
  private sync(): void {
    const candidates = new Set<number>();
    for (const type of [
      Rigidbody2D.type,
      BoxCollider2D.type,
      CircleCollider2D.type,
      CapsuleCollider2D.type,
    ])
      for (const [id] of this.world.query(type)) candidates.add(id);
    for (const id of this.bodies.keys())
      if (!candidates.has(id)) this.remove(id);
    for (const id of candidates) {
      const transform = this.affine(id),
        signature = this.signature(id),
        existing = this.bodies.get(id);
      if (
        existing &&
        existing.signature.every((v, i) => v === signature[i]) &&
        Math.abs(existing.sx - transform.sx) < 1e-6 &&
        Math.abs(existing.sy - transform.sy) < 1e-6
      ) {
        existing.body.setEnabled(this.world.isActive(id));
        continue;
      }
      if (existing) this.remove(id);
      const data = this.world.read(id, Rigidbody2D) ?? {
          ...Rigidbody2D.defaults(),
          mode: 'static',
        },
        desc =
          data.mode === 'dynamic'
            ? RAPIER.RigidBodyDesc.dynamic()
            : data.mode === 'kinematic'
              ? RAPIER.RigidBodyDesc.kinematicPositionBased()
              : RAPIER.RigidBodyDesc.fixed();
      desc
        .setTranslation(transform.x, transform.y)
        .setRotation(transform.rotation)
        .setGravityScale(data.gravityScale)
        .setLinearDamping(data.linearDamping)
        .setAngularDamping(data.angularDamping)
        .setCcdEnabled(data.continuous)
        .setLinvel(data.velocityX, data.velocityY)
        .setAngvel(data.angularVelocity)
        .setEnabled(this.world.isActive(id));
      if (data.freezeRotation) desc.lockRotations();
      const body = this.physics.createRigidBody(desc);
      this.bodies.set(id, {
        body,
        mode: data.mode,
        sx: transform.sx,
        sy: transform.sy,
        signature,
      });
      const sx = Math.abs(transform.sx),
        sy = Math.abs(transform.sy);
      const box = this.world.read(id, BoxCollider2D),
        circle = this.world.read(id, CircleCollider2D),
        capsule = this.world.read(id, CapsuleCollider2D);
      const colliders: {
        desc: RAPIER.ColliderDesc;
        data: typeof box | typeof circle | typeof capsule;
      }[] = [];
      if (box)
        colliders.push({
          desc: RAPIER.ColliderDesc.cuboid(
            (box.width * sx) / 2,
            (box.height * sy) / 2,
          ),
          data: box,
        });
      if ((circle || capsule) && Math.abs(sx - sy) > 1e-5)
        throw new Error(
          `Physics entity ${this.world.get(id).name}: circle/capsule requires uniform scale`,
        );
      if (circle)
        colliders.push({
          desc: RAPIER.ColliderDesc.ball(circle.radius * sx),
          data: circle,
        });
      if (capsule)
        colliders.push({
          desc: RAPIER.ColliderDesc.capsule(
            capsule.halfHeight * sy,
            capsule.radius * sx,
          ),
          data: capsule,
        });
      for (const item of colliders) {
        const colliderData = item.data!;
        item.desc
          .setTranslation(
            colliderData.offsetX * transform.sx,
            colliderData.offsetY * transform.sy,
          )
          .setSensor(colliderData.sensor)
          .setFriction(colliderData.friction)
          .setRestitution(colliderData.restitution)
          .setCollisionGroups(
            collisionGroups(colliderData.layer, this.settings),
          )
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
          .setMass(data.mass / Math.max(1, colliders.length));
        const collider = this.physics.createCollider(item.desc, body);
        this.colliderOwners.set(collider.handle, {
          entity: id,
          sensor: colliderData.sensor,
        });
      }
      if (colliders.length === 0) body.setAdditionalMass(data.mass, true);
    }
  }
  fixedUpdate(context: EngineContext): void {
    this.step(context.time.fixedDelta);
  }
  step(dt: number): void {
    if (this.disposed) throw new Error('Physics world disposed');
    if (!Number.isFinite(dt) || dt <= 0)
      throw new Error('Physics dt must be positive');
    this.sync();
    for (const [id, record] of this.bodies)
      if (record.mode !== 'dynamic') {
        const t = this.affine(id);
        if (record.mode === 'kinematic') {
          record.body.setNextKinematicTranslation({ x: t.x, y: t.y });
          record.body.setNextKinematicRotation(t.rotation);
        } else {
          record.body.setTranslation({ x: t.x, y: t.y }, true);
          record.body.setRotation(t.rotation, true);
        }
      }
    this.physics.timestep = dt;
    this.physics.step(this.queue);
    for (const [id, record] of this.bodies)
      if (record.mode === 'dynamic' && record.body.isEnabled()) {
        const t = record.body.translation(),
          world = compose(
            t.x,
            t.y,
            record.body.rotation(),
            record.sx,
            record.sy,
          );
        this.writeWorld(id, world);
      }
    this.queue.drainCollisionEvents((a, b, started) => {
      const aa = this.colliderOwners.get(a),
        bb = this.colliderOwners.get(b);
      if (
        !aa ||
        !bb ||
        !this.world.has(aa.entity) ||
        !this.world.has(bb.entity)
      )
        return;
      this.events.emit('contact', {
        a: this.world.get(aa.entity).guid,
        b: this.world.get(bb.entity).guid,
        started,
        sensor: aa.sensor || bb.sensor,
      });
    });
  }
  private writeWorld(id: number, matrix: Matrix2D): void {
    const parent = this.world.get(id).parent;
    this.world.setLocalMatrix(
      id,
      parent === null
        ? matrix
        : multiply(inverse(this.world.worldMatrix(parent)), matrix),
    );
  }
  private body(stable: string): BodyRecord {
    const id = this.world.find(stable),
      record = id === undefined ? undefined : this.bodies.get(id);
    if (!record) throw new Error(`No physics body for ${stable}`);
    return record;
  }
  hasBody(id: string): boolean {
    const entity = this.world.find(id);
    return entity !== undefined && this.bodies.has(entity);
  }
  velocity(id: string): readonly [number, number] {
    const v = this.body(id).body.linvel();
    return [v.x, v.y];
  }
  setVelocity(id: string, x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y))
      throw new Error('Velocity must be finite');
    this.body(id).body.setLinvel({ x, y }, true);
  }
  impulse(id: string, x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y))
      throw new Error('Impulse must be finite');
    this.body(id).body.applyImpulse({ x, y }, true);
  }
  movePosition(id: string, x: number, y: number): void {
    const record = this.body(id);
    if (record.mode === 'dynamic') {
      this.teleport(id, x, y);
      return;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y))
      throw new Error('Position must be finite');
    const numeric = this.world.find(id)!,
      m = this.world.worldMatrix(numeric);
    this.writeWorld(numeric, [m[0], m[1], m[2], m[3], x, y]);
  }
  teleport(id: string, x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y))
      throw new Error('Position must be finite');
    const record = this.body(id);
    record.body.setTranslation({ x, y }, true);
    if (record.mode === 'kinematic')
      record.body.setNextKinematicTranslation({ x, y });
    this.writeWorld(
      this.world.find(id)!,
      compose(x, y, record.body.rotation(), record.sx, record.sy),
    );
  }
  raycast(
    origin: readonly [number, number],
    direction: readonly [number, number],
    distance: number,
    exclude?: string,
    layer?: number,
  ): RayHit | null {
    const length = Math.hypot(...direction);
    if (
      !Number.isFinite(distance) ||
      distance < 0 ||
      !Number.isFinite(length) ||
      length === 0 ||
      !origin.every(Number.isFinite)
    )
      throw new Error('Invalid ray');
    const d = { x: direction[0] / length, y: direction[1] / length },
      excluded =
        exclude && this.hasBody(exclude) ? this.body(exclude).body : undefined;
    const hit = this.physics.castRayAndGetNormal(
      new RAPIER.Ray({ x: origin[0], y: origin[1] }, d),
      distance,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      layer === undefined ? undefined : collisionGroups(layer, this.settings),
      undefined,
      excluded,
    );
    if (!hit) return null;
    const owner = this.colliderOwners.get(hit.collider.handle);
    if (!owner || !this.world.has(owner.entity)) return null;
    return {
      entity: this.world.get(owner.entity).guid,
      distance: hit.timeOfImpact,
      normal: [hit.normal.x, hit.normal.y],
      point: [
        origin[0] + d.x * hit.timeOfImpact,
        origin[1] + d.y * hit.timeOfImpact,
      ],
    };
  }
  debug(): { vertices: Float32Array; colors: Float32Array } {
    return this.physics.debugRender();
  }
  stop(): void {
    this.destroy();
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.clear();
    this.queue.free();
    this.physics.free();
    this.bodies.clear();
    this.colliderOwners.clear();
  }
}
