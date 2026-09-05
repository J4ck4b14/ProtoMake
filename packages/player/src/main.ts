import { validateProject } from '@protomake/serialization';
import type { ScriptModule, ScriptFields } from '@protomake/scripting';
import { runtimeRegistry } from './registry';
import { GameSession } from './session';
const overlay = document.getElementById('overlay')!,
  start = document.getElementById('start') as HTMLButtonElement,
  status = document.getElementById('status')!,
  host = document.getElementById('game')!;
let session: GameSession | undefined,
  last = performance.now(),
  pending: string | undefined,
  loading = false;
function failure(error: unknown): void {
  loading = false;
  overlay.hidden = false;
  status.textContent = String(error);
  start.hidden = true;
  try {
    session?.destroy();
  } catch (e) {
    console.error(e);
  }
  session = undefined;
  console.error(error);
}
try {
  const response = await fetch('./project.protomake.json');
  if (!response.ok) throw new Error('Project could not be loaded');
  const project = validateProject(await response.json(), runtimeRegistry());
  document.title = project.name;
  const indexResponse = await fetch('./scripts.json');
  if (!indexResponse.ok) throw new Error('Script manifest could not be loaded');
  const index = (await indexResponse.json()) as {
    id: string;
    url: string;
    fields: ScriptFields;
  }[];
  const modules = new Map<string, ScriptModule>(),
    fields = new Map<string, ScriptFields>();
  for (const script of index) {
    modules.set(
      script.id,
      (await import(
        /* @vite-ignore */ new URL(script.url, document.baseURI).href
      )) as ScriptModule,
    );
    fields.set(script.id, script.fields);
  }
  const load = async (id: string) => {
    loading = true;
    session?.destroy();
    session = undefined;
    const scene = project.scenes.find((s) => s.id === id || s.name === id);
    if (!scene) throw new Error(`Missing scene ${id}`);
    const canvas = document.createElement('canvas');
    host.replaceChildren(canvas);
    session = await GameSession.create(
      canvas,
      project,
      scene,
      modules,
      fields,
      console.log,
      (id) => {
        pending = id;
      },
    );
    session.resize(innerWidth, innerHeight);
    last = performance.now();
    loading = false;
  };
  if (!project.startupScene) throw new Error('No startup scene');
  await load(project.startupScene);
  await session!.pause();
  status.textContent = project.name;
  start.disabled = false;
  start.onclick = () => {
    void session
      ?.resume()
      .then(() => {
        overlay.hidden = true;
        last = performance.now();
      })
      .catch(failure);
  };
  window.addEventListener('resize', () =>
    session?.resize(innerWidth, innerHeight),
  );
  window.addEventListener('pagehide', () => session?.destroy());
  window.addEventListener('pointerdown', () => {
    if (session?.engine.state === 'running')
      void session.audio.unlock().catch(failure);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && session?.engine.state === 'running') {
      void session.pause().catch(failure);
      overlay.hidden = false;
      status.textContent = 'Paused';
      start.textContent = 'Resume';
    }
  });
  const frame = (now: number) => {
    try {
      if (!loading) session?.tick((now - last) / 1000);
      if (pending && !loading) {
        const id = pending;
        pending = undefined;
        void load(id)
          .then(() => session?.audio.unlock())
          .catch(failure);
      }
    } catch (e) {
      failure(e);
    }
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
} catch (e) {
  failure(e);
}
