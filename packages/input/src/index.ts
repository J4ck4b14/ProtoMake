import { z } from 'zod';
const BindingSchema = z
  .string()
  .regex(
    /^(Key[A-Z]|Digit[0-9]|Arrow(?:Up|Down|Left|Right)|Space|Enter|Escape|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|(?:Shift|Control|Alt|Meta)(?:Left|Right)|F(?:[1-9]|1[0-2])|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter)|Comma|Period|Slash|Backslash|Semicolon|Quote|BracketLeft|BracketRight|Minus|Equal|Backquote|Mouse[0-4]|GamepadButton(?:[0-9]|[12][0-9]|3[01])|GamepadAxis(?:[0-9]|1[0-5])[+-])$/,
    'Unknown input binding',
  );
export const InputActionSchema = z.strictObject({
  name: z.string().min(1),
  kind: z.enum(['button', 'axis', 'vector2']),
  positiveX: z.array(BindingSchema),
  negativeX: z.array(BindingSchema),
  positiveY: z.array(BindingSchema),
  negativeY: z.array(BindingSchema),
});
export type InputAction = z.infer<typeof InputActionSchema>;
export const InputMapSchema = z
  .array(InputActionSchema)
  .refine(
    (actions) => new Set(actions.map((a) => a.name)).size === actions.length,
    'Action names must be unique',
  );
export function defaultInput(): InputAction[] {
  return [
    {
      name: 'Move',
      kind: 'vector2',
      positiveX: ['KeyD', 'ArrowRight', 'GamepadAxis0+'],
      negativeX: ['KeyA', 'ArrowLeft', 'GamepadAxis0-'],
      positiveY: ['KeyS', 'ArrowDown', 'GamepadAxis1+'],
      negativeY: ['KeyW', 'ArrowUp', 'GamepadAxis1-'],
    },
    {
      name: 'Jump',
      kind: 'button',
      positiveX: ['Space', 'GamepadButton0'],
      negativeX: [],
      positiveY: [],
      negativeY: [],
    },
    {
      name: 'Interact',
      kind: 'button',
      positiveX: ['KeyE', 'Mouse0', 'GamepadButton2'],
      negativeX: [],
      positiveY: [],
      negativeY: [],
    },
  ];
}
/** Bindings are physical codes. Runtime consumers only read named actions. */
export class InputService {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private previous = new Set<string>();
  private vectors = new Map<string, readonly [number, number]>();
  private remove: (() => void) | undefined;
  constructor(readonly actions: readonly InputAction[]) {
    InputMapSchema.parse(actions);
  }
  attach(target: Window): void {
    this.detach();
    const down = (e: KeyboardEvent) => {
      const element = e.target as HTMLElement | null;
      if (element?.closest?.('input,textarea,select,[contenteditable="true"]'))
        return;
      this.keys.add(e.code);
      if (
        this.actions.some((a) =>
          [
            ...a.positiveX,
            ...a.negativeX,
            ...a.positiveY,
            ...a.negativeY,
          ].includes(e.code),
        )
      )
        e.preventDefault();
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const mouseDown = (e: MouseEvent) => this.keys.add(`Mouse${e.button}`),
      mouseUp = (e: MouseEvent) => this.keys.delete(`Mouse${e.button}`),
      blur = () => this.clear();
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('mousedown', mouseDown);
    target.addEventListener('mouseup', mouseUp);
    target.addEventListener('blur', blur);
    this.remove = () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('mousedown', mouseDown);
      target.removeEventListener('mouseup', mouseUp);
      target.removeEventListener('blur', blur);
    };
  }
  /** Injection enables deterministic input tests without emulating browser key events. */
  setPhysical(code: string, held: boolean): void {
    if (held) this.keys.add(code);
    else this.keys.delete(code);
  }
  sample(gamepads: readonly (Gamepad | null)[] = []): void {
    this.pressed.clear();
    const value = (binding: string): number => {
      if (this.keys.has(binding)) return 1;
      let match = /^GamepadButton(\d+)$/.exec(binding);
      if (match)
        return Math.max(
          0,
          ...gamepads
            .filter((p) => p?.connected)
            .map((p) => p!.buttons[Number(match![1])]?.value ?? 0),
        );
      match = /^GamepadAxis(\d+)([+-])$/.exec(binding);
      if (match) {
        const axis = Number(match[1]),
          sign = match[2] === '+' ? 1 : -1;
        return Math.max(
          0,
          ...gamepads
            .filter((p) => p?.connected)
            .map((p) => {
              const v = (p!.axes[axis] ?? 0) * sign;
              return v > 0.15 ? (v - 0.15) / 0.85 : 0;
            }),
        );
      }
      return 0;
    };
    const max = (bindings: readonly string[]) =>
      Math.max(0, ...bindings.map(value));
    for (const action of this.actions) {
      let x = max(action.positiveX) - max(action.negativeX),
        y =
          action.kind === 'vector2'
            ? max(action.positiveY) - max(action.negativeY)
            : 0;
      const length = Math.hypot(x, y);
      if (length > 1) {
        x /= length;
        y /= length;
      }
      this.vectors.set(action.name, [x, y]);
      if (length > 0.01) this.pressed.add(action.name);
    }
  }
  endFrame(): void {
    this.previous = new Set(this.pressed);
  }
  getVector(name: string): readonly [number, number] {
    this.require(name);
    return this.vectors.get(name) ?? [0, 0];
  }
  getAxis(name: string): number {
    return this.getVector(name)[0];
  }
  isPressed(name: string): boolean {
    this.require(name);
    return this.pressed.has(name);
  }
  wasPressed(name: string): boolean {
    return this.isPressed(name) && !this.previous.has(name);
  }
  wasReleased(name: string): boolean {
    return !this.isPressed(name) && this.previous.has(name);
  }
  private require(name: string): void {
    if (!this.actions.some((a) => a.name === name))
      throw new Error(`Unknown input action: ${name}`);
  }
  clear(): void {
    this.keys.clear();
    this.pressed.clear();
    this.previous.clear();
    this.vectors.clear();
  }
  detach(): void {
    this.remove?.();
    this.remove = undefined;
    this.clear();
  }
}
