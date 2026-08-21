import { instantiateScene } from '@protomake/serialization';
import { Engine } from '@protomake/runtime';
import { editorRegistry } from './model';
const token = location.hash.slice(1),
  status = document.getElementById('status')!;
let engine: Engine | undefined,
  last = performance.now();
document.body.style.cssText =
  'margin:0;background:#10161d;color:#dce5ed;font:13px system-ui';
window.addEventListener('message', (event) => {
  if (
    event.source !== parent ||
    event.origin !== location.origin ||
    !event.data ||
    event.data.token !== token
  )
    return;
  try {
    const data = event.data as { kind: string; scene?: unknown };
    if (data.kind === 'load') {
      engine?.stop();
      const loaded = instantiateScene(data.scene, editorRegistry());
      engine = new Engine(loaded.world);
      engine.start();
      last = performance.now();
      status.textContent = `${loaded.scene.name} · ${loaded.scene.entities.length} entities · isolated runtime (rendering arrives in Milestone 2)`;
    } else if (data.kind === 'pause') engine?.pause();
    else if (data.kind === 'resume') {
      last = performance.now();
      engine?.resume();
    } else if (data.kind === 'step') engine?.step();
  } catch (error) {
    parent.postMessage(
      { kind: 'error', token, message: String(error) },
      location.origin,
    );
  }
});
function frame(now: number): void {
  try {
    engine?.tick((now - last) / 1000);
  } catch (error) {
    parent.postMessage(
      { kind: 'error', token, message: String(error) },
      location.origin,
    );
    engine?.stop();
  }
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
parent.postMessage({ kind: 'ready', token }, location.origin);
