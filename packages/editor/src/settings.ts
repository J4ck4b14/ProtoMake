import { PhysicsSettingsSchema } from '@protomake/physics2d';
import type { EditorModel } from './model';
import { node, button, input } from './dom';
import { applyAppearance, loadAppearance } from './appearance';
import { createInputActionsEditor } from './input-actions-editor';
import {
  PersistenceSettingsSchema,
  type AchievementDefinition,
} from '@protomake/persistence';
export function showSettings(
  model: EditorModel,
  report: (message: string, error?: boolean) => void,
): void {
  if (model.locked) return;
  const dialog = node('dialog', 'settings'),
    heading = node('h2', '', 'Project settings'),
    physics = structuredClone(model.project.physics),
    gx = input('Gravity X', String(physics.gravityX), 'number'),
    gy = input('Gravity Y', String(physics.gravityY), 'number'),
    names = input('Layer names', physics.layers.join(', ')),
    matrixHost = node('div', 'matrix'),
    inputActions = createInputActionsEditor(model.project.input),
    persistence = structuredClone(model.project.persistence),
    saveVersion = input('Save version', String(persistence.version), 'number'),
    autosave = input('Autosave', '', 'checkbox'),
    achievementHost = node('div', 'achievement-settings'),
    error = node('p', 'error'),
    appearance = loadAppearance(),
    accent = input('UI accent', appearance.accent, 'color'),
    surface = input('UI surface', appearance.surface, 'color'),
    contrastNote = node(
      'p',
      'settings-note',
      'Text and focus colours are chosen automatically for readable contrast.',
    );
  autosave.input.checked = persistence.autosave;
  function renderAchievements(): void {
    achievementHost.replaceChildren();
    persistence.achievements.forEach((achievement, index) => {
      const row = node('section', 'component'),
        achievementId = input('ID', achievement.id),
        achievementName = input('Name', achievement.name),
        description = input('Description', achievement.description),
        icon = input('Icon asset ID', achievement.icon),
        hidden = input('Hidden', '', 'checkbox');
      hidden.input.checked = achievement.hidden;
      const update = () => {
        persistence.achievements[index] = {
          id: achievementId.input.value,
          name: achievementName.input.value,
          description: description.input.value,
          icon: icon.input.value,
          hidden: hidden.input.checked,
        };
      };
      for (const control of [
        achievementId.input,
        achievementName.input,
        description.input,
        icon.input,
        hidden.input,
      ])
        control.onchange = update;
      row.append(
        achievementId.row,
        achievementName.row,
        description.row,
        icon.row,
        hidden.row,
        button('Remove achievement', () => {
          persistence.achievements.splice(index, 1);
          renderAchievements();
        }),
      );
      achievementHost.append(row);
    });
  }
  renderAchievements();
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
          inputMap = inputActions.value(),
          persistenceSettings = PersistenceSettingsSchema.parse({
            ...persistence,
            version: saveVersion.input.valueAsNumber,
            autosave: autosave.input.checked,
          });
        model.change('Project settings', () => {
          model.project.physics = settings;
          model.project.input = inputMap;
          model.project.persistence = persistenceSettings;
        });
        applyAppearance({
          accent: accent.input.value,
          surface: surface.input.value,
        });
        dialog.close();
        report('Project and editor appearance settings updated');
      } catch (reason) {
        error.textContent = String(reason);
      }
    }),
  );
  dialog.append(
    heading,
    node('h3', '', 'Editor appearance'),
    accent.row,
    surface.row,
    contrastNote,
    node('h3', '', 'Physics'),
    gx.row,
    gy.row,
    names.row,
    matrixHost,
    node('h3', '', 'Input actions'),
    node(
      'p',
      '',
      'Create action maps and edit keyboard, mouse and gamepad bindings without raw project JSON.',
    ),
    inputActions.host,
    node('h3', '', 'Save game and achievements'),
    saveVersion.row,
    autosave.row,
    achievementHost,
    button('+ Achievement', () => {
      const achievement: AchievementDefinition = {
        id: `achievement_${persistence.achievements.length + 1}`,
        name: 'New achievement',
        description: '',
        icon: '',
        hidden: false,
      };
      persistence.achievements.push(achievement);
      renderAchievements();
    }),
    error,
    actions,
  );
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}
