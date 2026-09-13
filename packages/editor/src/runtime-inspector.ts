import type { RuntimePropertySnapshot, RuntimeSnapshot } from '@protomake/player';
import type { RuntimeExposedField } from '@protomake/scripting';
import type { EditorModel } from './model';
import type { PlayMode } from './play-mode';
import { button, node } from './dom';

type EditableField = RuntimePropertySnapshot | RuntimeExposedField;
const fieldLabel = (field: EditableField) =>
  'label' in field ? field.label : field.name;
const fieldType = (field: EditableField) =>
  'kind' in field ? field.kind : field.type;

function depthOf(snapshot: RuntimeSnapshot, id: string): number {
  const parents = new Map(
    snapshot.entities.map((entity) => [entity.id, entity.parent]),
  );
  let depth = 0,
    parent = parents.get(id);
  while (parent) {
    depth++;
    parent = parents.get(parent);
  }
  return depth;
}

function editable(
  field: EditableField,
  changed: (value: unknown) => void,
): HTMLElement {
  if (field.options?.length) {
    const select = node('select');
    select.setAttribute('aria-label', fieldLabel(field));
    for (const option of field.options)
      select.append(new Option(option, option));
    select.value = String(field.value ?? '');
    select.onchange = () => changed(select.value);
    return select;
  }
  if (fieldType(field) === 'boolean') {
    const control = node('input');
    control.type = 'checkbox';
    control.checked = Boolean(field.value);
    control.setAttribute('aria-label', fieldLabel(field));
    control.onchange = () => changed(control.checked);
    return control;
  }
  if (fieldType(field) === 'number') {
    const control = node('input');
    control.type = 'number';
    control.value = String(field.value ?? 0);
    if (field.min !== undefined) control.min = String(field.min);
    if (field.max !== undefined) control.max = String(field.max);
    if (field.step !== undefined) control.step = String(field.step);
    control.setAttribute('aria-label', fieldLabel(field));
    control.oninput = () => {
      if (Number.isFinite(control.valueAsNumber))
        changed(control.valueAsNumber);
    };
    return control;
  }
  const control = node('input');
  control.value =
    typeof field.value === 'string'
      ? field.value
      : JSON.stringify(field.value ?? '');
  control.setAttribute('aria-label', fieldLabel(field));
  control.onchange = () => {
    if (fieldType(field) === 'vector2') {
      try {
        changed(JSON.parse(control.value));
      } catch {
        // Leave malformed vector text local until it is corrected.
      }
    } else changed(control.value);
  };
  return control;
}

/** Read-only runtime hierarchy plus intentionally gated authoring apply actions. */
export class RuntimeInspector {
  private dialog: HTMLDialogElement | undefined;
  private selected = '';
  constructor(
    private readonly play: PlayMode,
    private readonly model: EditorModel,
    private readonly report: (message: string, error?: boolean) => void,
  ) {
    play.onInspection(() => this.render());
  }
  open(): void {
    if (this.dialog) {
      this.dialog.focus();
      return;
    }
    const dialog = node('dialog', 'runtime-inspector');
    dialog.onclose = () => {
      dialog.remove();
      this.dialog = undefined;
    };
    this.dialog = dialog;
    document.body.append(dialog);
    this.render(true);
    dialog.show();
    this.play.inspect();
  }
  private safe(action: () => void): void {
    try {
      action();
    } catch (error) {
      this.report(String(error), true);
    }
  }
  private render(force = false): void {
    const dialog = this.dialog,
      snapshot = this.play.snapshot;
    if (!dialog) return;
    if (!force && dialog.contains(document.activeElement)) return;
    dialog.replaceChildren();
    const heading = node('header', 'runtime-inspector-header');
    heading.append(
      node(
        'h2',
        '',
        snapshot ? `Runtime · ${snapshot.scene}` : 'Runtime Inspector',
      ),
      button('Refresh', () => this.play.inspect()),
      button('Close', () => dialog.close()),
    );
    dialog.append(heading);
    if (!snapshot) {
      dialog.append(
        node('p', 'empty', 'Start Play Mode to inspect the live scene.'),
      );
      return;
    }
    if (!snapshot.entities.some((entity) => entity.id === this.selected))
      this.selected = snapshot.entities[0]?.id ?? '';
    const shell = node('div', 'runtime-inspector-shell'),
      hierarchy = node('aside', 'runtime-hierarchy'),
      details = node('main', 'runtime-details');
    hierarchy.append(node('h3', '', 'Live hierarchy'));
    for (const entity of [...snapshot.entities].sort(
      (a, b) => depthOf(snapshot, a.id) - depthOf(snapshot, b.id),
    )) {
      const row = button(`${entity.active ? '●' : '○'} ${entity.name}`, () => {
        this.selected = entity.id;
        this.render(true);
      });
      row.classList.toggle('selected', entity.id === this.selected);
      row.style.paddingLeft = `${10 + depthOf(snapshot, entity.id) * 14}px`;
      hierarchy.append(row);
    }
    this.renderDetails(details, snapshot);
    shell.append(hierarchy, details);
    dialog.append(shell);
  }
  private renderDetails(host: HTMLElement, snapshot: RuntimeSnapshot): void {
    const entity = snapshot.entities.find((item) => item.id === this.selected);
    if (!entity) return;
    host.append(node('h3', '', `${entity.name} · ${entity.id.slice(0, 8)}`));
    for (const component of entity.components) {
      const group = node('fieldset'),
        legend = node('legend', '', component.name);
      group.append(legend);
      for (const field of component.properties) {
        const row = node('label', 'runtime-property'),
          label = node('span', '', field.label);
        let value = structuredClone(field.value);
        row.append(
          label,
          editable(field, (next) => {
            value = next;
            this.play.setRuntimeComponent(
              entity.id,
              component.type,
              field.path,
              next,
            );
          }),
          button('Apply', () =>
            this.safe(() => {
              this.model.applyRuntimeComponent(
                entity.id,
                component.type,
                field.path,
                value,
              );
              this.report(
                `Applied ${component.name}.${field.label} to authoring`,
              );
            }),
          ),
        );
        group.append(row);
      }
      host.append(group);
    }
    for (const behaviour of snapshot.behaviours.filter(
      (item) => item.entity === entity.id,
    )) {
      const group = node('fieldset'),
        label = `${behaviour.kind === 'script' ? 'Script' : 'Graph'} · ${behaviour.source}`;
      group.append(node('legend', '', label));
      for (const field of behaviour.fields) {
        const row = node('label', 'runtime-property'),
          caption = node('span', '', field.name);
        let value = structuredClone(field.value);
        row.append(
          caption,
          editable(field, (next) => {
            value = next;
            this.play.setRuntimeBehaviour(
              entity.id,
              behaviour.id,
              field.name,
              next,
            );
          }),
          button('Apply', () =>
            this.safe(() => {
              this.model.applyRuntimeBehaviour(
                entity.id,
                behaviour.id,
                field.name,
                value,
              );
              this.report(`Applied ${field.name} to authoring`);
            }),
          ),
        );
        group.append(row);
      }
      host.append(group);
    }
    this.renderSettings(host, snapshot);
    const profile = node('section', 'runtime-profile');
    profile.append(
      node('h3', '', 'Profiler'),
      node(
        'p',
        '',
        `${snapshot.profile.frameMs.toFixed(2)} ms · ${snapshot.profile.fixedSteps} fixed steps · ${snapshot.profile.droppedSeconds.toFixed(3)} s dropped`,
      ),
    );
    for (const [system, ms] of Object.entries(snapshot.profile.systems).sort(
      (a, b) => b[1] - a[1],
    ))
      profile.append(
        node('p', 'runtime-profile-row', `${system} · ${ms.toFixed(3)} ms`),
      );
    host.append(profile);
    if (snapshot.graphs.length) {
      const graphs = node('section', 'runtime-graphs');
      graphs.append(node('h3', '', 'Graph values'));
      for (const trace of snapshot.graphs)
        graphs.append(
          node(
            'pre',
            '',
            `${trace.graph} / ${trace.node} / ${trace.phase}\n${JSON.stringify(trace.values, null, 2)}`,
          ),
        );
      host.append(graphs);
    }
  }
  private renderSettings(host: HTMLElement, snapshot: RuntimeSnapshot): void {
    const group = node('fieldset');
    group.append(node('legend', '', 'Runtime settings'));
    for (const field of snapshot.settings) {
      const row = node('label', 'runtime-property');
      let value = structuredClone(field.value);
      row.append(
        node('span', '', field.label),
        editable(field, (next) => {
          value = next;
          this.play.setRuntimeSetting(field.path, next);
        }),
        button('Apply', () =>
          this.safe(() => {
            this.model.applyRuntimeSetting(field.path, value);
            this.report(`Applied ${field.label} to project settings`);
          }),
        ),
      );
      group.append(row);
    }
    host.append(group);
  }
}
