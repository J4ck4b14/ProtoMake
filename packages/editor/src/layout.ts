import { node } from './dom';
const defaults = {
  left: 230,
  right: 290,
  bottom: 250,
  project: 300,
  console: 220,
};
type Key = keyof typeof defaults;
/** Layout belongs to this browser, not to authored project history. */
export function installLayout(
  app: HTMLElement,
  workspace: HTMLElement,
  bottom: HTMLElement,
): () => void {
  let sizes = { ...defaults };
  try {
    const saved = JSON.parse(
      localStorage.getItem('protomake.layout.v1') ?? '{}',
    ) as Record<string, unknown>;
    for (const key of Object.keys(defaults) as Key[])
      if (typeof saved[key] === 'number' && Number.isFinite(saved[key]))
        sizes[key] = saved[key];
  } catch {
    /* Storage can be disabled; resizing still works. */
  }
  const apply = () => {
    const width = Math.max(760, app.clientWidth);
    sizes.left = Math.max(140, Math.min(sizes.left, width * 0.35));
    sizes.right = Math.max(180, Math.min(sizes.right, width * 0.35));
    sizes.project = Math.max(160, Math.min(sizes.project, width * 0.4));
    sizes.console = Math.max(140, Math.min(sizes.console, width * 0.3));
    sizes.bottom = Math.max(
      140,
      Math.min(sizes.bottom, Math.max(650, app.clientHeight) * 0.55),
    );
    for (const [key, value] of Object.entries(sizes))
      app.style.setProperty(`--${key}-size`, `${value}px`);
    try {
      localStorage.setItem('protomake.layout.v1', JSON.stringify(sizes));
    } catch {
      /* Optional preferences. */
    }
  };
  const splitter = (key: Key, vertical: boolean, direction = 1) => {
    const handle = node(
      'div',
      `splitter ${vertical ? 'vertical' : 'horizontal'}`,
    );
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-label', `Resize ${key} panel`);
    handle.setAttribute(
      'aria-orientation',
      vertical ? 'vertical' : 'horizontal',
    );
    handle.title = 'Drag to resize · Arrow keys · Double-click to reset';
    handle.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const start = vertical ? e.clientX : e.clientY,
        size = sizes[key];
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing');
      handle.onpointermove = (move) => {
        sizes[key] =
          size + ((vertical ? move.clientX : move.clientY) - start) * direction;
        apply();
      };
      const end = () => {
        handle.onpointermove = null;
        document.body.classList.remove('resizing');
      };
      handle.onpointerup = end;
      handle.onpointercancel = end;
      handle.onlostpointercapture = end;
    };
    handle.onkeydown = (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
        return;
      e.preventDefault();
      e.stopPropagation();
      sizes[key] +=
        (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -10 : 10) * direction;
      apply();
    };
    handle.ondblclick = () => {
      sizes[key] = defaults[key];
      apply();
    };
    return handle;
  };
  workspace.children[0]!.after(splitter('left', true));
  workspace.children[2]!.after(splitter('right', true, -1));
  bottom.before(splitter('bottom', false, -1));
  bottom.children[0]!.after(splitter('project', true));
  bottom.children[2]!.after(splitter('console', true));
  window.addEventListener('resize', apply);
  apply();
  return () => {
    sizes = { ...defaults };
    apply();
  };
}
