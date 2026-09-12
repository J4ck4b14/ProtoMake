import { InputMapSchema, type InputAction } from '@protomake/input';
import { button, input, node } from './dom';

export interface InputActionsEditor {
  readonly host: HTMLElement;
  value(): InputAction[];
}

export function createInputActionsEditor(
  initial: readonly InputAction[],
): InputActionsEditor {
  const host = node('div', 'input-actions-editor'),
    actions: InputAction[] = structuredClone([...initial]);
  host.setAttribute('aria-label', 'Input action definitions');

  function uniqueName(base: string): string {
    let name = base,
      suffix = 2;
    while (actions.some((action) => action.name === name))
      name = `${base} ${suffix++}`;
    return name;
  }

  function uniqueMap(base: string): string {
    let name = base,
      suffix = 2;
    while (actions.some((action) => action.map === name))
      name = `${base} ${suffix++}`;
    return name;
  }

  function bindings(
    action: InputAction,
    property: 'positiveX' | 'negativeX' | 'positiveY' | 'negativeY',
    label: string,
  ): HTMLLabelElement {
    const control = input(label, action[property].join(', '));
    control.input.placeholder = 'KeyA, ArrowLeft, GamepadAxis0-';
    control.input.onchange = () => {
      action[property] = control.input.value
        .split(',')
        .map((binding) => binding.trim())
        .filter(Boolean);
    };
    return control.row;
  }

  function render(): void {
    host.replaceChildren();
    const maps = [...new Set(actions.map((action) => action.map))];
    for (const map of maps) {
      const group = node('section', 'input-map'),
        heading = node('div', 'component-header'),
        mapName = input('Action map', map);
      mapName.input.onchange = () => {
        const name = mapName.input.value.trim();
        if (!name) return;
        for (const action of actions) if (action.map === map) action.map = name;
        render();
      };
      heading.append(node('h4', '', map));
      group.append(heading, mapName.row);
      for (const action of actions.filter(
        (candidate) => candidate.map === map,
      )) {
        const card = node('article', 'input-action'),
          cardHeader = node('div', 'component-header'),
          name = input('Name', action.name),
          kind = node('select'),
          sensitivity = input(
            'Sensitivity',
            String(action.sensitivity),
            'number',
          ),
          deadZone = input('Dead zone', String(action.deadZone), 'number'),
          invertX = input('Invert X', '', 'checkbox'),
          invertY = input('Invert Y', '', 'checkbox');
        cardHeader.append(
          node('strong', '', action.name),
          button('Remove', () => {
            actions.splice(actions.indexOf(action), 1);
            render();
          }),
        );
        name.input.onchange = () => {
          action.name = name.input.value.trim();
          render();
        };
        kind.setAttribute('aria-label', `${action.name} type`);
        for (const value of ['button', 'axis', 'vector2'] as const)
          kind.append(
            new Option(
              value === 'vector2'
                ? 'Vector2'
                : value[0]!.toUpperCase() + value.slice(1),
              value,
            ),
          );
        kind.value = action.kind;
        kind.onchange = () => {
          action.kind = kind.value as InputAction['kind'];
          render();
        };
        sensitivity.input.step = '0.05';
        sensitivity.input.min = '0.01';
        sensitivity.input.onchange = () =>
          (action.sensitivity = sensitivity.input.valueAsNumber);
        deadZone.input.step = '0.01';
        deadZone.input.min = '0';
        deadZone.input.max = '0.95';
        deadZone.input.onchange = () =>
          (action.deadZone = deadZone.input.valueAsNumber);
        invertX.input.checked = action.invertX;
        invertX.input.onchange = () => (action.invertX = invertX.input.checked);
        invertY.input.checked = action.invertY;
        invertY.input.onchange = () => (action.invertY = invertY.input.checked);
        card.append(cardHeader, name.row, kind, sensitivity.row, deadZone.row);
        if (action.kind === 'button')
          card.append(bindings(action, 'positiveX', 'Bindings'));
        else {
          card.append(
            bindings(action, 'positiveX', 'Positive X'),
            bindings(action, 'negativeX', 'Negative X'),
          );
          if (action.kind === 'vector2')
            card.append(
              bindings(action, 'positiveY', 'Positive Y'),
              bindings(action, 'negativeY', 'Negative Y'),
            );
          card.append(invertX.row);
          if (action.kind === 'vector2') card.append(invertY.row);
        }
        group.append(card);
      }
      group.append(
        button('+ Action', () => {
          actions.push({
            name: uniqueName('Action'),
            map,
            kind: 'button',
            sensitivity: 1,
            deadZone: 0.15,
            invertX: false,
            invertY: false,
            positiveX: [],
            negativeX: [],
            positiveY: [],
            negativeY: [],
          });
          render();
        }),
      );
      host.append(group);
    }
    host.append(
      button('+ Action map', () => {
        const map = uniqueMap('Action Map');
        actions.push({
          name: uniqueName('Action'),
          map,
          kind: 'button',
          sensitivity: 1,
          deadZone: 0.15,
          invertX: false,
          invertY: false,
          positiveX: [],
          negativeX: [],
          positiveY: [],
          negativeY: [],
        });
        render();
      }),
    );
  }

  render();
  return {
    host,
    value: () => InputMapSchema.parse(actions),
  };
}
