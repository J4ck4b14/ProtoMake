// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { it, expect, vi } from 'vitest';
it('shows animated stage feedback, reveals Start only when ready, and reports a stalled stage', async () => {
  vi.useFakeTimers();
  try {
    const html = readFileSync('player.html', 'utf8');
    document.body.innerHTML = html.match(/<body>([\s\S]*?)<\/body>/)![1]!;
    window.eval(document.querySelector('script:not([type])')!.textContent!);
    const start = document.getElementById('start') as HTMLButtonElement;
    expect(start.hidden).toBe(true);
    expect(start.disabled).toBe(true);
    const progress = (phase: string, stage: string) =>
      window.dispatchEvent(
        new CustomEvent('protomake:loading', { detail: { phase, stage } }),
      );
    progress('loading', 'Starting graphics');
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.getElementById('status')!.textContent).toBe(
      'Starting graphics…',
    );
    expect(document.getElementById('detail')!.textContent).toBe(
      '2 s at this stage',
    );
    expect(document.getElementById('spinner')!.hidden).toBe(false);
    progress('ready', 'Workshop');
    expect(start.hidden).toBe(false);
    expect(document.getElementById('spinner')!.hidden).toBe(true);
    progress('loading', 'Decoding audio');
    await vi.advanceTimersByTimeAsync(35000);
    expect(start.hidden).toBe(true);
    expect(document.getElementById('retry')!.hidden).toBe(false);
    expect(document.getElementById('detail')!.textContent).toContain(
      'Timed out: Decoding audio',
    );
    progress('ready', 'Late result');
    expect(start.hidden).toBe(true);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
