import { runtimeRegistry } from '@protomake/player';
import { GameSession } from '@protomake/player/session';
import {
  validateProject,
  type ProjectData,
  type SceneData,
} from '@protomake/serialization';
import type { ScriptModule, ScriptFields } from '@protomake/scripting';
import {
  compileProjectScripts,
  moduleSources,
} from '@protomake/scripting/compiler';
import {
  createPersistentServices,
  type PersistentGameServices,
} from '@protomake/persistence';
import { frameDeltaSeconds } from '@protomake/runtime';
const token = location.hash.slice(1),
  status = document.getElementById('status')!,
  host = document.getElementById('game')!;
let session: GameSession | undefined,
  project: ProjectData | undefined,
  activeScene: string | undefined,
  last = performance.now(),
  lastInspection = 0,
  loading = false,
  debug = false,
  pendingScene: string | undefined;
let persistent: PersistentGameServices | undefined;
let urls = new Map<string, string>();
document.body.style.cssText =
  'margin:0;background:#10161d;color:#dce5ed;font:11px system-ui;overflow:hidden';
status.style.cssText =
  'position:absolute;bottom:4px;left:8px;z-index:2;margin:0;color:#b6c8d8;pointer-events:none';
function send(kind: string, message?: string, detail?: unknown): void {
  parent.postMessage({ kind, token, message, detail }, location.origin);
}
window.addEventListener('protomake-graph-trace', (event) => {
  parent.postMessage(
    {
      kind: 'graph-trace',
      token,
      detail: (event as CustomEvent<unknown>).detail,
    },
    location.origin,
  );
});
function report(error: unknown): void {
  send('error', String(error));
  status.textContent = String(error);
}
function fault(error: unknown): void {
  report(error);
  try {
    session?.destroy();
  } catch (e) {
    report(e);
  }
  session = undefined;
  send('faulted');
}
async function loadScene(scene: SceneData): Promise<void> {
  if (!project) throw new Error('No project');
  loading = true;
  try {
    session?.destroy();
    session = undefined;
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
    const canvas = document.createElement('canvas');
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
    session = await GameSession.create(
      canvas,
      project,
      scene,
      modules,
      fields,
      (message) => send('log', message),
      (id) => {
        pendingScene = id;
      },
      () => {},
      persistent,
    );
    activeScene = scene.id;
    session.resize(innerWidth, innerHeight);
    last = performance.now();
    status.textContent = `${scene.name} · click game to focus input and enable sound`;
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
      detail?: {
        entity?: string;
        type?: string;
        path?: string;
        behaviour?: string;
        field?: string;
        value?: unknown;
        position?: readonly [number, number];
      };
    };
    if (data.kind === 'load') {
      if (loading) return;
      project = validateProject(data.project, runtimeRegistry());
      persistent = createPersistentServices(project.id, project.persistence);
      const scene = project.scenes.find((s) => s.id === data.scene?.id);
      if (!scene) throw new Error('Play scene missing');
      await loadScene(scene);
      if (data.detail?.position) {
        const entity = session?.playFrom(data.detail.position);
        send('log', `Playing from here with ${entity}`);
      }
    } else if (data.kind === 'debug') debug = Boolean(data.enabled);
    else if (data.kind === 'pause') await session?.pause();
    else if (data.kind === 'resume') {
      last = performance.now();
      await session?.resume();
    } else if (data.kind === 'step') session?.step();
    else if (data.kind === 'restart') {
      if (!project || !activeScene) throw new Error('No active Play scene');
      const scene = project.scenes.find((item) => item.id === activeScene);
      if (!scene) throw new Error('Active Play scene is missing');
      await loadScene(scene);
    } else if (data.kind === 'recompile') {
      try {
        const next = validateProject(data.project, runtimeRegistry());
        compileProjectScripts(next.assets);
        if (!activeScene) throw new Error('No active Play scene');
        const scene = next.scenes.find((item) => item.id === activeScene);
        if (!scene) throw new Error('Active Play scene is missing');
        project = next;
        await loadScene(scene);
        send('log', 'Scripts recompiled and scene restarted');
      } catch (error) {
        report(error);
      }
    } else if (data.kind === 'set-runtime-component') {
      try {
        const detail = data.detail;
        if (!detail?.entity || !detail.type || !detail.path)
          throw new Error('Invalid live component update');
        session?.setRuntimeComponent(
          detail.entity,
          detail.type,
          detail.path,
          detail.value,
        );
      } catch (error) {
        report(error);
      }
    } else if (data.kind === 'set-runtime-behaviour') {
      try {
        const detail = data.detail;
        if (!detail?.entity || !detail.behaviour || !detail.field)
          throw new Error('Invalid live behaviour update');
        session?.setRuntimeBehaviour(
          detail.entity,
          detail.behaviour,
          detail.field,
          detail.value,
        );
      } catch (error) {
        report(error);
      }
    } else if (data.kind === 'set-runtime-setting') {
      try {
        const detail = data.detail;
        if (!detail?.path) throw new Error('Invalid live setting update');
        session?.setRuntimeSetting(detail.path, detail.value);
      } catch (error) {
        report(error);
      }
    } else if (data.kind === 'inspect')
      send('inspection', undefined, session?.inspect());
  })().catch(fault);
});
window.addEventListener('error', (e) =>
  report(`${e.filename}:${e.lineno} ${e.message}`),
);
window.addEventListener('unhandledrejection', (e) => report(e.reason));
window.addEventListener('resize', () =>
  session?.resize(innerWidth, innerHeight),
);
window.addEventListener('pointerdown', () => {
  if (session?.engine.state === 'running')
    void session.audio.unlock().catch(fault);
});
window.addEventListener('pagehide', () => session?.destroy());
for (const level of ['log', 'warn', 'error'] as const) {
  const original = console[level].bind(console);
  console[level] = (...values: unknown[]) => {
    original(...values);
    send(level === 'error' ? 'error' : 'log', values.map(String).join(' '));
  };
}
function frame(now: number): void {
  try {
    if (!loading) {
      session?.tick(frameDeltaSeconds(now, last), debug);
      if (session && now - lastInspection >= 200) {
        lastInspection = now;
        send('inspection', undefined, session.inspect());
      }
      if (pendingScene && project) {
        const id = pendingScene;
        pendingScene = undefined;
        const scene = project.scenes.find((s) => s.id === id || s.name === id);
        if (!scene) throw new Error(`Missing scene ${id}`);
        void loadScene(scene).catch(fault);
      }
    }
  } catch (e) {
    fault(e);
  }
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
send('ready');
