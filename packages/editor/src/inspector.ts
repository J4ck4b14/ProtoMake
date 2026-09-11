import { editMedia } from './media-editor';
import {
  Animator,
  CONTROLLER_MIME,
  CLIP_MIME,
  AnimatorControllerSchema,
} from '@protomake/animation';
import { PrefabLink } from '@protomake/prefabs';
import {
  revertPrefab,
  applyPrefabOverride,
  unpackPrefab,
} from './prefab-actions';
import { scriptFields } from '@protomake/scripting/compiler';
import { ScriptBehaviour } from '@protomake/scripting';
import { EditorModel, getPath } from './model';
import { node, button, input } from './dom';
export class Inspector {
  constructor(
    private readonly host: HTMLElement,
    private readonly model: EditorModel,
    private readonly run: (action: () => void) => void,
    private readonly openScript?: (assetId: string) => void,
  ) {}
  render(): void {
    const model = this.model;
    this.host.replaceChildren();
    const ids = [...model.selection];
    if (!ids.length) {
      this.host.append(
        node(
          'p',
          'empty',
          'Select an entity in the scene or hierarchy to edit its components.',
        ),
      );
      return;
    }
    const entity = model.world.get(model.entity(ids[0]!));
    this.host.append(
      node(
        'p',
        'eyebrow',
        ids.length === 1 ? 'ENTITY' : `${ids.length} ENTITIES SELECTED`,
      ),
    );
    const link = model.world.read(entity.id, PrefabLink);
    if (link) {
      const info = node('section', 'prefab-info'),
        asset = model.project.assets.find((a) => a.id === link.prefab);
      info.append(
        node('strong', '', `Prefab: ${asset?.path ?? 'Missing'}`),
        node('p', '', `${link.overrides.length} overrides on this entity`),
      );
      info.append(
        button('Revert instance', () =>
          this.run(() => revertPrefab(model, entity.guid)),
        ),
        button('Unpack instance', () =>
          this.run(() => unpackPrefab(model, entity.guid)),
        ),
      );
      for (const patch of link.overrides) {
        const row = node('div', 'override');
        row.append(
          node('span', '', patch.path.join(' → ')),
          button('Revert', () =>
            this.run(() => revertPrefab(model, entity.guid, patch.path)),
          ),
          button('Apply to base', () =>
            this.run(() => applyPrefabOverride(model, entity.guid, patch)),
          ),
        );
        info.append(row);
      }
      this.host.append(info);
    }
    const name = input('Name', entity.name);
    name.input.onchange = () =>
      this.run(() =>
        model.change('Rename entities', () => {
          for (const id of ids)
            model.world.rename(model.entity(id), name.input.value);
        }),
      );
    this.host.append(name.row);
    const enabled = input('Enabled', '', 'checkbox');
    enabled.input.checked = entity.enabled;
    enabled.input.onchange = () =>
      this.run(() =>
        model.change('Enable entities', () => {
          for (const id of ids)
            model.world.setEnabled(model.entity(id), enabled.input.checked);
        }),
      );
    this.host.append(enabled.row);
    const parentLabel = node('label', 'field'),
      parent = node('select');
    parent.setAttribute('aria-label', 'Parent');
    parent.append(new Option('Scene root', ''));
    for (const other of model.world.all())
      if (!ids.includes(other.guid))
        parent.append(new Option(other.name, other.guid));
    parent.value =
      entity.parent === null ? '' : model.world.get(entity.parent).guid;
    parent.onchange = () =>
      this.run(() => model.reparent(parent.value || null));
    parentLabel.append(node('span', '', 'Parent'), parent);
    this.host.append(parentLabel);
    for (const [type, data] of model.world.components(entity.id)) {
      if (type === PrefabLink.type) continue;
      const definition = model.registry.get(type),
        section = node('section', 'component'),
        header = node('div', 'component-header');
      header.append(
        node('h3', '', definition.displayName),
        button('Reset', () => this.run(() => model.resetComponent(type))),
      );
      if (type !== 'protomake.transform')
        header.append(
          button('Remove', () => this.run(() => model.removeComponent(type))),
        );
      section.append(header);
      if (type === Animator.type) {
        const controller = model.project.assets.find(
          (a) =>
            a.id === getPath(data, 'controller') && a.mime === CONTROLLER_MIME,
        );
        if (controller) {
          section.append(
            button('Edit controller', () =>
              this.run(() => editMedia(model, CONTROLLER_MIME, controller.id)),
            ),
          );
          const clips = new Set(
            AnimatorControllerSchema.parse(
              JSON.parse(controller.data),
            ).states.map((s) => s.clip),
          );
          for (const id of clips) {
            const asset = model.project.assets.find((a) => a.id === id);
            if (asset)
              section.append(
                button(`Edit clip: ${asset.path.split('/').at(-1)}`, () =>
                  this.run(() => editMedia(model, CLIP_MIME, id)),
                ),
              );
          }
        }
      }
      const inspectorFields = [...definition.inspector];
      if (type === ScriptBehaviour.type) {
        const script = model.project.assets.find(
          (a) => a.id === getPath(data, 'script'),
        );
        if (script) {
          if (this.openScript)
            section.append(button(`Open script · ${script.path.split('/').at(-1)}`, () => this.openScript?.(script.id)));
          try {
            const fields = scriptFields(script.data, script.path);
            for (const [name, field] of Object.entries(fields))
              inspectorFields.push({
                path: `values.${name}`,
                label: field.label || name,
                kind: field.type === 'string' && field.options?.length ? 'enum' : field.type,
                ...(field.options?.length ? { options: field.options } : {}),
                ...(field.help ? { help: field.help } : {}),
                ...(field.min !== undefined ? { min: field.min } : {}),
                ...(field.max !== undefined ? { max: field.max } : {}),
                ...(field.step !== undefined ? { step: field.step } : {}),
              });
          } catch (error) {
            section.append(node('p', 'error', String(error)));
          }
        }
      }
      for (const field of inspectorFields) {
        let value = getPath(data, field.path);
        if (
          value === undefined &&
          type === ScriptBehaviour.type &&
          field.path.startsWith('values.')
        ) {
          const script = model.project.assets.find(
            (a) => a.id === getPath(data, 'script'),
          );
          if (script)
            value = scriptFields(script.data, script.path)[field.path.slice(7)]
              ?.default;
        }
        if (field.kind === 'mask') {
          const row = node('fieldset', 'field mask-field'),
            legend = node('legend', '', field.label),
            current = Number(value ?? 0);
          row.append(legend);
          if (field.help) row.title = field.help;
          (field.options ?? []).forEach((option, index) => {
            const label = node('label', 'mask-option'),
              checkbox = node('input');
            checkbox.type = 'checkbox';
            checkbox.checked = (current & (1 << index)) !== 0;
            checkbox.onchange = () => {
              let mask = 0;
              for (const [bit, input] of [...row.querySelectorAll<HTMLInputElement>('input')].entries())
                if (input.checked) mask |= 1 << bit;
              this.run(() => model.setProperty(type, field.path, mask));
            };
            label.append(checkbox, node('span', '', option));
            row.append(label);
          });
          section.append(row);
          continue;
        }
        if (
          field.kind === 'asset' ||
          field.kind === 'enum' ||
          field.kind === 'entity'
        ) {
          const row = node('label', 'field'),
            select = node('select');
          select.setAttribute('aria-label', field.label);
          if (field.help) { row.title = field.help; select.title = field.help; }
          if (field.kind !== 'enum') select.append(new Option('None', ''));
          if (field.kind === 'asset') {
            for (const asset of model.project.assets) {
              const suitable =
                type === ScriptBehaviour.type && field.path === 'script'
                  ? asset.mime === 'text/typescript'
                  : type === 'protomake.animator'
                    ? asset.mime === 'application/x-protomake-animator'
                    : type === 'protomake.audio-source'
                      ? asset.kind === 'audio'
                      : type === 'protomake.sprite'
                        ? asset.kind === 'image'
                        : true;
              if (suitable) select.append(new Option(asset.path, asset.id));
            }
          } else if (field.kind === 'entity') {
            for (const entity of model.world.all())
              select.append(new Option(entity.name, entity.guid));
          } else {
            for (const option of field.options ?? [])
              select.append(new Option(option, option));
          }
          select.value = String(value ?? '');
          select.onchange = () =>
            this.run(() => model.setProperty(type, field.path, select.value));
          row.append(node('span', '', field.label), select);
          section.append(row);
          continue;
        }
        const control = input(
          field.label,
          String(value ?? ''),
          field.kind === 'number'
            ? 'number'
            : field.kind === 'boolean'
              ? 'checkbox'
              : field.kind === 'color'
                ? 'color'
                : 'text',
        );
        if (field.kind === 'number') {
          control.input.step = String(field.step ?? 'any');
          if (field.min !== undefined) control.input.min = String(field.min);
          if (field.max !== undefined) control.input.max = String(field.max);
        }
        if (field.help) { control.row.title = field.help; control.input.title = field.help; }
        if (field.path === 'restitution')
          control.input.title =
            '0 absorbs bounce; 1 is elastic. Values above 1 add energy.';
        if (field.kind === 'boolean') control.input.checked = Boolean(value);
        control.input.onchange = () =>
          this.run(() =>
            model.setProperty(
              type,
              field.path,
              field.kind === 'number'
                ? control.input.valueAsNumber
                : field.kind === 'boolean'
                  ? control.input.checked
                  : control.input.value,
            ),
          );
        if (
          link?.overrides.some(
            (p) =>
              p.path[0] === 'components' &&
              p.path[1] === type &&
              p.path.slice(2).join('.') === field.path,
          )
        )
          control.row.classList.add('override');
        section.append(control.row);
      }
      this.host.append(section);
    }
    const add = node('select');
    add.setAttribute('aria-label', 'Component type');
    for (const definition of model.registry.all())
      if (
        definition.type !== PrefabLink.type &&
        !model.world.components(entity.id).has(definition.type)
      )
        add.append(new Option(definition.displayName, definition.type));
    if (add.options.length) {
      this.host.append(
        add,
        button('Add component', () =>
          this.run(() => model.addComponent(add.value)),
        ),
      );
    }
    if (model.locked)
      for (const control of this.host.querySelectorAll<HTMLInputElement>(
        'input,select,button',
      ))
        control.disabled = true;
  }
}
