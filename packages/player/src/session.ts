import { loadStage } from './loading';
import {
  Engine,
  SignalService,
  TimerService,
  TweenService,
} from '@protomake/runtime';
import { Physics2D } from '@protomake/physics2d/rapier';
import { InputService } from '@protomake/input';
import { AnimationSystem } from '@protomake/animation';
import { AudioSystem } from '@protomake/audio';
import { PixiRenderer } from '@protomake/renderer/pixi';
import {
  instantiateScene,
  type ProjectData,
  type SceneData,
} from '@protomake/serialization';
import {
  ScriptSystem,
  type ScriptModule,
  type ScriptFields,
} from '@protomake/scripting';
import { runtimeRegistry } from './registry';
import { RuntimePrefabs } from './prefabs';
import { GraphRuntime } from '@protomake/graphs';
import { RuntimeUiSystem } from '@protomake/ui';
import { CameraBehaviourSystem } from '@protomake/renderer';
import {
  createPersistentServices,
  type PersistentGameServices,
} from '@protomake/persistence';
import { inverse, multiply, type Matrix2D } from '@protomake/core';
import type { GraphTrace } from '@protomake/graphs';
import type { RuntimeSnapshot } from './inspection';

function valueAt(data: unknown, path: string): unknown {
  let value = data;
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
function setValueAt(data: unknown, path: string, value: unknown): void {
  const keys = path.split('.');
  if (
    keys.some((key) => ['__proto__', 'prototype', 'constructor'].includes(key))
  )
    throw new Error('Unsafe runtime property path');
  let cursor = data;
  for (const key of keys.slice(0, -1)) {
    if (!cursor || typeof cursor !== 'object')
      throw new Error(`Invalid runtime property ${path}`);
    cursor = (cursor as Record<string, unknown>)[key];
  }
  if (!cursor || typeof cursor !== 'object')
    throw new Error(`Invalid runtime property ${path}`);
  (cursor as Record<string, unknown>)[keys.at(-1)!] = value;
}
/** Shared runtime composition for editor Play and exported games. Hosts own scheduling and UI. */
export class GameSession {
  private constructor(
    readonly engine: Engine,
    readonly renderer: PixiRenderer,
    readonly physics: Physics2D,
    readonly input: InputService,
    readonly audio: AudioSystem,
    private readonly persistent: PersistentGameServices,
    private readonly scripts: ScriptSystem,
    private readonly sceneName: string,
    private readonly graphValues: Map<string, GraphTrace>,
  ) {}
  static async create(
    canvas: HTMLCanvasElement,
    project: ProjectData,
    scene: SceneData,
    modules: ReadonlyMap<string, ScriptModule>,
    fields: ReadonlyMap<string, ScriptFields>,
    log: (message: string) => void,
    loadScene: (id: string) => void,
    progress: (stage: string) => void = () => {},
    persistent: PersistentGameServices = createPersistentServices(
      project.id,
      project.persistence,
    ),
  ): Promise<GameSession> {
    const registry = runtimeRegistry(),
      { world } = instantiateScene(scene, registry);
    let renderer: PixiRenderer | undefined,
      physics: Physics2D | undefined,
      audio: AudioSystem | undefined,
      input: InputService | undefined,
      engine: Engine | undefined;
    try {
      renderer = await loadStage(
        'Starting graphics',
        () => PixiRenderer.create(canvas),
        progress,
        (value) => value.destroy(),
      );
      const graphics = renderer;
      await loadStage(
        'Loading images',
        () => graphics.setAssets(project.assets),
        progress,
      );
      physics = await loadStage(
        'Starting physics',
        () => Physics2D.create(world, project.physics, project.assets),
        progress,
        (value) => value.destroy(),
      );
      input = new InputService(project.input);
      input.attach(window);
      const animation = new AnimationSystem(world, project.assets),
        signals = new SignalService(),
        timers = new TimerService(),
        tweens = new TweenService(world),
        prefabs = new RuntimePrefabs(world, registry, project.assets),
        coordinates = {
          screenPosition: () => input!.pointerScreenPosition,
          worldPosition: () =>
            renderer!.screenToWorld(world, input!.pointerScreenPosition),
          delta: () => input!.pointerDelta,
          wheel: () => input!.pointerWheel,
          screenToWorld: (position: readonly [number, number]) =>
            renderer!.screenToWorld(world, position),
          worldToScreen: (position: readonly [number, number]) =>
            renderer!.worldToScreen(world, position),
        },
        graphValues = new Map<string, GraphTrace>(),
        graphs = new GraphRuntime(project.assets, {
          trace: (event) => {
            graphValues.set(`${event.graph}:${event.node}`, event);
            window.dispatchEvent(
              new CustomEvent('protomake-graph-trace', { detail: event }),
            );
          },
        }),
        ui = new RuntimeUiSystem(
          world,
          canvas.parentElement ?? canvas,
          project.assets,
          signals,
        ),
        cameraEffects = new CameraBehaviourSystem(world);
      audio = await loadStage(
        'Decoding audio',
        () => AudioSystem.create(world, project.assets, project.mixer),
        progress,
        (value) => value.stop(),
      );
      engine = new Engine(world);
      const physicsService = physics;
      engine.addSystem({
        id: 'physics-lifetime',
        stop: () => physicsService.destroy(),
      });
      engine.addSystem(audio);
      engine.addSystem({ id: 'signal-lifetime', stop: () => signals.clear() });
      engine.addSystem(timers);
      engine.addSystem(tweens);
      engine.addSystem(ui);
      engine.addSystem(cameraEffects);
      const scriptSystem = new ScriptSystem(
        world,
        input,
        physics,
        modules,
        fields,
        log,
        loadScene,
        { animation, audio },
        {
          signals,
          timers,
          tweens,
          prefabs,
          coordinates,
          graphs,
          ui,
          save: persistent.save,
          achievements: persistent.achievements,
          cameraEffects,
        },
      );
      engine.addSystem(scriptSystem);
      engine.addSystem(animation);
      engine.addSystem({
        id: 'physics-step',
        fixedUpdate: (context) => physicsService.fixedUpdate(context),
      });
      const session = new GameSession(
        engine,
        renderer,
        physics,
        input,
        audio,
        persistent,
        scriptSystem,
        scene.name,
        graphValues,
      );
      progress('Starting scene');
      engine.start();
      return session;
    } catch (error) {
      try {
        engine?.stop();
      } finally {
        input?.detach();
        audio?.stop();
        physics?.destroy();
        renderer?.destroy();
      }
      throw error;
    }
  }
  inspect(): RuntimeSnapshot {
    const world = this.engine.world;
    return {
      scene: this.sceneName,
      state: this.engine.state,
      settings: [
        {
          path: 'gravityX',
          label: 'Gravity X',
          kind: 'number',
          value: this.physics.settings.gravityX,
        },
        {
          path: 'gravityY',
          label: 'Gravity Y',
          kind: 'number',
          value: this.physics.settings.gravityY,
        },
      ],
      entities: [...world.all()].map((entity) => ({
        id: entity.guid,
        name: entity.name,
        enabled: entity.enabled,
        active: world.isActive(entity.id),
        parent: entity.parent === null ? null : world.get(entity.parent).guid,
        components: [...world.components(entity.id)].map(([type, data]) => {
          const definition = world.registry.get(type);
          return {
            type,
            name: definition.displayName,
            properties: definition.inspector.map((field) => ({
              ...field,
              value: structuredClone(valueAt(data, field.path)),
            })),
          };
        }),
      })),
      behaviours: this.scripts.runtimeBehaviours(),
      graphs: [...this.graphValues.values()].map((trace) => ({
        graph: trace.graph,
        node: trace.node,
        phase: trace.phase,
        values: structuredClone(trace.values),
      })),
      profile: this.engine.profile,
    };
  }
  setRuntimeComponent(
    entity: string,
    type: string,
    path: string,
    value: unknown,
  ): void {
    const numeric = this.engine.world.find(entity);
    if (numeric === undefined)
      throw new Error(`Missing runtime entity ${entity}`);
    const data = structuredClone(
      this.engine.world.components(numeric).get(type),
    );
    if (data === undefined)
      throw new Error(`Missing runtime component ${type}`);
    setValueAt(data, path, value);
    this.engine.world.set(numeric, type, data);
  }
  setRuntimeBehaviour(
    entity: string,
    behaviour: string,
    field: string,
    value: unknown,
  ): void {
    this.scripts.setRuntimeValue(entity, behaviour, field, value);
  }
  setRuntimeSetting(path: string, value: unknown): void {
    if (
      (path !== 'gravityX' && path !== 'gravityY') ||
      typeof value !== 'number'
    )
      throw new Error(`Invalid runtime setting ${path}`);
    this.physics.setGravity(
      path === 'gravityX' ? value : this.physics.settings.gravityX,
      path === 'gravityY' ? value : this.physics.settings.gravityY,
    );
  }
  playFrom(position: readonly [number, number]): string {
    const world = this.engine.world,
      id = world.withTag('Player')[0];
    if (id === undefined)
      throw new Error('Play From Here needs an entity tagged Player');
    const stable = world.get(id).guid;
    if (this.physics.hasBody(stable))
      this.physics.teleport(stable, ...position);
    else {
      const matrix = world.worldMatrix(id),
        desired = [
          matrix[0],
          matrix[1],
          matrix[2],
          matrix[3],
          position[0],
          position[1],
        ] as Matrix2D,
        parent = world.get(id).parent;
      world.setLocalMatrix(
        id,
        parent === null
          ? desired
          : multiply(inverse(world.worldMatrix(parent)), desired),
      );
    }
    return stable;
  }
  resize(width: number, height: number): void {
    this.renderer.resize(width, height);
  }
  tick(delta: number, debug = false): void {
    if (this.engine.state === 'running') {
      this.input.sample(navigator.getGamepads?.() ?? []);
      this.engine.tick(delta);
      this.persistent.autosave?.tick(delta);
      this.input.endFrame();
    }
    if (debug) {
      const lines = this.physics.debug();
      this.renderer.setDebugLines(lines.vertices, lines.colors);
    } else this.renderer.setDebugLines(new Float32Array(), new Float32Array());
    this.renderer.render(this.engine.world);
  }
  async pause(): Promise<void> {
    this.engine.pause();
    this.input.clear();
    await this.audio.suspend();
  }
  async resume(): Promise<void> {
    this.engine.resume();
    await this.audio.unlock();
  }
  step(): void {
    this.input.sample(navigator.getGamepads?.() ?? []);
    this.engine.step();
    this.input.endFrame();
    this.renderer.render(this.engine.world);
  }
  destroy(): void {
    try {
      this.engine.stop();
    } finally {
      this.input.detach();
      this.audio.stop();
      this.physics.destroy();
      this.renderer.destroy();
    }
  }
}
