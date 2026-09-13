import { loadStage } from './loading';
import { validateProject } from '@protomake/serialization';
import type { ScriptModule, ScriptFields } from '@protomake/scripting';
import { runtimeRegistry } from './registry';
import { GameSession } from './session';
import { createPersistentServices } from '@protomake/persistence';
import { frameDeltaSeconds } from '@protomake/runtime';
const overlay = document.getElementById('overlay')!,
  start = document.getElementById('start') as HTMLButtonElement,
  status = document.getElementById('status')!,
  host = document.getElementById('game')!;
let session: GameSession | undefined,
  last = performance.now(),
  pending: string | undefined,
  loading = false;
let failed = false;
const progress = (stage: string) =>
  window.dispatchEvent(
    new CustomEvent('protomake:loading', { detail: { phase: 'loading', stage } }),
  );
function failure(error: unknown): void {
  failed = true;
  window.dispatchEvent(
    new CustomEvent('protomake:loading', {
      detail: { phase: 'error', stage: String(error) },
    }),
  );
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
// Do not await startup at module scope: Pixi renderer chunks import this entry's exports.
async function boot(): Promise<void> {
  try {
    const response = await loadStage(
      'Loading project',
      () => fetch('./project.protomake.json'),
      progress,
    );
    if (!response.ok) throw new Error('Project could not be loaded');
    const project = validateProject(
      await loadStage('Reading project', () => response.json(), progress),
      runtimeRegistry(),
    );
    document.title = project.name;
    const persistent = createPersistentServices(
      project.id,
      project.persistence,
    );
    const indexResponse = await loadStage(
      'Loading scripts',
      () => fetch('./scripts.json'),
      progress,
    );
    if (!indexResponse.ok)
      throw new Error('Script manifest could not be loaded');
    const index = (await loadStage(
      'Reading script manifest',
      () => indexResponse.json(),
      progress,
    )) as {
      id: string;
      url: string;
      fields: ScriptFields;
    }[];
    const modules = new Map<string, ScriptModule>(),
      fields = new Map<string, ScriptFields>();
    for (const script of index) {
      modules.set(
        script.id,
        await loadStage(
          `Loading script ${script.id}`,
          () =>
            import(
              /* @vite-ignore */ new URL(script.url, document.baseURI).href
            ) as Promise<ScriptModule>,
          progress,
        ),
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
      const created = await GameSession.create(
        canvas,
        project,
        scene,
        modules,
        fields,
        console.log,
        (id) => {
          pending = id;
        },
        progress,
        persistent,
      );
      if (failed) {
        created.destroy();
        throw new Error('Startup was cancelled');
      }
      session = created;
      session.resize(innerWidth, innerHeight);
      last = performance.now();
      loading = false;
    };
    if (!project.startupScene) throw new Error('No startup scene');
    await load(project.startupScene);
    await loadStage('Preparing Start button', () => session!.pause(), progress);
    window.dispatchEvent(
      new CustomEvent('protomake:loading', {
        detail: { phase: 'ready', stage: project.name },
      }),
    );
    status.textContent = project.name;
    start.disabled = false;
    start.onclick = () => {
      if (!session) return;
      start.disabled = true;
      void loadStage('Enabling sound', () => session!.resume(), progress)
        .then(() => {
          window.dispatchEvent(
            new CustomEvent('protomake:loading', {
              detail: { phase: 'ready', stage: project.name },
            }),
          );
          start.disabled = false;
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
        if (!loading) session?.tick(frameDeltaSeconds(now, last));
        if (pending && !loading) {
          const id = pending;
          pending = undefined;
          void load(id)
            .then(() => {
              window.dispatchEvent(
                new CustomEvent('protomake:loading', {
                  detail: { phase: 'ready', stage: project.name },
                }),
              );
              return session?.audio.unlock();
            })
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
}
window.addEventListener('protomake:startup-timeout', (event) =>
  failure(new Error((event as CustomEvent<string>).detail)),
);
void boot();
