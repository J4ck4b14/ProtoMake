import { guid } from '@protomake/core';
import {
  compileScript,
  compileProjectScripts,
} from '@protomake/scripting/compiler';
import { ScriptBehaviour } from '@protomake/scripting';
import type { EditorModel } from './model';
import { node, button, input } from './dom';
const template = `import type { ScriptContext } from '@protomake/scripting';

export const fields = {
  speed: { type: 'number', default: 1 },
  distance: { type: 'number', default: 100 },
} as const;

export default class MovingPlatform {
  speed = 1;
  distance = 100;
  private origin: readonly [number, number] = [0, 0];

  start(ctx: ScriptContext) {
    this.origin = ctx.position();
  }

  fixedUpdate(ctx: ScriptContext) {
    ctx.setPosition(
      this.origin[0] + Math.sin(ctx.elapsed * this.speed) * this.distance,
      this.origin[1],
    );
  }
}
`;
export function showScripts(
  model: EditorModel,
  report: (message: string, error?: boolean) => void,
): void {
  if (model.locked) {
    report('Stop Play Mode before editing scripts.', true);
    return;
  }
  const dialog = node('dialog', 'script-editor'),
    title = node('h2', '', 'Project TypeScript'),
    select = node('select'),
    name = input('Script path', 'Assets/Scripts/MovingPlatform.ts'),
    editor = node('textarea'),
    output = node('pre', 'script-diagnostics'),
    actions = node('div', 'actions');
  editor.setAttribute('aria-label', 'Script source');
  editor.spellcheck = false;
  editor.value = template;
  editor.rows = 23;
  select.setAttribute('aria-label', 'Project script');
  select.append(new Option('New script', ''));
  for (const asset of model.project.assets)
    if (asset.mime === 'text/typescript')
      select.append(new Option(asset.path, asset.id));
  select.onchange = () => {
    const asset = model.project.assets.find((a) => a.id === select.value);
    name.input.value = asset?.path ?? 'Assets/Scripts/MovingPlatform.ts';
    editor.value = asset?.data ?? template;
    output.textContent = '';
  };
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart,
        end = editor.selectionEnd;
      editor.setRangeText('  ', start, end, 'end');
    }
  });
  const check = () => {
    const result = compileScript(editor.value, name.input.value);
    output.textContent = `Compilation passed. Exposed fields: ${Object.keys(result.fields).join(', ') || 'none'}. Full semantic TypeScript checking runs in your external TypeScript editor; this browser compiler reports syntax and module-link errors.`;
    return result;
  };
  actions.append(
    button('Compile', () => {
      try {
        check();
      } catch (error) {
        output.textContent = String(error);
        report(String(error), true);
      }
    }),
    button('Save script', () => {
      try {
        check();
        let saved = '';
        model.change('Save script', () => {
          const id = select.value || guid(),
            asset = {
              id,
              path: name.input.value,
              kind: 'text' as const,
              mime: 'text/typescript' as const,
              data: editor.value,
              width: 0,
              height: 0,
            };
          const index = model.project.assets.findIndex((a) => a.id === id);
          if (index < 0) model.project.assets.push(asset);
          else model.project.assets[index] = asset;
          compileProjectScripts(model.project.assets);
          saved = id;
        });
        if (![...select.options].some((o) => o.value === saved))
          select.append(new Option(name.input.value, saved));
        select.value = saved;
        report(`Saved and compiled ${name.input.value}`);
      } catch (error) {
        output.textContent = String(error);
        report(String(error), true);
      }
    }),
    button('Attach to selection', () => {
      try {
        if (!select.value) throw new Error('Save the script first');
        if (!model.selection.size)
          throw new Error('Select at least one entity first');
        model.change('Attach script', () => {
          for (const id of model.selection) {
            const entity = model.entity(id),
              value = { script: select.value, values: {} };
            if (model.world.components(entity).has(ScriptBehaviour.type))
              model.world.set(entity, ScriptBehaviour.type, value);
            else model.world.add(entity, ScriptBehaviour.type, value);
          }
        });
        report('Script attached. Its exposed fields are now in the Inspector.');
      } catch (error) {
        output.textContent = String(error);
      }
    }),
    button('Close', () => dialog.close()),
  );
  dialog.append(title, select, name.row, editor, output, actions);
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}
