import { it, expect } from 'vitest';
import { World, createRegistry } from '@protomake/core';
import { Engine, TimeService, frameDeltaSeconds } from '@protomake/runtime';
function engine(time?: TimeService) {
  return new Engine(new World(createRegistry()), time);
}
it('orders lifecycle phases and reverses teardown', () => {
  const e = engine(new TimeService(0.1)),
    calls: string[] = [];
  for (const id of ['a', 'b'])
    e.addSystem({
      id,
      start: () => calls.push(id + ' start'),
      fixedUpdate: () => calls.push(id + ' fixed'),
      update: () => calls.push(id + ' update'),
      lateUpdate: () => calls.push(id + ' late'),
      stop: () => calls.push(id + ' stop'),
    });
  e.start();
  e.tick(0.1);
  e.stop();
  expect(calls).toEqual([
    'a start',
    'b start',
    'a fixed',
    'b fixed',
    'a update',
    'b update',
    'a late',
    'b late',
    'b stop',
    'a stop',
  ]);
});
it('profiles frame work by system without changing scheduling', () => {
  const e = engine(new TimeService(0.1));
  e.addSystem({ id: 'profiled', fixedUpdate() {}, update() {} });
  e.start();
  e.tick(0.2);
  expect(e.profile.fixedSteps).toBe(2);
  expect(e.profile.frameMs).toBeGreaterThanOrEqual(0);
  expect(e.profile.systems.profiled).toBeGreaterThanOrEqual(0);
  e.stop();
});
it('supports pause, single step, resume, stop and clean restart timing', () => {
  const e = engine();
  let updates = 0;
  e.addSystem({ id: 'count', update: () => updates++ });
  e.start();
  e.pause();
  e.tick(2);
  expect(updates).toBe(0);
  e.step();
  expect(updates).toBe(1);
  expect(e.state).toBe('paused');
  e.resume();
  e.tick(1 / 60);
  expect(updates).toBe(2);
  e.stop();
  e.tick(1);
  expect(updates).toBe(2);
  e.start();
  expect(e.time.snapshot().frame).toBe(0);
});
it('caps fixed catch-up, reports discarded time and keeps fractional interpolation', () => {
  const time = new TimeService(0.01, 0.25, 4),
    e = engine(time);
  let fixed = 0;
  e.addSystem({ id: 'counter', fixedUpdate: () => fixed++ });
  e.start();
  e.tick(1.005);
  expect(fixed).toBe(4);
  expect(time.snapshot().dropped).toBeCloseTo(0.965);
  expect(time.snapshot().alpha).toBeLessThan(1);
  expect(time.snapshot().fixedElapsed).toBeCloseTo(0.04);
});
it('accumulates small deltas and advances fixed time per substep', () => {
  const e = engine(new TimeService(0.1)),
    times: number[] = [];
  e.addSystem({
    id: 'clock',
    fixedUpdate: (c) => times.push(c.time.fixedElapsed),
  });
  e.start();
  e.tick(0.04);
  expect(times).toEqual([]);
  e.tick(0.21);
  expect(times).toEqual([0.1, 0.2]);
  expect(e.time.snapshot().alpha).toBeCloseTo(0.5);
});
it('rejects invalid time settings and deltas', () => {
  expect(() => new TimeService(0)).toThrow();
  expect(() => new TimeService(0.5, 0.25)).toThrow();
  expect(() => new TimeService(0.1, 0.2, 0)).toThrow();
  const e = engine();
  e.start();
  expect(() => e.tick(NaN)).toThrow();
  expect(() => e.tick(-1)).toThrow();
  expect(e.time.snapshot().frame).toBe(0);
});

it('normalizes browser clock-boundary skew before advancing play sessions', () => {
  expect(frameDeltaSeconds(1016.67, 1000)).toBeCloseTo(0.01667);
  expect(frameDeltaSeconds(999.999, 1000)).toBe(0);
  expect(frameDeltaSeconds(Number.NaN, 1000)).toBe(0);
  expect(frameDeltaSeconds(1000, Number.POSITIVE_INFINITY)).toBe(0);
});
it('reports system context, halts after errors, and cleans up all started systems', () => {
  const e = engine(),
    events: string[] = [],
    stops: string[] = [];
  e.events.on('error', (v) => events.push(v.system + ' ' + v.phase));
  e.addSystem({
    id: 'a',
    update: () => {
      throw new Error('boom');
    },
    stop: () => {
      stops.push('a');
      throw new Error('cleanup');
    },
  });
  e.addSystem({ id: 'b', stop: () => stops.push('b') });
  e.start();
  expect(() => e.tick(0.1)).toThrow('boom');
  expect(e.state).toBe('faulted');
  expect(events).toEqual(['a update']);
  expect(() => e.tick(0.1)).toThrow(/faulted/);
  expect(() => e.stop()).toThrow(/cleanup/);
  expect(stops).toEqual(['b', 'a']);
  expect(e.state).toBe('stopped');
});
it('cleans up partially started systems and rejects reentrant lifecycle mutations', () => {
  const e = engine(),
    stops: string[] = [];
  e.addSystem({
    id: 'bad',
    start: () => e.stop(),
    stop: () => stops.push('bad'),
  });
  expect(() => e.start()).toThrow(/Reentrant/);
  expect(e.state).toBe('faulted');
  e.stop();
  expect(stops).toEqual(['bad']);
});
it('enforces valid lifecycle transitions and unique system IDs', () => {
  const e = engine();
  e.addSystem({ id: 'a' });
  expect(() => e.addSystem({ id: 'a' })).toThrow();
  expect(() => e.pause()).toThrow();
  expect(() => e.step()).toThrow();
  e.start();
  expect(() => e.start()).toThrow();
  expect(() => e.addSystem({ id: 'b' })).toThrow();
  expect(() => e.resume()).toThrow();
});
