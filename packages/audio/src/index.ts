import { z } from 'zod';
import type { ComponentDefinition, World, Guid } from '@protomake/core';
import type { AssetData } from '@protomake/assets';
import type { System } from '@protomake/runtime';
export const MixerSchema = z
  .array(
    z.strictObject({
      name: z.string().min(1),
      volume: z.number().finite().min(0).max(1),
      muted: z.boolean(),
    }),
  )
  .min(1)
  .superRefine((buses, ctx) => {
    if (
      new Set(buses.map((b) => b.name)).size !== buses.length ||
      !buses.some((b) => b.name === 'Master')
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Mixer needs unique bus names and Master',
      });
  });
export type MixerData = z.infer<typeof MixerSchema>;
export function defaultMixer(): MixerData {
  return ['Master', 'Music', 'SFX', 'UI', 'Ambience'].map((name) => ({
    name,
    volume: 1,
    muted: false,
  }));
}
const SourceSchema = z
  .strictObject({
    clip: z.string(),
    loop: z.boolean(),
    volume: z.number().finite().min(0).max(1),
    rate: z.number().finite().min(0.01).max(4),
    bus: z.string().min(1),
    playOnAwake: z.boolean(),
    polyphony: z.number().int().min(1).max(32).default(4),
    spatial: z.boolean().default(false),
    minDistance: z.number().finite().nonnegative().default(64),
    maxDistance: z.number().finite().positive().default(800),
    rolloff: z.number().finite().nonnegative().default(1),
    pan: z.number().finite().min(-1).max(1).default(0),
  })
  .refine((source) => source.minDistance <= source.maxDistance, {
    message: 'Audio minimum distance must not exceed maximum distance',
  });
export const AudioSource: ComponentDefinition<z.infer<typeof SourceSchema>> = {
  type: 'protomake.audio-source',
  displayName: 'Audio Source',
  schema: SourceSchema,
  defaults: () => ({
    clip: '',
    loop: false,
    volume: 1,
    rate: 1,
    bus: 'SFX',
    playOnAwake: false,
    polyphony: 4,
    spatial: false,
    minDistance: 64,
    maxDistance: 800,
    rolloff: 1,
    pan: 0,
  }),
  inspector: [
    { path: 'clip', label: 'Audio clip', kind: 'asset' },
    { path: 'loop', label: 'Loop', kind: 'boolean' },
    { path: 'volume', label: 'Volume', kind: 'number' },
    { path: 'rate', label: 'Playback rate', kind: 'number' },
    { path: 'bus', label: 'Output bus', kind: 'string' },
    { path: 'playOnAwake', label: 'Play on awake', kind: 'boolean' },
    { path: 'polyphony', label: 'Polyphony', kind: 'number' },
    { path: 'spatial', label: 'Spatial', kind: 'boolean' },
    { path: 'minDistance', label: 'Minimum distance', kind: 'number' },
    { path: 'maxDistance', label: 'Maximum distance', kind: 'number' },
    { path: 'rolloff', label: 'Rolloff', kind: 'number' },
    { path: 'pan', label: 'Stereo pan', kind: 'number' },
  ],
};
interface Voice {
  node: AudioBufferSourceNode | undefined;
  gain: GainNode;
  panner: StereoPannerNode | undefined;
  offset: number;
  started: number;
  rate: number;
  clip: string;
  bus: string;
  paused: boolean;
  ended: boolean;
}
/** Bounded voices per source. Buffers are shared; Web Audio source nodes remain one-shot. */
export class AudioSystem implements System {
  readonly id = 'protomake.audio';
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly buses = new Map<string, GainNode>();
  private readonly voices = new Map<Guid, Voice[]>();
  private readonly active = new Set<Guid>();
  private disposed = false;
  private constructor(
    private readonly world: World,
    readonly context: AudioContext,
    mixer: MixerData,
  ) {
    for (const bus of MixerSchema.parse(mixer)) {
      const gain = context.createGain();
      gain.gain.value = bus.muted ? 0 : bus.volume;
      this.buses.set(bus.name, gain);
    }
    for (const [name, gain] of this.buses)
      gain.connect(
        name === 'Master' ? context.destination : this.buses.get('Master')!,
      );
  }
  static async create(
    world: World,
    assets: readonly AssetData[],
    mixer: MixerData,
    context = new AudioContext(),
  ): Promise<AudioSystem> {
    const system = new AudioSystem(world, context, mixer);
    try {
      for (const asset of assets.filter((a) => a.kind === 'audio')) {
        try {
          const response = await fetch(asset.data),
            buffer = await context.decodeAudioData(
              await response.arrayBuffer(),
            );
          system.buffers.set(asset.id, buffer);
        } catch (e) {
          throw new Error(`Audio decode failed: ${asset.path}`, { cause: e });
        }
      }
      return system;
    } catch (e) {
      system.stop();
      throw e;
    }
  }
  async unlock(): Promise<void> {
    if (!this.disposed && this.context.state === 'suspended')
      await this.context.resume();
  }
  async suspend(): Promise<void> {
    if (!this.disposed && this.context.state === 'running')
      await this.context.suspend();
  }
  setBus(name: string, volume: number, muted = false): void {
    const bus = this.buses.get(name);
    if (!bus || !Number.isFinite(volume) || volume < 0 || volume > 1)
      throw new Error('Invalid mixer bus or volume');
    bus.gain.setValueAtTime(muted ? 0 : volume, this.context.currentTime);
  }
  private source(id: Guid) {
    const entity = this.world.find(id),
      data =
        entity === undefined ? undefined : this.world.read(entity, AudioSource);
    if (!data) throw new Error(`Entity ${id} has no AudioSource`);
    return data;
  }
  play(id: Guid, resume = false): void {
    if (this.disposed) throw new Error('Audio service has stopped');
    const data = this.source(id);
    if (!data.clip) return;
    const buffer = this.buffers.get(data.clip),
      bus = this.buses.get(data.bus);
    if (!buffer || !bus) throw new Error(`Missing audio clip or bus on ${id}`);
    const voices = this.voices.get(id) ?? [],
      previous = voices.find((voice) => voice.paused),
      offset =
        resume && previous?.paused && previous.clip === data.clip
          ? previous.offset
          : 0;
    if (resume || data.loop) this.stopSource(id);
    else if (voices.length >= data.polyphony)
      this.removeVoice(id, voices[0]!, true);
    const node = this.context.createBufferSource(),
      gain = this.context.createGain(),
      createPanner = (
        this.context as AudioContext & {
          createStereoPanner?: () => StereoPannerNode;
        }
      ).createStereoPanner,
      panner = createPanner?.call(this.context);
    node.buffer = buffer;
    node.loop = data.loop;
    node.playbackRate.value = data.rate;
    gain.gain.value = data.volume;
    node.connect(gain);
    if (panner) {
      gain.connect(panner);
      panner.connect(bus);
    } else gain.connect(bus);
    const voice: Voice = {
      node,
      gain,
      panner,
      offset,
      started: this.context.currentTime,
      rate: data.rate,
      clip: data.clip,
      bus: data.bus,
      paused: false,
      ended: false,
    };
    const current = this.voices.get(id) ?? [];
    current.push(voice);
    this.voices.set(id, current);
    node.onended = () => {
      if (voice.node === node) {
        voice.ended = true;
        voice.node = undefined;
        node.disconnect();
        gain.disconnect();
        panner?.disconnect();
        this.removeVoice(id, voice, false);
      }
    };
    node.start(
      0,
      data.loop ? offset % buffer.duration : Math.min(offset, buffer.duration),
    );
  }
  pauseSource(id: Guid): void {
    const voice = this.voices.get(id)?.at(-1);
    if (!voice?.node) return;
    voice.offset += (this.context.currentTime - voice.started) * voice.rate;
    voice.paused = true;
    voice.node.onended = null;
    voice.node.stop();
    voice.node.disconnect();
    voice.node = undefined;
    voice.gain.disconnect();
    voice.panner?.disconnect();
  }
  private removeVoice(id: Guid, voice: Voice, stop: boolean): void {
    if (voice.node) {
      voice.node.onended = null;
      if (stop) voice.node.stop();
      voice.node.disconnect();
      voice.node = undefined;
    }
    voice.gain.disconnect();
    voice.panner?.disconnect();
    const remaining = (this.voices.get(id) ?? []).filter(
      (item) => item !== voice,
    );
    if (remaining.length) this.voices.set(id, remaining);
    else this.voices.delete(id);
  }
  stopSource(id: Guid): void {
    const voices = [...(this.voices.get(id) ?? [])];
    for (const voice of voices) this.removeVoice(id, voice, true);
    this.voices.delete(id);
  }
  start(): void {
    this.update();
  }
  update(): void {
    const present = new Set<Guid>();
    for (const [id] of this.world.query(AudioSource.type)) {
      const stable = this.world.get(id).guid,
        data = this.world.read(id, AudioSource)!;
      if (!this.world.isActive(id)) continue;
      present.add(stable);
      if (!this.active.has(stable) && data.playOnAwake) this.play(stable);
      const voices = [...(this.voices.get(stable) ?? [])];
      for (const voice of voices) {
        if (voice.ended) {
          this.removeVoice(stable, voice, false);
          continue;
        }
        if (!voice.node) continue;
        if (voice.clip !== data.clip) {
          this.stopSource(stable);
          break;
        }
        const bus = this.buses.get(data.bus);
        if (!bus) throw new Error(`Missing audio bus ${data.bus}`);
        voice.offset += (this.context.currentTime - voice.started) * voice.rate;
        voice.started = this.context.currentTime;
        voice.rate = data.rate;
        voice.node.playbackRate.value = data.rate;
        voice.node.loop = data.loop;
        const [gain, pan] = this.spatial(stable, data);
        voice.gain.gain.value = data.volume * gain;
        if (voice.panner) voice.panner.pan.value = pan;
        if (voice.bus !== data.bus) {
          if (voice.panner) {
            voice.panner.disconnect();
            voice.panner.connect(bus);
          } else {
            voice.gain.disconnect();
            voice.gain.connect(bus);
          }
          voice.bus = data.bus;
        }
      }
    }
    for (const id of this.voices.keys())
      if (!present.has(id)) this.stopSource(id);
    this.active.clear();
    for (const id of present) this.active.add(id);
  }
  private spatial(
    id: Guid,
    data: z.infer<typeof SourceSchema>,
  ): readonly [number, number] {
    if (!data.spatial) return [1, data.pan];
    const source = this.world.find(id),
      cameras = this.world
        .withComponent('protomake.camera')
        .filter((camera) => this.world.isActive(camera))
        .sort((a, b) => {
          const av = this.world.components(a).get('protomake.camera') as
              | { priority?: number }
              | undefined,
            bv = this.world.components(b).get('protomake.camera') as
              | { priority?: number }
              | undefined;
          return (bv?.priority ?? 0) - (av?.priority ?? 0);
        }),
      listener = cameras[0];
    if (source === undefined || listener === undefined) return [1, data.pan];
    const [sx, sy] = this.world.worldPosition(source),
      [lx, ly] = this.world.worldPosition(listener),
      distance = Math.hypot(sx - lx, sy - ly),
      normalized = Math.max(
        0,
        Math.min(
          1,
          (distance - data.minDistance) /
            Math.max(Number.EPSILON, data.maxDistance - data.minDistance),
        ),
      ),
      gain =
        distance >= data.maxDistance
          ? 0
          : Math.pow(1 - normalized, data.rolloff),
      pan = Math.max(-1, Math.min(1, data.pan + (sx - lx) / data.maxDistance));
    return [gain, pan];
  }
  stop(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const id of this.voices.keys()) this.stopSource(id);
    for (const gain of this.buses.values()) gain.disconnect();
    this.buses.clear();
    this.buffers.clear();
    this.active.clear();
    void this.context.close().catch(() => {});
  }
}
