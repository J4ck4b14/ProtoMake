import { frameAt, type AnimationClip } from '@protomake/animation';
import type { AssetData } from '@protomake/assets';
import { node, button, input } from './dom';
/** Preview owns no runtime world and never mutates saved project data. */
export function clipPreview(
  host: HTMLElement,
  clip: AnimationClip,
  assets: readonly AssetData[],
): () => void {
  const panel = node('section', 'clip-preview'),
    image = node('img'),
    status = node('output');
  image.alt = 'Animation preview';
  const scrub = input('Preview time', '0', 'range');
  scrub.input.min = '0';
  scrub.input.step = '0.001';
  let time = 0,
    playing = false,
    previous = 0,
    request = 0;
  const duration = () => clip.frames.reduce((n, f) => n + f.duration, 0);
  const draw = () => {
    const total = duration();
    scrub.input.max = String(Number.isFinite(total) ? total : 0);
    scrub.input.value = String(time);
    const index = clip.frames.length ? frameAt(clip, time) : -1;
    const src =
      assets.find((a) => a.id === clip.frames[index]?.texture)?.data ?? '';
    if (src && image.getAttribute('src') !== src) image.src = src;
    if (!src) image.removeAttribute('src');
    status.textContent = `Frame ${index + 1} / ${clip.frames.length} · ${time.toFixed(3)} s`;
  };
  const play = button('Play preview', () => {
    playing = !playing;
    if (playing && time >= duration()) time = 0;
    play.textContent = playing ? 'Pause preview' : 'Play preview';
    previous = performance.now();
  });
  scrub.input.oninput = () => {
    time = scrub.input.valueAsNumber;
    playing = false;
    play.textContent = 'Play preview';
    draw();
  };
  const timeline = node('div', 'frame-timeline');
  let start = 0;
  clip.frames.forEach((frame, i) => {
    const at = start;
    const b = button(
      String(i + 1),
      () => {
        time = at;
        playing = false;
        play.textContent = 'Play preview';
        draw();
      },
      `Frame ${i + 1}: ${frame.duration} seconds`,
    );
    b.style.flexGrow = String(frame.duration);
    b.style.flexBasis = '0';
    timeline.append(b);
    start += frame.duration;
  });
  const tick = (now: number) => {
    const total = duration();
    if (playing && total > 0 && Number.isFinite(total) && clip.speed > 0) {
      time += Math.min((now - previous) / 1000, 0.1) * clip.speed;
      if (time >= total) {
        if (clip.loop) time %= total;
        else {
          time = total;
          playing = false;
          play.textContent = 'Play preview';
        }
      }
      draw();
    }
    previous = now;
    request = requestAnimationFrame(tick);
  };
  panel.append(
    node('h3', '', 'Playback and timing'),
    image,
    status,
    play,
    scrub.row,
    timeline,
  );
  host.append(panel);
  draw();
  request = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(request);
}
