import { it, expect, vi } from 'vitest';
import { loadStage } from '../packages/player/src/loading';
it('reports progress and returns the loaded resource', async () => {
  const progress = vi.fn();
  expect(await loadStage('Starting graphics', async () => 42, progress)).toBe(
    42,
  );
  expect(progress).toHaveBeenCalledWith('Starting graphics');
});
it('times out a stalled stage and disposes a resource that arrives late', async () => {
  vi.useFakeTimers();
  try {
    let resolve!: (value: string) => void;
    const dispose = vi.fn();
    const work = loadStage(
      'Starting graphics',
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
      undefined,
      dispose,
      100,
    );
    const rejection = expect(work).rejects.toThrow(
      'Timed out while starting graphics',
    );
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    resolve('late renderer');
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledWith('late renderer');
  } finally {
    vi.useRealTimers();
  }
});
it('preserves actual loading errors', async () => {
  await expect(
    loadStage('Loading images', async () => {
      throw new Error('Missing sprite');
    }),
  ).rejects.toThrow('Missing sprite');
});
