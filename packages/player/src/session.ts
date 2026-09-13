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
import {
  createPersistentServices,
  type PersistentGameServices,
} from '@protomake/persistence';
/** Shared runtime composition for editor Play and exported games. Hosts own scheduling and UI. */
export class GameSession {
  private constructor(
    readonly engine: Engine,
    readonly renderer: PixiRenderer,
    readonly physics: Physics2D,
    readonly input: InputService,
    readonly audio: AudioSystem,
    private readonly persistent: PersistentGameServices,
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
        () => Physics2D.create(world, project.physics),
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
        graphs = new GraphRuntime(project.assets, {
          trace: (event) =>
            window.dispatchEvent(
              new CustomEvent('protomake-graph-trace', { detail: event }),
            ),
        }),
        ui = new RuntimeUiSystem(
          world,
          canvas.parentElement ?? canvas,
          project.assets,
          signals,
        );
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
      engine.addSystem(
        new ScriptSystem(
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
          },
        ),
      );
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
