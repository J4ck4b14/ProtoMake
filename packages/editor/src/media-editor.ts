import { guid } from '@protomake/core';
import { AssetSchema } from '@protomake/assets';
import {
  AnimationClipSchema,
  AnimatorControllerSchema,
  CLIP_MIME,
  CONTROLLER_MIME,
  Animator,
} from '@protomake/animation';
import { AudioSource, MixerSchema } from '@protomake/audio';
import type { EditorModel } from './model';
import { animationEditor } from './animation-editor';
import { node, button, input } from './dom';
export function editMedia(
  model: EditorModel,
  mime: typeof CLIP_MIME | typeof CONTROLLER_MIME,
  id?: string,
): void {
  const asset = model.project.assets.find(
    (a) => a.id === id && a.mime === mime,
  );
  const images = model.project.assets.filter((a) => a.kind === 'image');
  const clips = model.project.assets.filter((a) => a.mime === CLIP_MIME);
  if (!asset && mime === CLIP_MIME && !images.length)
    throw new Error('Import at least one image first');
  if (!asset && mime === CONTROLLER_MIME && !clips.length)
    throw new Error('Create an animation clip first');
  const template =
    mime === CLIP_MIME
      ? {
          version: 1,
          name: 'New clip',
          loop: true,
          speed: 1,
          frames: images.map((a) => ({ texture: a.id, duration: 1 / 12 })),
        }
      : {
          version: 1,
          initial: 'State 1',
          parameters: { moving: { type: 'bool', default: false } },
          states: clips.map((a, i) => ({
            name: `State ${i + 1}`,
            clip: a.id,
            speed: 1,
          })),
          transitions:
            clips.length > 1
              ? [
                  {
                    from: 'State 1',
                    to: 'State 2',
                    exitTime: null,
                    conditions: [
                      { parameter: 'moving', operator: '==', value: true },
                    ],
                  },
                  {
                    from: 'State 2',
                    to: 'State 1',
                    exitTime: null,
                    conditions: [
                      { parameter: 'moving', operator: '==', value: false },
                    ],
                  },
                ]
              : [],
        };
  animationEditor(
    mime,
    asset?.path ??
      `Assets/${mime === CLIP_MIME ? 'New.animation' : 'New.animator'}.json`,
    asset ? JSON.parse(asset.data) : template,
    model.project.assets,
    (path, data) => {
      const parsed =
        mime === CLIP_MIME
          ? AnimationClipSchema.parse(data)
          : AnimatorControllerSchema.parse(data);
      model.change('Save animation data', () => {
        const saved = AssetSchema.parse({
          id: asset?.id ?? guid(),
          path,
          kind: 'text',
          mime,
          data: JSON.stringify(parsed),
          width: 0,
          height: 0,
        });
        const i = model.project.assets.findIndex((a) => a.id === saved.id);
        if (i < 0) model.project.assets.push(saved);
        else model.project.assets[i] = saved;
      });
    },
  );
}
export function attachMedia(model: EditorModel, id: string): void {
  model.change('Attach media', () => {
    const asset = model.project.assets.find((a) => a.id === id);
    if (!asset) throw new Error('Select a controller or audio clip');
    for (const stable of model.selection) {
      const entity = model.entity(stable);
      if (asset.mime === CONTROLLER_MIME) {
        const data = { ...Animator.defaults(), controller: id };
        if (model.world.read(entity, Animator))
          model.world.set(entity, Animator.type, data);
        else model.world.add(entity, Animator.type, data);
      } else if (asset.kind === 'audio') {
        const data = { ...AudioSource.defaults(), clip: id };
        if (model.world.read(entity, AudioSource))
          model.world.set(entity, AudioSource.type, data);
        else model.world.add(entity, AudioSource.type, data);
      } else throw new Error('Select a controller or audio clip');
    }
  });
}
export function showMixer(model: EditorModel): void {
  if (model.locked) return;
  let buses = structuredClone(model.project.mixer);
  const dialog = node('dialog', 'settings'),
    rows = node('div'),
    error = node('p', 'error');
  const render = () => {
    rows.replaceChildren();
    for (const [i, bus] of buses.entries()) {
      const row = node('div', 'actions'),
        name = input('Bus', bus.name),
        volume = input('Volume', String(bus.volume), 'number'),
        mute = input('Mute', '', 'checkbox');
      volume.input.min = '0';
      volume.input.max = '1';
      volume.input.step = '.05';
      mute.input.checked = bus.muted;
      name.input.disabled = bus.name === 'Master';
      name.input.onchange = () => {
        bus.name = name.input.value;
      };
      volume.input.onchange = () => {
        bus.volume = volume.input.valueAsNumber;
      };
      mute.input.onchange = () => {
        bus.muted = mute.input.checked;
      };
      row.append(name.row, volume.row, mute.row);
      if (bus.name !== 'Master')
        row.append(
          button('Remove', () => {
            buses = buses.filter((_, index) => index !== i);
            render();
          }),
        );
      rows.append(row);
    }
  };
  render();
  dialog.append(
    node('h2', '', 'Audio mixer'),
    rows,
    error,
    button('+ Bus', () => {
      buses.push({ name: `Bus ${buses.length}`, volume: 1, muted: false });
      render();
    }),
    button('Apply mixer', () => {
      try {
        const parsed = MixerSchema.parse(buses);
        model.change('Edit mixer', () => {
          model.project.mixer = parsed;
        });
        dialog.close();
      } catch (e) {
        error.textContent = String(e);
      }
    }),
    button('Cancel', () => dialog.close()),
  );
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}
