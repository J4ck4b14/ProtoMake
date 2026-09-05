import { it, expect, vi } from 'vitest';
import {
  AudioSource,
  AudioSystem,
  defaultMixer,
  MixerSchema,
} from '@protomake/audio';
import { EditorModel } from '../packages/editor/src/model';
import { guid } from '@protomake/core';
function context() {
  const sources: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    playbackRate: { value: number };
    loop: boolean;
    onended: (() => void) | null;
  }[] = [];
  const gains: {
    gain: { value: number; setValueAtTime: ReturnType<typeof vi.fn> };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const ctx = {
    currentTime: 0,
    state: 'suspended',
    destination: {},
    decodeAudioData: vi.fn(async () => ({ duration: 10 })),
    createGain: () => {
      const gain = {
        gain: { value: 0, setValueAtTime: vi.fn() },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    },
    createBufferSource: () => {
      const source = {
        buffer: null,
        loop: false,
        playbackRate: { value: 1 },
        onended: null,
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      sources.push(source);
      return source;
    },
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    suspend: vi.fn(async () => {
      ctx.state = 'suspended';
    }),
    close: vi.fn(async () => {
      ctx.state = 'closed';
    }),
  };
  return { ctx, sources, gains };
}
it('decodes once, routes buses, recreates one-shot nodes on resume, and closes cleanly', async () => {
  const m = new EditorModel(),
    id = m.createEntity(),
    clip = guid();
  m.change('Audio', () => {
    m.project.assets.push({
      id: clip,
      path: 'Assets/tone.wav',
      mime: 'audio/wav',
      kind: 'audio',
      data: 'data:audio/wav;base64,AA==',
      width: 0,
      height: 0,
    });
    m.world.add(m.entity(id), AudioSource.type, {
      ...AudioSource.defaults(),
      clip,
      rate: 2,
    });
  });
  const { ctx, sources, gains } = context();
  const audio = await AudioSystem.create(
    m.world,
    m.project.assets,
    defaultMixer(),
    ctx as unknown as AudioContext,
  );
  await audio.unlock();
  expect(ctx.resume).toHaveBeenCalledOnce();
  audio.play(id);
  expect(sources[0]!.start).toHaveBeenCalledWith(0, 0);
  expect(gains.at(-1)!.connect).toHaveBeenCalledWith(gains[2]);
  ctx.currentTime = 1.5;
  audio.pauseSource(id);
  expect(sources[0]!.stop).toHaveBeenCalledOnce();
  audio.play(id, true);
  expect(sources[1]!.start).toHaveBeenCalledWith(0, 3);
  expect(ctx.decodeAudioData).toHaveBeenCalledOnce();
  audio.setBus('Master', 0.5);
  expect(gains[0]!.gain.setValueAtTime).toHaveBeenCalledWith(0.5, 1.5);
  await audio.suspend();
  expect(ctx.suspend).toHaveBeenCalledOnce();
  audio.stop();
  audio.stop();
  expect(ctx.close).toHaveBeenCalledOnce();
  expect(sources[1]!.stop).toHaveBeenCalledOnce();
});
it('starts awake sources once and releases voices when entities are disabled/destroyed', async () => {
  const m = new EditorModel(),
    id = m.createEntity(),
    clip = guid();
  m.change('Audio', () => {
    m.project.assets.push({
      id: clip,
      path: 'Assets/a.wav',
      mime: 'audio/wav',
      kind: 'audio',
      data: 'data:audio/wav;base64,AA==',
      width: 0,
      height: 0,
    });
    m.world.add(m.entity(id), AudioSource.type, {
      ...AudioSource.defaults(),
      clip,
      playOnAwake: true,
      loop: true,
    });
  });
  const { ctx, sources } = context(),
    audio = await AudioSystem.create(
      m.world,
      m.project.assets,
      defaultMixer(),
      ctx as unknown as AudioContext,
    );
  audio.start();
  audio.update();
  expect(sources.length).toBe(1);
  m.world.setEnabled(m.entity(id), false);
  audio.update();
  expect(sources[0]!.stop).toHaveBeenCalledOnce();
  m.world.setEnabled(m.entity(id), true);
  audio.update();
  expect(sources.length).toBe(2);
  m.world.destroy(m.entity(id));
  audio.update();
  expect(sources[1]!.stop).toHaveBeenCalledOnce();
  audio.stop();
});
it('reports decode errors and frees the failed context', async () => {
  const m = new EditorModel(),
    { ctx } = context();
  ctx.decodeAudioData.mockRejectedValueOnce(new Error('bad'));
  await expect(
    AudioSystem.create(
      m.world,
      [
        {
          id: guid(),
          path: 'Assets/bad.wav',
          mime: 'audio/wav',
          kind: 'audio',
          data: 'data:audio/wav;base64,AA==',
          width: 0,
          height: 0,
        },
      ],
      defaultMixer(),
      ctx as unknown as AudioContext,
    ),
  ).rejects.toThrow('Assets/bad.wav');
  expect(ctx.close).toHaveBeenCalledOnce();
  expect(() =>
    MixerSchema.parse([{ name: 'SFX', volume: 1, muted: false }]),
  ).toThrow();
});
