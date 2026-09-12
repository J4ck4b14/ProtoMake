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
import { Behaviours } from '@protomake/scripting';
import { BehaviourGraphSchema, GRAPH_MIME } from '@protomake/graphs';
import { Tags, TransformComponent, decompose } from '@protomake/core';
import { EditorModel, getPath } from './model';
import { node, button, input } from './dom';
export class Inspector {
  constructor(
    private readonly host: HTMLElement,
    private readonly model: EditorModel,
    private readonly run: (action: () => void) => void,
    private readonly openScript?: (assetId: string) => void,
    private readonly openGraph?: (assetId: string) => void,
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
      if (type === TransformComponent.type) {
        this.renderTransform(data);
        continue;
      }
      if (type === Tags.type) {
        this.renderTags(data);
        continue;
      }
      if (type === Behaviours.type) {
        this.renderBehaviours(data);
        continue;
      }
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
      for (const field of inspectorFields) {
        const value = getPath(data, field.path);
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
              for (const [bit, input] of [
                ...row.querySelectorAll<HTMLInputElement>('input'),
              ].entries())
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
          if (field.help) {
            row.title = field.help;
            select.title = field.help;
          }
          if (field.kind !== 'enum') select.append(new Option('None', ''));
          if (field.kind === 'asset') {
            for (const asset of model.project.assets) {
              const suitable =
                type === 'protomake.animator'
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
        if (field.help) {
          control.row.title = field.help;
          control.input.title = field.help;
        }
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

  private renderTransform(data: unknown): void {
    const transform = TransformComponent.schema.parse(data),
      parts = decompose(transform.local),
      section = node('section', 'component'),
      header = node('div', 'component-header');
    header.append(
      node('h3', '', 'Transform'),
      button('Reset', () =>
        this.run(() => this.model.resetComponent(TransformComponent.type)),
      ),
    );
    section.append(header);
    const values: readonly [
      string,
      keyof Pick<typeof parts, 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY'>,
      number,
    ][] = [
      ['Position X', 'x', parts.x],
      ['Position Y', 'y', parts.y],
      ['Rotation', 'rotation', (parts.rotation * 180) / Math.PI],
      ['Scale X', 'scaleX', parts.scaleX],
      ['Scale Y', 'scaleY', parts.scaleY],
    ];
    for (const [label, property, value] of values) {
      const control = input(label, String(value), 'number');
      control.input.step = property === 'rotation' ? '1' : 'any';
      control.input.onchange = () =>
        this.run(() =>
          this.model.setTransformProperty(
            property,
            property === 'rotation'
              ? (control.input.valueAsNumber * Math.PI) / 180
              : control.input.valueAsNumber,
          ),
        );
      section.append(control.row);
    }
    const advanced = node('details'),
      summary = node('summary', '', 'Advanced matrix / shear');
    advanced.append(summary);
    transform.local.forEach((value, index) => {
      const control = input(
        ['a', 'b', 'c', 'd', 'x', 'y'][index]!,
        String(value),
        'number',
      );
      control.input.step = 'any';
      control.input.onchange = () =>
        this.run(() =>
          this.model.setProperty(
            TransformComponent.type,
            `local.${index}`,
            control.input.valueAsNumber,
          ),
        );
      advanced.append(control.row);
    });
    section.append(advanced);
    this.host.append(section);
  }

  private renderTags(data: unknown): void {
    const tags = Tags.schema.parse(data),
      section = node('section', 'component'),
      header = node('div', 'component-header'),
      control = input('Tags', tags.values.join(', '));
    header.append(
      node('h3', '', 'Tags'),
      button('Remove', () =>
        this.run(() => this.model.removeComponent(Tags.type)),
      ),
    );
    control.input.placeholder = 'Enemy, Boss, Damageable';
    control.input.onchange = () =>
      this.run(() =>
        this.model.setTags(
          control.input.value
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        ),
      );
    section.append(header, control.row);
    this.host.append(section);
  }

  private renderBehaviours(data: unknown): void {
    const behaviours = Behaviours.schema.parse(data),
      section = node('section', 'component behaviours'),
      header = node('div', 'component-header'),
      scripts = this.model.project.assets.filter(
        (asset) => asset.mime === 'text/typescript',
      ),
      graphs = this.model.project.assets.filter(
        (asset) => asset.mime === GRAPH_MIME,
      );
    header.append(node('h3', '', 'Behaviours'));
    if (scripts[0])
      header.append(
        button('+ Script', () =>
          this.run(() => this.model.addScriptBehaviour(scripts[0]!.id)),
        ),
      );
    if (graphs[0])
      header.append(
        button('+ Graph', () =>
          this.run(() => this.model.addGraphBehaviour(graphs[0]!.id)),
        ),
      );
    section.append(header);
    for (const id of behaviours.order) {
      const item = behaviours.items[id]!,
        card = node('article', 'behaviour-card'),
        cardHeader = node('div', 'component-header'),
        enabled = input('Enabled', '', 'checkbox'),
        select = node('select'),
        assets = item.kind === 'script' ? scripts : graphs,
        assetId = item.kind === 'script' ? item.script : item.graph;
      enabled.input.checked = item.enabled;
      enabled.input.onchange = () =>
        this.run(() =>
          this.model.setBehaviourProperty(id, 'enabled', enabled.input.checked),
        );
      select.setAttribute(
        'aria-label',
        item.kind === 'script' ? 'Behaviour script' : 'Behaviour graph',
      );
      select.append(
        new Option(
          item.kind === 'script' ? 'Select script' : 'Select graph',
          '',
        ),
      );
      for (const asset of assets)
        select.append(new Option(asset.path, asset.id));
      select.value = assetId;
      select.onchange = () =>
        this.run(() =>
          item.kind === 'script'
            ? this.model.replaceBehaviourScript(id, select.value)
            : this.model.replaceBehaviourGraph(id, select.value),
        );
      cardHeader.append(
        node(
          'strong',
          '',
          assets
            .find((asset) => asset.id === assetId)
            ?.path.split('/')
            .at(-1) ??
            (item.kind === 'script' ? 'Script Behaviour' : 'Graph Behaviour'),
        ),
        button('Remove', () => this.run(() => this.model.removeBehaviour(id))),
      );
      card.append(cardHeader, enabled.row, select);
      const attached = assets.find((candidate) => candidate.id === assetId);
      if (item.kind === 'graph' && attached) {
        if (this.openGraph)
          card.append(
            button(`Open graph · ${attached.path.split('/').at(-1)}`, () =>
              this.openGraph?.(attached.id),
            ),
          );
        try {
          const graph = BehaviourGraphSchema.parse(JSON.parse(attached.data));
          for (const [name, variable] of Object.entries(graph.variables)) {
            const value = item.values[name] ?? variable.default,
              control = input(
                name,
                Array.isArray(value) ? value.join(', ') : String(value ?? ''),
                variable.type === 'number'
                  ? 'number'
                  : variable.type === 'boolean'
                    ? 'checkbox'
                    : 'text',
              );
            if (variable.type === 'boolean')
              control.input.checked = Boolean(value);
            control.input.onchange = () =>
              this.run(() =>
                this.model.setBehaviourProperty(
                  id,
                  `values.${name}`,
                  variable.type === 'number'
                    ? control.input.valueAsNumber
                    : variable.type === 'boolean'
                      ? control.input.checked
                      : variable.type === 'vector2'
                        ? control.input.value.split(',').map(Number)
                        : control.input.value,
                ),
              );
            card.append(control.row);
          }
        } catch (error) {
          card.append(node('p', 'error', String(error)));
        }
      }
      const script = item.kind === 'script' ? attached : undefined;
      if (script) {
        if (this.openScript)
          card.append(
            button(`Open script · ${script.path.split('/').at(-1)}`, () =>
              this.openScript?.(script.id),
            ),
          );
        try {
          for (const [name, field] of Object.entries(
            scriptFields(script.data, script.path),
          )) {
            const value = item.values[name] ?? field.default;
            if (field.type === 'boolean') {
              const control = input(field.label || name, '', 'checkbox');
              control.input.checked = Boolean(value);
              control.input.onchange = () =>
                this.run(() =>
                  this.model.setBehaviourProperty(
                    id,
                    `values.${name}`,
                    control.input.checked,
                  ),
                );
              card.append(control.row);
            } else if (
              field.type === 'entity' ||
              field.type === 'asset' ||
              field.options?.length
            ) {
              const row = node('label', 'field'),
                fieldSelect = node('select');
              fieldSelect.append(new Option('None', ''));
              if (field.type === 'entity')
                for (const entity of this.model.world.all())
                  fieldSelect.append(new Option(entity.name, entity.guid));
              else if (field.type === 'asset')
                for (const asset of this.model.project.assets)
                  fieldSelect.append(new Option(asset.path, asset.id));
              else
                for (const option of field.options ?? [])
                  fieldSelect.append(new Option(option, option));
              fieldSelect.value = String(value);
              fieldSelect.onchange = () =>
                this.run(() =>
                  this.model.setBehaviourProperty(
                    id,
                    `values.${name}`,
                    fieldSelect.value,
                  ),
                );
              row.append(node('span', '', field.label || name), fieldSelect);
              card.append(row);
            } else {
              const control = input(
                field.label || name,
                String(value),
                field.type === 'number'
                  ? 'number'
                  : field.type === 'color'
                    ? 'color'
                    : 'text',
              );
              if (field.type === 'number') {
                control.input.step = String(field.step ?? 'any');
                if (field.min !== undefined)
                  control.input.min = String(field.min);
                if (field.max !== undefined)
                  control.input.max = String(field.max);
              }
              control.input.onchange = () =>
                this.run(() =>
                  this.model.setBehaviourProperty(
                    id,
                    `values.${name}`,
                    field.type === 'number'
                      ? control.input.valueAsNumber
                      : control.input.value,
                  ),
                );
              card.append(control.row);
            }
          }
        } catch (error) {
          card.append(node('p', 'error', String(error)));
        }
      }
      section.append(card);
    }
    if (!behaviours.order.length)
      section.append(
        node(
          'p',
          'empty',
          'Attach TypeScript or Graph Behaviours from the project browser.',
        ),
      );
    this.host.append(section);
  }
}
