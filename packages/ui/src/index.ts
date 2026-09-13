import { z } from 'zod';
import type { AssetData } from '@protomake/assets';
import {
  type ComponentDefinition,
  type ComponentRegistry,
  type Guid,
  type World,
} from '@protomake/core';
import type { SignalService, System } from '@protomake/runtime';

const LayoutSchema = z.strictObject({
  direction: z.enum(['row', 'column']),
  align: z.enum(['start', 'center', 'end', 'stretch']),
  justify: z.enum(['start', 'center', 'end', 'between']),
  gap: z.number().finite().nonnegative(),
  padding: z.number().finite().nonnegative(),
  margin: z.number().finite(),
  grow: z.number().finite().nonnegative(),
  width: z.string(),
  height: z.string(),
  anchor: z.enum([
    'top-left',
    'top',
    'top-right',
    'left',
    'center',
    'right',
    'bottom-left',
    'bottom',
    'bottom-right',
    'stretch',
  ]),
});
export const UiLayout: ComponentDefinition<z.infer<typeof LayoutSchema>> = {
  type: 'protomake.ui-layout',
  displayName: 'UI Layout',
  schema: LayoutSchema,
  defaults: () => ({
    direction: 'column',
    align: 'stretch',
    justify: 'start',
    gap: 8,
    padding: 8,
    margin: 0,
    grow: 0,
    width: '',
    height: '',
    anchor: 'top-left',
  }),
  inspector: [
    {
      path: 'direction',
      label: 'Direction',
      kind: 'enum',
      options: ['row', 'column'],
    },
    {
      path: 'align',
      label: 'Align',
      kind: 'enum',
      options: ['start', 'center', 'end', 'stretch'],
    },
    {
      path: 'justify',
      label: 'Justify',
      kind: 'enum',
      options: ['start', 'center', 'end', 'between'],
    },
    { path: 'gap', label: 'Gap', kind: 'number', min: 0 },
    { path: 'padding', label: 'Padding', kind: 'number', min: 0 },
    { path: 'margin', label: 'Margin', kind: 'number' },
    { path: 'grow', label: 'Grow', kind: 'number', min: 0 },
    { path: 'width', label: 'Width', kind: 'string' },
    { path: 'height', label: 'Height', kind: 'string' },
    {
      path: 'anchor',
      label: 'Anchor',
      kind: 'enum',
      options: [
        'top-left',
        'top',
        'top-right',
        'left',
        'center',
        'right',
        'bottom-left',
        'bottom',
        'bottom-right',
        'stretch',
      ],
    },
  ],
};
export const UiRoot: ComponentDefinition<{ visible: boolean }> = {
  type: 'protomake.ui-root',
  displayName: 'UI Root',
  schema: z.strictObject({ visible: z.boolean() }),
  defaults: () => ({ visible: true }),
  inspector: [{ path: 'visible', label: 'Visible', kind: 'boolean' }],
};
export const UiPanel: ComponentDefinition<{ color: string; opacity: number }> =
  {
    type: 'protomake.ui-panel',
    displayName: 'UI Panel',
    schema: z.strictObject({
      color: z.string(),
      opacity: z.number().finite().min(0).max(1),
    }),
    defaults: () => ({ color: '#1b2630', opacity: 0.9 }),
    inspector: [
      { path: 'color', label: 'Color', kind: 'color' },
      {
        path: 'opacity',
        label: 'Opacity',
        kind: 'number',
        min: 0,
        max: 1,
        step: 0.05,
      },
    ],
  };
const TextSchema = z.strictObject({
  text: z.string(),
  font: z.string(),
  size: z.number().finite().positive(),
  color: z.string(),
  align: z.enum(['left', 'center', 'right']),
  wrap: z.boolean(),
  opacity: z.number().finite().min(0).max(1),
});
export const UiText: ComponentDefinition<z.infer<typeof TextSchema>> = {
  type: 'protomake.ui-text',
  displayName: 'UI Text',
  schema: TextSchema,
  defaults: () => ({
    text: 'Text',
    font: 'system-ui',
    size: 18,
    color: '#ffffff',
    align: 'left',
    wrap: true,
    opacity: 1,
  }),
  inspector: [
    { path: 'text', label: 'Text', kind: 'string' },
    { path: 'font', label: 'Font', kind: 'string' },
    { path: 'size', label: 'Size', kind: 'number', min: 1 },
    { path: 'color', label: 'Color', kind: 'color' },
    {
      path: 'align',
      label: 'Align',
      kind: 'enum',
      options: ['left', 'center', 'right'],
    },
    { path: 'wrap', label: 'Wrap', kind: 'boolean' },
    {
      path: 'opacity',
      label: 'Opacity',
      kind: 'number',
      min: 0,
      max: 1,
      step: 0.05,
    },
  ],
};
export const UiImage: ComponentDefinition<{
  texture: string;
  alt: string;
  fit: 'contain' | 'cover' | 'fill';
  opacity: number;
}> = {
  type: 'protomake.ui-image',
  displayName: 'UI Image',
  schema: z.strictObject({
    texture: z.string(),
    alt: z.string(),
    fit: z.enum(['contain', 'cover', 'fill']),
    opacity: z.number().finite().min(0).max(1),
  }),
  defaults: () => ({ texture: '', alt: '', fit: 'contain', opacity: 1 }),
  inspector: [
    { path: 'texture', label: 'Image', kind: 'asset' },
    { path: 'alt', label: 'Alt text', kind: 'string' },
    {
      path: 'fit',
      label: 'Fit',
      kind: 'enum',
      options: ['contain', 'cover', 'fill'],
    },
    {
      path: 'opacity',
      label: 'Opacity',
      kind: 'number',
      min: 0,
      max: 1,
      step: 0.05,
    },
  ],
};
export const UiButton: ComponentDefinition<{
  label: string;
  signal: string;
  disabled: boolean;
}> = {
  type: 'protomake.ui-button',
  displayName: 'UI Button',
  schema: z.strictObject({
    label: z.string(),
    signal: z.string(),
    disabled: z.boolean(),
  }),
  defaults: () => ({ label: 'Button', signal: 'ui.button', disabled: false }),
  inspector: [
    { path: 'label', label: 'Label', kind: 'string' },
    { path: 'signal', label: 'Signal', kind: 'string' },
    { path: 'disabled', label: 'Disabled', kind: 'boolean' },
  ],
};
const RangeSchema = z
  .strictObject({
    value: z.number().finite(),
    min: z.number().finite(),
    max: z.number().finite(),
    signal: z.string(),
  })
  .superRefine((value, context) => {
    if (
      value.max <= value.min ||
      value.value < value.min ||
      value.value > value.max
    )
      context.addIssue({
        code: 'custom',
        message: 'UI range requires min ≤ value ≤ max',
      });
  });
export const UiProgress: ComponentDefinition<z.infer<typeof RangeSchema>> = {
  type: 'protomake.ui-progress',
  displayName: 'UI Progress',
  schema: RangeSchema,
  defaults: () => ({ value: 100, min: 0, max: 100, signal: '' }),
  inspector: [
    { path: 'value', label: 'Value', kind: 'number' },
    { path: 'min', label: 'Min', kind: 'number' },
    { path: 'max', label: 'Max', kind: 'number' },
  ],
};
export const UiSlider: ComponentDefinition<
  z.infer<typeof RangeSchema> & { step: number }
> = {
  type: 'protomake.ui-slider',
  displayName: 'UI Slider',
  schema: RangeSchema.and(z.object({ step: z.number().finite().positive() })),
  defaults: () => ({
    value: 50,
    min: 0,
    max: 100,
    step: 1,
    signal: 'ui.slider',
  }),
  inspector: [
    { path: 'value', label: 'Value', kind: 'number' },
    { path: 'min', label: 'Min', kind: 'number' },
    { path: 'max', label: 'Max', kind: 'number' },
    { path: 'step', label: 'Step', kind: 'number', min: 0 },
    { path: 'signal', label: 'Signal', kind: 'string' },
  ],
};
export const UiToggle: ComponentDefinition<{
  label: string;
  value: boolean;
  signal: string;
}> = {
  type: 'protomake.ui-toggle',
  displayName: 'UI Toggle',
  schema: z.strictObject({
    label: z.string(),
    value: z.boolean(),
    signal: z.string(),
  }),
  defaults: () => ({ label: 'Toggle', value: false, signal: 'ui.toggle' }),
  inspector: [
    { path: 'label', label: 'Label', kind: 'string' },
    { path: 'value', label: 'Value', kind: 'boolean' },
    { path: 'signal', label: 'Signal', kind: 'string' },
  ],
};
export const UiTextInput: ComponentDefinition<{
  value: string;
  placeholder: string;
  signal: string;
}> = {
  type: 'protomake.ui-text-input',
  displayName: 'UI Text Input',
  schema: z.strictObject({
    value: z.string(),
    placeholder: z.string(),
    signal: z.string(),
  }),
  defaults: () => ({ value: '', placeholder: 'Enter text', signal: 'ui.text' }),
  inspector: [
    { path: 'value', label: 'Value', kind: 'string' },
    { path: 'placeholder', label: 'Placeholder', kind: 'string' },
    { path: 'signal', label: 'Signal', kind: 'string' },
  ],
};
export const UiScrollArea: ComponentDefinition<{
  horizontal: boolean;
  vertical: boolean;
}> = {
  type: 'protomake.ui-scroll',
  displayName: 'UI Scroll Area',
  schema: z.strictObject({ horizontal: z.boolean(), vertical: z.boolean() }),
  defaults: () => ({ horizontal: false, vertical: true }),
  inspector: [
    { path: 'horizontal', label: 'Horizontal', kind: 'boolean' },
    { path: 'vertical', label: 'Vertical', kind: 'boolean' },
  ],
};

const uiDefinitions: readonly ComponentDefinition<unknown>[] = [
  UiRoot,
  UiLayout,
  UiPanel,
  UiText,
  UiImage,
  UiButton,
  UiProgress,
  UiSlider,
  UiToggle,
  UiTextInput,
  UiScrollArea,
] as const;
export function registerUi(registry: ComponentRegistry): void {
  for (const definition of uiDefinitions) registry.register(definition);
}

export interface RuntimeUiService {
  setText(entity: Guid, text: string): void;
  setVisible(entity: Guid, visible: boolean): void;
  setValue(entity: Guid, value: number | boolean | string): void;
}

export class RuntimeUiSystem implements System, RuntimeUiService {
  readonly id = 'protomake.ui';
  private readonly assets = new Map<string, AssetData>();
  private root: HTMLDivElement | undefined;
  private signature = '';
  constructor(
    private readonly world: World,
    private readonly host: HTMLElement,
    assets: readonly AssetData[],
    private readonly signals: SignalService,
  ) {
    for (const asset of assets) this.assets.set(asset.id, asset);
  }
  start(): void {
    this.host.style.position ||= 'relative';
    this.root = document.createElement('div');
    this.root.className = 'protomake-game-ui';
    Object.assign(this.root.style, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      pointerEvents: 'none',
      overflow: 'hidden',
      zIndex: '2',
    });
    this.host.append(this.root);
    this.render();
  }
  update(): void {
    this.render();
  }
  stop(): void {
    this.root?.remove();
    this.root = undefined;
    this.signature = '';
  }
  private uiComponent(id: number): string | undefined {
    return uiDefinitions
      .map((item) => item.type)
      .find(
        (type) => type !== UiLayout.type && this.world.components(id).has(type),
      );
  }
  private render(): void {
    if (!this.root) return;
    const entities = [...this.world.all()].filter((entity) =>
        this.uiComponent(entity.id),
      ),
      next = JSON.stringify(
        entities.map((entity) => [
          entity.guid,
          entity.enabled,
          entity.parent,
          [...this.world.components(entity.id)].filter(([type]) =>
            type.startsWith('protomake.ui-'),
          ),
        ]),
      );
    if (next === this.signature) return;
    this.signature = next;
    this.root.replaceChildren();
    const elements = new Map<number, HTMLElement>();
    for (const entity of entities) {
      const element = this.createElement(entity.id);
      element.dataset.entity = entity.guid;
      element.hidden = !this.world.isActive(entity.id);
      this.applyLayout(entity.id, element);
      elements.set(entity.id, element);
    }
    for (const entity of entities) {
      const parent =
        entity.parent === null ? undefined : elements.get(entity.parent);
      (parent ?? this.root).append(elements.get(entity.id)!);
    }
  }
  private createElement(id: number): HTMLElement {
    const stable = this.world.get(id).guid,
      text = this.world.read(id, UiText),
      image = this.world.read(id, UiImage),
      button = this.world.read(id, UiButton),
      progress = this.world.read(id, UiProgress),
      slider = this.world.read(id, UiSlider),
      toggle = this.world.read(id, UiToggle),
      textInput = this.world.read(id, UiTextInput),
      scroll = this.world.read(id, UiScrollArea),
      panel = this.world.read(id, UiPanel),
      root = this.world.read(id, UiRoot);
    let element: HTMLElement;
    if (text) {
      element = document.createElement('span');
      element.textContent = text.text;
      Object.assign(element.style, {
        fontFamily: text.font,
        fontSize: `${text.size}px`,
        color: text.color,
        textAlign: text.align,
        whiteSpace: text.wrap ? 'normal' : 'nowrap',
        opacity: String(text.opacity),
      });
    } else if (image) {
      const node = document.createElement('img'),
        asset = this.assets.get(image.texture);
      node.src = asset?.kind === 'image' ? asset.data : '';
      node.alt = image.alt;
      Object.assign(node.style, {
        objectFit: image.fit,
        opacity: String(image.opacity),
      });
      element = node;
    } else if (button) {
      const node = document.createElement('button');
      node.type = 'button';
      node.textContent = button.label;
      node.disabled = button.disabled;
      node.onclick = () => this.signals.emit(button.signal, { entity: stable });
      element = node;
    } else if (progress) {
      const node = document.createElement('progress');
      node.value =
        (progress.value - progress.min) / (progress.max - progress.min);
      node.max = 1;
      element = node;
    } else if (slider) {
      const node = document.createElement('input');
      node.type = 'range';
      node.value = String(slider.value);
      node.min = String(slider.min);
      node.max = String(slider.max);
      node.step = String(slider.step);
      node.oninput = () => {
        this.setValue(stable, node.valueAsNumber);
        this.signals.emit(slider.signal, {
          entity: stable,
          value: node.valueAsNumber,
        });
      };
      element = node;
    } else if (toggle) {
      const label = document.createElement('label'),
        node = document.createElement('input');
      node.type = 'checkbox';
      node.checked = toggle.value;
      node.onchange = () => {
        this.setValue(stable, node.checked);
        this.signals.emit(toggle.signal, {
          entity: stable,
          value: node.checked,
        });
      };
      label.append(node, toggle.label);
      element = label;
    } else if (textInput) {
      const node = document.createElement('input');
      node.type = 'text';
      node.value = textInput.value;
      node.placeholder = textInput.placeholder;
      node.onchange = () => {
        this.setValue(stable, node.value);
        this.signals.emit(textInput.signal, {
          entity: stable,
          value: node.value,
        });
      };
      element = node;
    } else element = document.createElement('div');
    if (scroll) {
      element.style.overflowX = scroll.horizontal ? 'auto' : 'hidden';
      element.style.overflowY = scroll.vertical ? 'auto' : 'hidden';
    }
    if (panel) {
      element.style.background = panel.color;
      element.style.opacity = String(panel.opacity);
    }
    if (root) element.hidden = !root.visible;
    if (
      element.matches('input,progress') &&
      !element.hasAttribute('aria-label')
    )
      element.setAttribute('aria-label', this.world.get(id).name);
    element.style.pointerEvents =
      button || slider || toggle || textInput ? 'auto' : 'none';
    return element;
  }
  private applyLayout(id: number, element: HTMLElement): void {
    const layout = this.world.read(id, UiLayout);
    if (!layout) return;
    const align = {
        start: 'flex-start',
        center: 'center',
        end: 'flex-end',
        stretch: 'stretch',
      } as const,
      justify = {
        start: 'flex-start',
        center: 'center',
        end: 'flex-end',
        between: 'space-between',
      } as const;
    Object.assign(element.style, {
      display: 'flex',
      flexDirection: layout.direction,
      alignItems: align[layout.align],
      justifyContent: justify[layout.justify],
      gap: `${layout.gap}px`,
      padding: `${layout.padding}px`,
      margin: `${layout.margin}px`,
      flexGrow: String(layout.grow),
      width: layout.width,
      height: layout.height,
    });
    if (layout.anchor === 'stretch') {
      Object.assign(element.style, {
        position: 'absolute',
        inset: '0',
        width: 'auto',
        height: 'auto',
      });
      return;
    }
    const horizontal = layout.anchor.includes('left')
        ? '0'
        : layout.anchor.includes('right') || layout.anchor === 'right'
          ? '100%'
          : '50%',
      vertical = layout.anchor.includes('top')
        ? '0'
        : layout.anchor.includes('bottom') || layout.anchor === 'bottom'
          ? '100%'
          : '50%',
      translateX =
        horizontal === '0' ? '0' : horizontal === '100%' ? '-100%' : '-50%',
      translateY =
        vertical === '0' ? '0' : vertical === '100%' ? '-100%' : '-50%';
    Object.assign(element.style, {
      position: 'absolute',
      left: horizontal,
      top: vertical,
      transform: `translate(${translateX}, ${translateY})`,
    });
  }
  setText(entity: Guid, text: string): void {
    const id = this.world.find(entity);
    if (id === undefined) throw new Error(`Missing UI entity ${entity}`);
    const data = this.world.read(id, UiText);
    if (!data) throw new Error(`Entity ${entity} has no UI Text`);
    this.world.set(id, UiText.type, { ...data, text });
  }
  setVisible(entity: Guid, visible: boolean): void {
    const id = this.world.find(entity);
    if (id === undefined) throw new Error(`Missing UI entity ${entity}`);
    this.world.setEnabled(id, visible);
  }
  setValue(entity: Guid, value: number | boolean | string): void {
    const id = this.world.find(entity);
    if (id === undefined) throw new Error(`Missing UI entity ${entity}`);
    const range =
      this.world.read(id, UiProgress) ?? this.world.read(id, UiSlider);
    if (range && typeof value === 'number')
      this.world.set(
        id,
        this.world.components(id).has(UiProgress.type)
          ? UiProgress.type
          : UiSlider.type,
        { ...range, value },
      );
    else {
      const toggle = this.world.read(id, UiToggle),
        text = this.world.read(id, UiTextInput);
      if (toggle && typeof value === 'boolean')
        this.world.set(id, UiToggle.type, { ...toggle, value });
      else if (text && typeof value === 'string')
        this.world.set(id, UiTextInput.type, { ...text, value });
      else throw new Error(`UI value type mismatch on ${entity}`);
    }
  }
}
