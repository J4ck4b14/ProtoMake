import { PhysicsSettingsSchema } from '@protomake/physics2d';
import { InputMapSchema } from '@protomake/input';
import type { EditorModel } from './model';
import { node, button, input } from './dom';
export function showSettings(
  model: EditorModel,
  report: (message: string, error?: boolean) => void,
): void {
  if (model.locked) return;
  const dialog = node('dialog', 'settings'),
    heading = node('h2', '', 'Physics & input'),
    physics = structuredClone(model.project.physics),
    gx = input('Gravity X', String(physics.gravityX), 'number'),
    gy = input('Gravity Y', String(physics.gravityY), 'number'),
    names = input('Layer names', physics.layers.join(', ')),
    matrixHost = node('div', 'matrix'),
    bindings = node('textarea'),
    error = node('p', 'error');
  bindings.setAttribute('aria-label', 'Input action definitions');
  bindings.value = JSON.stringify(model.project.input, null, 2);
  bindings.rows = 15;
  bindings.spellcheck = false;
  function renderMatrix(): void {
    matrixHost.replaceChildren();
    const table = node('table');
    const header = node('tr');
    header.append(node('th', '', 'Collides'));
    for (const name of physics.layers) header.append(node('th', '', name));
    table.append(header);
    for (let i = 0; i < physics.layers.length; i++) {
      const row = node('tr');
      row.append(node('th', '', physics.layers[i]!));
      for (let j = 0; j < physics.layers.length; j++) {
        const cell = node('td'),
          check = node('input');
        check.type = 'checkbox';
        check.checked = physics.matrix[i]![j]!;
        check.setAttribute(
          'aria-label',
          `${physics.layers[i]} collides with ${physics.layers[j]}`,
        );
        check.onchange = () => {
          physics.matrix[i]![j] = check.checked;
          physics.matrix[j]![i] = check.checked;
          renderMatrix();
        };
        cell.append(check);
        row.append(cell);
      }
      table.append(row);
    }
    matrixHost.append(table);
  }
  names.input.onchange = () => {
    const layers = names.input.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (
      layers.length < 1 ||
      layers.length > 16 ||
      new Set(layers).size !== layers.length
    ) {
      error.textContent = 'Use 1–16 unique layer names';
      return;
    }
    const old = physics.layers;
    physics.matrix = layers.map((a) =>
      layers.map(
        (b) => physics.matrix[old.indexOf(a)]?.[old.indexOf(b)] ?? true,
      ),
    );
    physics.layers = layers;
    renderMatrix();
  };
  renderMatrix();
  const actions = node('div', 'actions');
  actions.append(
    button('Cancel', () => dialog.close()),
    button('Apply settings', () => {
      try {
        physics.gravityX = gx.input.valueAsNumber;
        physics.gravityY = gy.input.valueAsNumber;
        const settings = PhysicsSettingsSchema.parse(physics),
          inputMap = InputMapSchema.parse(
            JSON.parse(bindings.value) as unknown,
          );
        model.change('Project settings', () => {
          model.project.physics = settings;
          model.project.input = inputMap;
        });
        dialog.close();
        report('Physics and input settings updated');
      } catch (reason) {
        error.textContent = String(reason);
      }
    }),
  );
  dialog.append(
    heading,
    gx.row,
    gy.row,
    names.row,
    matrixHost,
    node('h3', '', 'Input actions'),
    node(
      'p',
      '',
      'Bindings use KeyboardEvent.code, Mouse0/1/2, GamepadButton0… and GamepadAxis0+/-. Edit action names and bindings below.',
    ),
    bindings,
    error,
    actions,
  );
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}
