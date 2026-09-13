import { clipPreview } from './animation-preview';
import { animatorGraph } from './animator-graph';
import {
  AnimationClipSchema,
  AnimatorControllerSchema,
  CLIP_MIME,
  type AnimationClip,
  type AnimatorController,
} from '@protomake/animation';
import type { AssetData } from '@protomake/assets';
import { node, button, input } from './dom';
function select(
  label: string,
  options: { name: string; id: string }[],
  value: string,
  change: (value: string) => void,
): HTMLLabelElement {
  const row = node('label', 'field'),
    control = node('select');
  control.setAttribute('aria-label', label);
  for (const item of options) control.append(new Option(item.name, item.id));
  control.value = value;
  control.onchange = () => change(control.value);
  row.append(node('span', '', label), control);
  return row;
}
function number(
  label: string,
  value: number,
  change: (value: number) => void,
): HTMLLabelElement {
  const field = input(label, String(value), 'number');
  field.input.step = 'any';
  field.input.onchange = () => change(field.input.valueAsNumber);
  return field.row;
}
export function animationEditor(
  mime: string,
  path: string,
  data: unknown,
  assets: readonly AssetData[],
  save: (path: string, data: unknown) => void,
): void {
  const dialog = node('dialog', 'animation-editor'),
    pathField = input('Asset path', path),
    body = node('div'),
    error = node('p', 'error');
  const clip = mime === CLIP_MIME ? AnimationClipSchema.parse(data) : undefined,
    controller =
      mime !== CLIP_MIME ? AnimatorControllerSchema.parse(data) : undefined;
  const images = assets
      .filter((a) => a.kind === 'image')
      .map((a) => ({ id: a.id, name: a.path })),
    clips = assets
      .filter((a) => a.mime === CLIP_MIME)
      .map((a) => ({ id: a.id, name: a.path }));
  let stopPreview = () => {};
  let selected = controller?.initial ?? '';
  function renderClip(c: AnimationClip): void {
    stopPreview = clipPreview(body, c, assets);
    const name = input('Clip name', c.name),
      loop = input('Loop', '', 'checkbox');
    name.input.onchange = () => {
      c.name = name.input.value;
    };
    loop.input.checked = c.loop;
    loop.input.onchange = () => {
      c.loop = loop.input.checked;
    };
    const fps = input('Frames per second', '12', 'number');
    fps.input.min = '1';
    const uniform = button('Set all frame durations', () => {
      const value = fps.input.valueAsNumber;
      if (!Number.isFinite(value) || value <= 0) {
        error.textContent = 'FPS must be positive';
        return;
      }
      for (const frame of c.frames) frame.duration = 1 / value;
      render();
    });
    body.append(
      name.row,
      loop.row,
      number('Clip speed', c.speed, (v) => {
        c.speed = v;
      }),
      fps.row,
      uniform,
      node('h3', '', 'Frames'),
    );
    for (const [i, frame] of c.frames.entries()) {
      const row = node('div', 'animation-row'),
        preview = node('img');
      preview.alt = `Frame ${i + 1}`;
      preview.src = assets.find((a) => a.id === frame.texture)?.data ?? '';
      row.append(
        node('strong', '', String(i + 1)),
        preview,
        select('Frame image', images, frame.texture, (v) => {
          frame.texture = v;
          preview.src = assets.find((a) => a.id === v)?.data ?? '';
        }),
        number('Seconds', frame.duration, (v) => {
          frame.duration = v;
          render();
        }),
        button('↑', () => {
          if (i > 0) {
            [c.frames[i - 1], c.frames[i]] = [c.frames[i]!, c.frames[i - 1]!];
            render();
          }
        }),
        button('↓', () => {
          if (i < c.frames.length - 1) {
            [c.frames[i + 1], c.frames[i]] = [c.frames[i]!, c.frames[i + 1]!];
            render();
          }
        }),
        button('Remove frame', () => {
          c.frames.splice(i, 1);
          render();
        }),
      );
      body.append(row);
    }
    body.append(
      button('+ Frame', () => {
        c.frames.push({ texture: images[0]?.id ?? '', duration: 1 / 12 });
        render();
      }),
      node('h3', '', 'Events'),
    );
    for (const [index, event] of c.events.entries()) {
      const row = node('div', 'animation-row'),
        eventName = input('Event name', event.name),
        payload = input(
          'Payload',
          event.payload === undefined ? '' : String(event.payload),
        );
      eventName.input.onchange = () => {
        event.name = eventName.input.value;
      };
      payload.input.onchange = () => {
        event.payload = payload.input.value || undefined;
      };
      row.append(
        number('Time', event.time, (value) => {
          event.time = value;
        }),
        eventName.row,
        payload.row,
        button('Remove event', () => {
          c.events.splice(index, 1);
          render();
        }),
      );
      body.append(row);
    }
    body.append(
      button('+ Event', () => {
        c.events.push({ time: 0, name: 'event' });
        render();
      }),
    );
  }
  function renderController(c: AnimatorController): void {
    animatorGraph(
      body,
      c,
      selected,
      (name) => {
        selected = name;
        render();
        body
          .querySelector(
            `[data-state-index="${c.states.findIndex((s) => s.name === name)}"]`,
          )
          ?.scrollIntoView?.({ block: 'nearest' });
      },
      (i) =>
        body
          .querySelector(`[data-transition-index="${i}"]`)
          ?.scrollIntoView?.({ block: 'nearest' }),
      (from, to) => {
        c.transitions.push({
          from,
          to,
          exitTime: 1,
          blend: 0.1,
          conditions: [],
        });
        render();
      },
    );
    const states = () => c.states.map((s) => ({ id: s.name, name: s.name }));
    body.append(
      select('Initial state', states(), c.initial, (v) => {
        c.initial = v;
      }),
      node('h3', '', 'States'),
    );
    for (const [i, state] of c.states.entries()) {
      const row = node('div', 'animation-row'),
        name = input('State name', state.name);
      row.dataset.stateIndex = String(i);
      name.input.onchange = () => {
        const next = name.input.value.trim();
        if (
          !next ||
          next === '*' ||
          c.states.some((s) => s !== state && s.name === next)
        ) {
          error.textContent =
            'Use a unique state name; * is reserved for Any state';
          name.input.value = state.name;
          return;
        }
        const old = state.name;
        state.name = next;
        if (selected === old) selected = next;
        if (c.initial === old) c.initial = state.name;
        for (const t of c.transitions) {
          if (t.from === old) t.from = state.name;
          if (t.to === old) t.to = state.name;
        }
        render();
      };
      row.append(
        name.row,
        select('State clip', clips, state.clip, (v) => {
          state.clip = v;
        }),
        number('State speed', state.speed, (v) => {
          state.speed = v;
        }),
        button('Remove state', () => {
          if (c.states.length === 1) {
            error.textContent = 'Keep at least one state';
            return;
          }
          c.transitions = c.transitions.filter(
            (t) => t.from !== state.name && t.to !== state.name,
          );
          c.states.splice(i, 1);
          if (c.initial === state.name) c.initial = c.states[0]!.name;
          if (selected === state.name) selected = c.initial;
          render();
        }),
      );
      body.append(row);
    }
    body.append(
      button('+ State', () => {
        let n = c.states.length + 1;
        while (c.states.some((s) => s.name === `State ${n}`)) n++;
        c.states.push({
          name: `State ${n}`,
          clip: clips[0]?.id ?? '',
          speed: 1,
        });
        render();
      }),
      node('h3', '', 'Parameters'),
    );
    for (const [key, p] of Object.entries(c.parameters)) {
      const row = node('div', 'animation-row'),
        name = input('Parameter name', key);
      name.input.onchange = () => {
        const next = name.input.value.trim();
        if (
          !next ||
          Object.hasOwn(c.parameters, next) ||
          ['__proto__', 'prototype', 'constructor'].includes(next)
        ) {
          error.textContent = 'Use a unique parameter name';
          name.input.value = key;
          return;
        }
        delete c.parameters[key];
        c.parameters[next] = p;
        for (const t of c.transitions)
          for (const condition of t.conditions)
            if (condition.parameter === key) condition.parameter = next;
        render();
      };
      row.append(
        name.row,
        select(
          'Parameter type',
          ['bool', 'float', 'int', 'trigger'].map((name) => ({
            id: name,
            name,
          })),
          p.type,
          (v) => {
            c.parameters[key] =
              v === 'bool'
                ? { type: 'bool', default: false }
                : v === 'trigger'
                  ? { type: 'trigger', default: false }
                  : v === 'int'
                    ? { type: 'int', default: 0 }
                    : { type: 'float', default: 0 };
            render();
          },
        ),
      );
      if (p.type === 'bool') {
        const field = input('Default', '', 'checkbox');
        field.input.checked = p.default;
        field.input.onchange = () => {
          p.default = field.input.checked;
        };
        row.append(field.row);
      } else if (p.type !== 'trigger')
        row.append(
          number('Default', p.default, (v) => {
            p.default = v;
          }),
        );
      row.append(
        button('Remove parameter', () => {
          delete c.parameters[key];
          c.transitions = c.transitions.filter(
            (t) => !t.conditions.some((v) => v.parameter === key),
          );
          render();
        }),
      );
      body.append(row);
    }
    body.append(
      button('+ Parameter', () => {
        let n = 1;
        while (Object.hasOwn(c.parameters, `parameter${n}`)) n++;
        c.parameters[`parameter${n}`] = { type: 'bool', default: false };
        render();
      }),
      node('h3', '', 'Transitions — first matching rule wins'),
    );
    for (const [i, t] of c.transitions.entries()) {
      const section = node('section', 'transition'),
        row = node('div', 'animation-row'),
        exit = input(
          'Exit time (cycles; blank = immediate)',
          t.exitTime === null ? '' : String(t.exitTime),
          'number',
        );
      section.dataset.transitionIndex = String(i);
      exit.input.step = 'any';
      exit.input.onchange = () => {
        t.exitTime = exit.input.value === '' ? null : exit.input.valueAsNumber;
      };
      row.append(
        select(
          'From',
          [{ id: '*', name: 'Any state' }, ...states()],
          t.from,
          (v) => {
            t.from = v;
          },
        ),
        select('To', states(), t.to, (v) => {
          t.to = v;
        }),
        exit.row,
        number('Blend seconds', t.blend, (value) => {
          t.blend = value;
        }),
        button('Earlier rule', () => {
          if (i > 0) {
            [c.transitions[i - 1], c.transitions[i]] = [
              c.transitions[i]!,
              c.transitions[i - 1]!,
            ];
            render();
          }
        }),
        button('Later rule', () => {
          if (i + 1 < c.transitions.length) {
            [c.transitions[i + 1], c.transitions[i]] = [
              c.transitions[i]!,
              c.transitions[i + 1]!,
            ];
            render();
          }
        }),
        button('Remove transition', () => {
          c.transitions.splice(i, 1);
          render();
        }),
      );
      section.append(row);
      for (const [j, condition] of t.conditions.entries()) {
        const row = node('div', 'animation-row'),
          parameter = c.parameters[condition.parameter];
        row.append(
          select(
            'Parameter',
            Object.keys(c.parameters).map((name) => ({ id: name, name })),
            condition.parameter,
            (v) => {
              condition.parameter = v;
              condition.value = c.parameters[v]?.default ?? false;
              render();
            },
          ),
          select(
            'Comparison',
            ['==', '!=', '>', '<', '>=', '<='].map((name) => ({
              id: name,
              name,
            })),
            condition.operator,
            (v) => {
              condition.operator = v as typeof condition.operator;
            },
          ),
        );
        if (parameter?.type === 'bool' || parameter?.type === 'trigger') {
          const v = input('Value', '', 'checkbox');
          v.input.checked = Boolean(condition.value);
          v.input.onchange = () => {
            condition.value = v.input.checked;
          };
          row.append(v.row);
        } else
          row.append(
            number('Value', Number(condition.value), (v) => {
              condition.value = v;
            }),
          );
        row.append(
          button('Remove condition', () => {
            t.conditions.splice(j, 1);
            render();
          }),
        );
        section.append(row);
      }
      section.append(
        button('+ Condition', () => {
          const key = Object.keys(c.parameters)[0];
          if (!key) {
            error.textContent = 'Create a parameter first';
            return;
          }
          t.conditions.push({
            parameter: key,
            operator: '==',
            value: c.parameters[key]!.default,
          });
          render();
        }),
      );
      body.append(section);
    }
    body.append(
      button('+ Transition', () => {
        const first = c.states[0]?.name ?? '';
        c.transitions.push({
          from: first,
          to: c.states[1]?.name ?? first,
          exitTime: null,
          blend: 0.1,
          conditions: [],
        });
        render();
      }),
    );
  }
  function render(): void {
    stopPreview();
    body.replaceChildren();
    if (clip) renderClip(clip);
    if (controller) renderController(controller);
  }
  render();
  dialog.append(
    node('h2', '', clip ? 'Animation clip' : 'Animator controller'),
    pathField.row,
    body,
    error,
    button('Save animation', () => {
      try {
        save(pathField.input.value, clip ?? controller);
        dialog.close();
      } catch (e) {
        error.textContent = String(e);
      }
    }),
    button('Cancel', () => dialog.close()),
  );
  dialog.onclose = () => {
    stopPreview();
    dialog.remove();
  };
  document.body.append(dialog);
  dialog.showModal();
}
