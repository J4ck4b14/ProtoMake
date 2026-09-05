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
const SourceSchema = z.strictObject({
  clip: z.string(),
  loop: z.boolean(),
  volume: z.number().finite().min(0).max(1),
  rate: z.number().finite().min(0.01).max(4),
  bus: z.string().min(1),
  playOnAwake: z.boolean(),
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
  }),
  inspector: [
    { path: 'clip', label: 'Audio clip', kind: 'asset' },
    { path: 'loop', label: 'Loop', kind: 'boolean' },
    { path: 'volume', label: 'Volume', kind: 'number' },
    { path: 'rate', label: 'Playback rate', kind: 'number' },
    { path: 'bus', label: 'Output bus', kind: 'string' },
    { path: 'playOnAwake', label: 'Play on awake', kind: 'boolean' },
  ],
};
interface Voice {
  node: AudioBufferSourceNode | undefined;
  gain: GainNode;
  offset: number;
  started: number;
  rate: number;
  clip: string;
  bus: string;
  paused: boolean;
  ended: boolean;
}
/** One voice per source. Buffers are shared; nodes are recreated because Web Audio sources are one-shot. */
export class AudioSystem implements System {
  readonly id = 'protomake.audio';
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly buses = new Map<string, GainNode>();
  private readonly voices = new Map<Guid, Voice>();
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
    const previous = this.voices.get(id),
      offset =
        resume && previous?.paused && previous.clip === data.clip
          ? previous.offset
          : 0;
    this.stopSource(id);
    const node = this.context.createBufferSource(),
      gain = this.context.createGain();
    node.buffer = buffer;
    node.loop = data.loop;
    node.playbackRate.value = data.rate;
    gain.gain.value = data.volume;
    node.connect(gain);
    gain.connect(bus);
    const voice: Voice = {
      node,
      gain,
      offset,
      started: this.context.currentTime,
      rate: data.rate,
      clip: data.clip,
      bus: data.bus,
      paused: false,
      ended: false,
    };
    this.voices.set(id, voice);
    node.onended = () => {
      if (voice.node === node) {
        voice.ended = true;
        voice.node = undefined;
        node.disconnect();
        gain.disconnect();
      }
    };
    node.start(
      0,
      data.loop ? offset % buffer.duration : Math.min(offset, buffer.duration),
    );
  }
  pauseSource(id: Guid): void {
    const voice = this.voices.get(id);
    if (!voice?.node) return;
    voice.offset += (this.context.currentTime - voice.started) * voice.rate;
    voice.paused = true;
    voice.node.onended = null;
    voice.node.stop();
    voice.node.disconnect();
    voice.node = undefined;
    voice.gain.disconnect();
  }
  stopSource(id: Guid): void {
    const voice = this.voices.get(id);
    if (!voice) return;
    if (voice.node) {
      voice.node.onended = null;
      voice.node.stop();
      voice.node.disconnect();
    }
    voice.gain.disconnect();
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
      const voice = this.voices.get(stable);
      if (voice?.node) {
        if (voice.clip !== data.clip) {
          this.stopSource(stable);
          continue;
        }
        const bus = this.buses.get(data.bus);
        if (!bus) throw new Error(`Missing audio bus ${data.bus}`);
        voice.offset += (this.context.currentTime - voice.started) * voice.rate;
        voice.started = this.context.currentTime;
        voice.rate = data.rate;
        voice.node.playbackRate.value = data.rate;
        voice.node.loop = data.loop;
        voice.gain.gain.value = data.volume;
        if (voice.bus !== data.bus) {
          voice.gain.disconnect();
          voice.gain.connect(bus);
          voice.bus = data.bus;
        }
      }
    }
    for (const id of this.voices.keys())
      if (!present.has(id)) this.stopSource(id);
    this.active.clear();
    for (const id of present) this.active.add(id);
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
