import { createRegistry } from '@protomake/core';
import {
  instantiateScene,
  serializeScene,
  deserializeScene,
} from '@protomake/serialization';
import { Engine } from '@protomake/runtime';
import fixture from './scene.json';
import './style.css';
function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing harness element ${id}`);
  return node as T;
}
const registry = createRegistry(),
  loaded = instantiateScene(fixture, registry),
  engine = new Engine(loaded.world);
let fixedTicks = 0,
  last = performance.now();
engine.addSystem({
  id: 'example.fixed-counter',
  start: () => {
    fixedTicks = 0;
  },
  fixedUpdate: () => {
    fixedTicks++;
  },
});
function refresh() {
  element('state').textContent = engine.state;
  element('ticks').textContent = String(fixedTicks);
  element('elapsed').textContent =
    `${engine.time.snapshot().elapsed.toFixed(2)} s`;
  element<HTMLButtonElement>('start').disabled = engine.state !== 'stopped';
  element<HTMLButtonElement>('pause').disabled =
    engine.state !== 'running' && engine.state !== 'paused';
  element('pause').textContent = engine.state === 'paused' ? 'Resume' : 'Pause';
  element<HTMLButtonElement>('step').disabled = engine.state !== 'paused';
  element<HTMLButtonElement>('stop').disabled = engine.state === 'stopped';
}
function report(error: unknown) {
  element('result').textContent = `FAIL: ${String(error)}`;
  element('result').dataset.status = 'fail';
  console.error(error);
}
function action(id: string, run: () => void) {
  element(id).addEventListener('click', () => {
    try {
      run();
      refresh();
    } catch (error) {
      report(error);
    }
  });
}
action('verify', () => {
  const original = serializeScene(loaded.world, loaded.scene),
    restored = deserializeScene(original, registry);
  if (serializeScene(restored.world, restored.scene) !== original)
    throw new Error('Round-trip mismatch');
  const child = restored.world.find(fixture.entities[1]!.id);
  if (
    child === undefined ||
    JSON.stringify(restored.world.worldPosition(child)) !== '[125,60]'
  )
    throw new Error('Hierarchy mismatch');
  element('scene').textContent = original;
  element('result').textContent =
    'PASS · 2 entities · hierarchy preserved · deterministic round trip';
  element('result').dataset.status = 'pass';
});
action('start', () => {
  last = performance.now();
  engine.start();
});
action('pause', () => {
  if (engine.state === 'paused') {
    last = performance.now();
    engine.resume();
  } else engine.pause();
});
action('step', () => engine.step());
action('stop', () => engine.stop());
function frame(now: number) {
  try {
    if (engine.state === 'running') {
      engine.tick((now - last) / 1000);
      refresh();
    }
  } catch (error) {
    report(error);
  }
  last = now;
  requestAnimationFrame(frame);
}
element('scene').textContent = serializeScene(loaded.world, loaded.scene);
refresh();
requestAnimationFrame(frame);
