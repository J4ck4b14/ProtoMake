import { Physics2D } from '@protomake/physics2d/rapier';
import { InputService } from '@protomake/input';
import {
  instantiateScene,
  validateProject,
  type ProjectData,
  type SceneData,
} from '@protomake/serialization';
import { Engine } from '@protomake/runtime';
import { PixiRenderer } from '@protomake/renderer/pixi';
import {
  ScriptSystem,
  type ScriptModule,
  type ScriptFields,
} from '@protomake/scripting';
import {
  compileProjectScripts,
  moduleSources,
} from '@protomake/scripting/compiler';
import { editorRegistry } from './model';
const token = location.hash.slice(1),
  status = document.getElementById('status')!,
  host = document.getElementById('game')!;
let engine: Engine | undefined,
  renderer: PixiRenderer | undefined,
  physics: Physics2D | undefined,
  input: InputService | undefined,
  project: ProjectData | undefined,
  last = performance.now(),
  loading = false,
  debug = false,
  pendingScene: string | undefined;
let urls: Map<string, string> = new Map();
document.body.style.cssText =
  'margin:0;background:#10161d;color:#dce5ed;font:11px system-ui;overflow:hidden';
status.style.cssText =
  'position:absolute;bottom:4px;left:8px;z-index:2;margin:0;color:#b6c8d8;pointer-events:none';
function send(kind: string, message?: string): void {
  parent.postMessage({ kind, token, message }, location.origin);
}
function report(error: unknown): void {
  send('error', String(error));
  status.textContent = String(error);
}
async function loadScene(scene: SceneData): Promise<void> {
  if (!project) throw new Error('No loaded project');
  loading = true;
  try {
    engine?.stop();
    engine = undefined;
    input?.detach();
    physics?.destroy();
    renderer?.destroy();
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
    const registry = editorRegistry(),
      loaded = instantiateScene(scene, registry),
      canvas = document.createElement('canvas');
    host.replaceChildren(canvas);
    const compiled = compileProjectScripts(project.assets);
    urls = moduleSources(compiled, (code) =>
      URL.createObjectURL(new Blob([code], { type: 'text/javascript' })),
    );
    const modules = new Map<string, ScriptModule>();
    for (const script of compiled)
      modules.set(
        script.id,
        (await import(/* @vite-ignore */ urls.get(script.id)!)) as ScriptModule,
      );
    const fields = new Map<string, ScriptFields>(
      compiled.map((s) => [s.id, s.fields]),
    );
    renderer = await PixiRenderer.create(canvas);
    await renderer.setAssets(project.assets);
    renderer.resize(innerWidth, innerHeight);
    physics = await Physics2D.create(loaded.world, project.physics);
    input = new InputService(project.input);
    input.attach(window);
    const scripts = new ScriptSystem(
      loaded.world,
      input,
      physics,
      modules,
      fields,
      (message) => send('log', message),
      (id) => {
        pendingScene = id;
      },
    );
    engine = new Engine(loaded.world);
    // Reverse shutdown must destroy behaviours before freeing the physics service they may use.
    engine.addSystem({
      id: 'physics-lifetime',
      stop: () => physics?.destroy(),
    });
    engine.addSystem(scripts);
    engine.addSystem({
      id: 'physics-step',
      fixedUpdate: (context) => physics!.fixedUpdate(context),
    });
    engine.start();
    last = performance.now();
    status.textContent = `${scene.name} · click the game to focus input`;
    send('loaded');
  } finally {
    loading = false;
  }
}
window.addEventListener('message', (event) => {
  if (
    event.source !== parent ||
    event.origin !== location.origin ||
    !event.data ||
    event.data.token !== token
  )
    return;
  void (async () => {
    const data = event.data as {
      kind: string;
      scene?: SceneData;
      project?: ProjectData;
      enabled?: boolean;
    };
    if (data.kind === 'load') {
      if (loading) return;
      project = validateProject(data.project, editorRegistry());
      const scene = project.scenes.find((s) => s.id === data.scene?.id);
      if (!scene) throw new Error('Play scene missing from project');
      await loadScene(scene);
    } else if (data.kind === 'debug') {
      debug = Boolean(data.enabled);
      if (!debug)
        renderer?.setDebugLines(new Float32Array(), new Float32Array());
    } else if (data.kind === 'pause') {
      engine?.pause();
      input?.clear();
    } else if (data.kind === 'resume') {
      last = performance.now();
      engine?.resume();
    } else if (data.kind === 'step') {
      input?.sample(navigator.getGamepads?.() ?? []);
      engine?.step();
      input?.endFrame();
    }
  })().catch(fault);
});
function fault(error: unknown): void {
  report(error);
  try {
    engine?.stop();
  } catch (cleanup) {
    report(cleanup);
  }
  send('faulted');
}
window.addEventListener('error', (event) =>
  report(`${event.filename}:${event.lineno} ${event.message}`),
);
window.addEventListener('unhandledrejection', (event) => report(event.reason));
window.addEventListener('resize', () =>
  renderer?.resize(innerWidth, innerHeight),
);
for (const level of ['log', 'warn', 'error'] as const) {
  const original = console[level].bind(console);
  console[level] = (...values: unknown[]) => {
    original(...values);
    send(
      level === 'error' ? 'error' : 'log',
      values.map((v) => String(v)).join(' '),
    );
  };
}
function frame(now: number): void {
  try {
    if (!loading) {
      if (engine?.state === 'running') {
        input?.sample(navigator.getGamepads?.() ?? []);
        engine.tick((now - last) / 1000);
        input?.endFrame();
      }
      if (debug && physics && engine && engine.state !== 'stopped') {
        const lines = physics.debug();
        renderer?.setDebugLines(lines.vertices, lines.colors);
      }
      if (engine) renderer?.render(engine.world);
      if (pendingScene && project) {
        const request = pendingScene;
        pendingScene = undefined;
        const scene = project.scenes.find(
          (s) => s.id === request || s.name === request,
        );
        if (!scene) throw new Error(`Missing scene ${request}`);
        void loadScene(scene).catch(fault);
      }
    }
  } catch (error) {
    fault(error);
  }
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
send('ready');
