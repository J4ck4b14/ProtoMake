import { instantiateScene, type ProjectData } from '@protomake/serialization';
import { Engine } from '@protomake/runtime';
import { PixiRenderer } from '@protomake/renderer/pixi';
import { editorRegistry } from './model';
const token = location.hash.slice(1),
  status = document.getElementById('status')!,
  host = document.getElementById('game')!;
let engine: Engine | undefined,
  renderer: PixiRenderer | undefined,
  last = performance.now(),
  loading = false;
document.body.style.cssText =
  'margin:0;background:#10161d;color:#dce5ed;font:11px system-ui;overflow:hidden';
status.style.cssText =
  'position:absolute;bottom:4px;left:8px;z-index:2;margin:0;color:#b6c8d8;pointer-events:none';
function report(error: unknown): void {
  parent.postMessage(
    { kind: 'error', token, message: String(error) },
    location.origin,
  );
  status.textContent = String(error);
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
      scene?: unknown;
      project?: ProjectData;
    };
    if (data.kind === 'load') {
      if (loading) return;
      loading = true;
      engine?.stop();
      renderer?.destroy();
      const loaded = instantiateScene(data.scene, editorRegistry()),
        canvas = document.createElement('canvas');
      host.replaceChildren(canvas);
      renderer = await PixiRenderer.create(canvas);
      await renderer.setAssets(data.project?.assets ?? []);
      renderer.resize(innerWidth, innerHeight);
      engine = new Engine(loaded.world);
      engine.start();
      last = performance.now();
      status.textContent = loaded.scene.name;
      loading = false;
      parent.postMessage({ kind: 'loaded', token }, location.origin);
    } else if (data.kind === 'pause') engine?.pause();
    else if (data.kind === 'resume') {
      last = performance.now();
      engine?.resume();
    } else if (data.kind === 'step') engine?.step();
  })().catch(report);
});
window.addEventListener('resize', () =>
  renderer?.resize(innerWidth, innerHeight),
);
function frame(now: number): void {
  try {
    engine?.tick((now - last) / 1000);
    if (engine) renderer?.render(engine.world);
  } catch (error) {
    report(error);
    engine?.stop();
  }
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
parent.postMessage({ kind: 'ready', token }, location.origin);
