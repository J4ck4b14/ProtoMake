import { Light2D } from '@protomake/renderer';
import { compose, type Matrix2D } from '@protomake/core';
import { EditorModel, pivotDelta } from './model';
import { point, hitBox, bounds, snap, type Point } from './geometry';
export type Tool = 'select' | 'move' | 'rotate' | 'scale' | 'pan';
interface Drag {
  kind: 'pan' | 'marquee' | 'move' | 'rotate' | 'scale';
  start: Point;
  last: Point;
  origin: Point;
  axis: 'x' | 'y' | 'xy';
  original: Map<string, Matrix2D>;
  append: boolean;
  initialSelection: string[];
}
export class SceneViewport {
  tool: Tool = 'move';
  zoom = 1;
  center: Point = [0, 0];
  snapping = true;
  spacing = 16;
  grid = true;
  private drag: Drag | undefined;
  private space = false;
  private context: CanvasRenderingContext2D;
  private observer: ResizeObserver;
  private width = 1;
  private height = 1;
  /** Optional renderer overlay integration; the editor owns navigation, not runtime camera state. */
  onViewChange: (() => void) | undefined;
  drawEntity:
    | ((
        context: CanvasRenderingContext2D,
        id: string,
        matrix: Matrix2D,
      ) => boolean)
    | undefined;
  entityOrder: (() => number[]) | undefined;
  entityBounds:
    | ((id: string) => {
        width: number;
        height: number;
        offsetX?: number;
        offsetY?: number;
      })
    | undefined;
  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly model: EditorModel,
    private readonly report: (error: unknown) => void,
  ) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D unavailable');
    this.context = context;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    canvas.addEventListener('pointerdown', (e) =>
      this.safe(() => this.down(e)),
    );
    canvas.addEventListener('pointermove', (e) =>
      this.safe(() => this.move(e)),
    );
    canvas.addEventListener('pointerup', () => this.safe(() => this.up()));
    canvas.addEventListener('pointercancel', () => this.cancel());
    canvas.addEventListener('lostpointercapture', () => {
      if (this.drag) this.cancel();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.drag) return;
        const screen = this.screen(e),
          before = this.toWorld(screen);
        this.zoom = Math.min(
          8,
          Math.max(0.1, this.zoom * Math.exp(-e.deltaY * 0.001)),
        );
        const after = this.toWorld(screen);
        this.center = [
          this.center[0] + before[0] - after[0],
          this.center[1] + before[1] - after[1],
        ];
        this.draw();
      },
      { passive: false },
    );
    canvas.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.space = true;
      }
      if (e.key === 'Escape') this.cancel();
    });
    canvas.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.space = false;
    });
    canvas.addEventListener('blur', () => {
      this.space = false;
      this.cancel();
    });
    model.onChange(() => this.draw());
  }
  private safe(operation: () => void): void {
    try {
      operation();
    } catch (error) {
      this.cancel();
      this.report(error);
    }
  }
  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    const ratio = devicePixelRatio || 1;
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    this.draw();
  }
  get view(): {
    x: number;
    y: number;
    zoom: number;
    width: number;
    height: number;
  } {
    return {
      x: this.center[0],
      y: this.center[1],
      zoom: this.zoom,
      width: this.width,
      height: this.height,
    };
  }
  toWorld(screen: Point): Point {
    return [
      (screen[0] - this.width / 2) / this.zoom + this.center[0],
      (screen[1] - this.height / 2) / this.zoom + this.center[1],
    ];
  }
  toScreen(world: Point): Point {
    return [
      (world[0] - this.center[0]) * this.zoom + this.width / 2,
      (world[1] - this.center[1]) * this.zoom + this.height / 2,
    ];
  }
  private screen(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }
  private pivot(): Point {
    const selected = [...this.model.selection];
    if (!selected.length) return [0, 0];
    const positions = selected.map((id) =>
      this.model.world.worldPosition(this.model.entity(id)),
    );
    return [
      positions.reduce((a, p) => a + p[0], 0) / positions.length,
      positions.reduce((a, p) => a + p[1], 0) / positions.length,
    ];
  }
  private down(e: PointerEvent): void {
    if (this.model.locked) return;
    this.canvas.focus();
    if (e.button !== 0 && e.button !== 1) return;
    const screen = this.screen(e),
      position = this.toWorld(screen),
      origin = this.pivot(),
      pivot = this.toScreen(origin),
      dx = screen[0] - pivot[0],
      dy = screen[1] - pivot[1];
    let kind: Drag['kind'] | undefined,
      axis: Drag['axis'] = 'xy';
    if (e.button === 1 || this.space || this.tool === 'pan') kind = 'pan';
    else if (this.model.selection.size) {
      if (this.tool === 'move') {
        if (Math.abs(dy) < 9 && dx > 12 && dx < 80) {
          kind = 'move';
          axis = 'x';
        } else if (Math.abs(dx) < 9 && dy < -12 && dy > -80) {
          kind = 'move';
          axis = 'y';
        } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12) kind = 'move';
      }
      if (this.tool === 'rotate' && Math.abs(Math.hypot(dx, dy) - 64) < 10)
        kind = 'rotate';
      if (this.tool === 'scale') {
        if (Math.abs(dx - 64) < 10 && Math.abs(dy) < 10) {
          kind = 'scale';
          axis = 'x';
        } else if (Math.abs(dx) < 10 && Math.abs(dy + 64) < 10) {
          kind = 'scale';
          axis = 'y';
        } else if (Math.abs(dx - 64) < 10 && Math.abs(dy + 64) < 10)
          kind = 'scale';
      }
    }
    if (!kind) {
      const hit = this.ordered()
        .reverse()
        .find((entity) => {
          const size = this.entityBounds?.(entity.guid) ?? {
            width: 48,
            height: 48,
          };
          return hitBox(
            this.shapeMatrix(entity.guid),
            position,
            size.width,
            size.height,
          );
        });
      if (hit) {
        if (e.shiftKey || e.ctrlKey || e.metaKey) this.model.toggle(hit.guid);
        else this.model.select([hit.guid]);
        this.draw();
        return;
      }
      kind = 'marquee';
    }
    const original = new Map(
      this.model
        .roots()
        .map((id) => [id, this.model.world.worldMatrix(this.model.entity(id))]),
    );
    this.drag = {
      kind,
      start: screen,
      last: screen,
      origin,
      axis,
      original,
      append: e.shiftKey || e.ctrlKey || e.metaKey,
      initialSelection: [...this.model.selection],
    };
    if (['move', 'rotate', 'scale'].includes(kind)) this.model.beginGesture();
    this.canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  private move(e: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    const screen = this.screen(e);
    if (drag.kind === 'pan') {
      this.center = [
        this.center[0] - (screen[0] - drag.last[0]) / this.zoom,
        this.center[1] - (screen[1] - drag.last[1]) / this.zoom,
      ];
    } else if (drag.kind === 'move') {
      let dx = (screen[0] - drag.start[0]) / this.zoom,
        dy = (screen[1] - drag.start[1]) / this.zoom;
      if (this.snapping && !e.altKey) {
        dx = snap(drag.origin[0] + dx, this.spacing) - drag.origin[0];
        dy = snap(drag.origin[1] + dy, this.spacing) - drag.origin[1];
      }
      if (drag.axis === 'x') dy = 0;
      if (drag.axis === 'y') dx = 0;
      this.model.transformSelection(compose(dx, dy), drag.original);
    } else if (drag.kind === 'rotate') {
      const pivot = this.toScreen(drag.origin);
      let angle =
        Math.atan2(screen[1] - pivot[1], screen[0] - pivot[0]) -
        Math.atan2(drag.start[1] - pivot[1], drag.start[0] - pivot[0]);
      if (this.snapping && !e.altKey) angle = snap(angle, Math.PI / 12);
      this.model.transformSelection(
        pivotDelta(...drag.origin, angle),
        drag.original,
      );
    } else if (drag.kind === 'scale') {
      let sx = Math.max(0.05, 1 + (screen[0] - drag.start[0]) / 64),
        sy = Math.max(0.05, 1 - (screen[1] - drag.start[1]) / 64);
      if (drag.axis === 'x') sy = 1;
      else if (drag.axis === 'y') sx = 1;
      else sy = sx;
      if (this.snapping && !e.altKey) {
        sx = Math.max(0.1, snap(sx, 0.1));
        sy = Math.max(0.1, snap(sy, 0.1));
      }
      this.model.transformSelection(
        pivotDelta(...drag.origin, 0, sx, sy),
        drag.original,
      );
    }
    drag.last = screen;
    this.draw();
  }
  private up(): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = undefined;
    if (drag.kind === 'marquee') {
      const left = Math.min(drag.start[0], drag.last[0]),
        top = Math.min(drag.start[1], drag.last[1]),
        right = Math.max(drag.start[0], drag.last[0]),
        bottom = Math.max(drag.start[1], drag.last[1]);
      const ids = [...this.model.world.all()]
        .filter((e) => {
          const size = this.entityBounds?.(e.guid) ?? { width: 48, height: 48 },
            b = bounds(this.shapeMatrix(e.guid), size.width, size.height),
            a = this.toScreen([b.x, b.y]),
            z = this.toScreen([b.x + b.width, b.y + b.height]);
          return a[0] <= right && z[0] >= left && a[1] <= bottom && z[1] >= top;
        })
        .map((e) => e.guid);
      this.model.select(drag.append ? [...drag.initialSelection, ...ids] : ids);
    } else if (drag.kind !== 'pan')
      this.model.finishGesture(
        `${drag.kind[0]!.toUpperCase() + drag.kind.slice(1)} entities`,
      );
    this.draw();
  }
  cancel(): void {
    this.drag = undefined;
    this.model.cancelGesture();
    this.draw();
  }
  frameSelected(): void {
    const ids = this.model.selection.size
      ? [...this.model.selection]
      : [...this.model.world.all()].map((e) => e.guid);
    if (!ids.length) {
      this.center = [0, 0];
      this.zoom = 1;
      this.draw();
      return;
    }
    const boxes = ids.map((id) => {
      const size = this.entityBounds?.(id) ?? { width: 48, height: 48 };
      return bounds(this.shapeMatrix(id), size.width, size.height);
    });
    const x = Math.min(...boxes.map((b) => b.x)),
      y = Math.min(...boxes.map((b) => b.y)),
      right = Math.max(...boxes.map((b) => b.x + b.width)),
      bottom = Math.max(...boxes.map((b) => b.y + b.height));
    this.center = [(x + right) / 2, (y + bottom) / 2];
    this.zoom = Math.max(
      0.1,
      Math.min(
        2,
        (this.width - 160) / Math.max(100, right - x),
        (this.height - 160) / Math.max(100, bottom - y),
      ),
    );
    this.draw();
  }
  private ordered() {
    return this.entityOrder
      ? this.entityOrder().map((id) => this.model.world.get(id))
      : [...this.model.world.all()];
  }
  private shapeMatrix(id: string): Matrix2D {
    const m = this.model.world.worldMatrix(this.model.entity(id)),
      size = this.entityBounds?.(id);
    if (!size) return m;
    const offset = point(m, [size.offsetX ?? 0, size.offsetY ?? 0]);
    return [m[0], m[1], m[2], m[3], offset[0], offset[1]];
  }
  draw(): void {
    const c = this.context,
      ratio = devicePixelRatio || 1;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    if (this.grid) {
      let spacing = this.spacing * this.zoom;
      while (spacing < 12) spacing *= 2;
      const zero = this.toScreen([0, 0]);
      c.lineWidth = 1;
      c.strokeStyle = '#26313c';
      c.beginPath();
      for (let x = zero[0] % spacing; x < this.width; x += spacing) {
        c.moveTo(x, 0);
        c.lineTo(x, this.height);
      }
      for (let y = zero[1] % spacing; y < this.height; y += spacing) {
        c.moveTo(0, y);
        c.lineTo(this.width, y);
      }
      c.stroke();
      c.strokeStyle = '#455465';
      c.beginPath();
      c.moveTo(zero[0], 0);
      c.lineTo(zero[0], this.height);
      c.moveTo(0, zero[1]);
      c.lineTo(this.width, zero[1]);
      c.stroke();
    }
    for (const entity of this.ordered()) {
      const m = this.shapeMatrix(entity.guid),
        position = this.toScreen([m[4], m[5]]),
        selected = this.model.selection.has(entity.guid),
        size = this.entityBounds?.(entity.guid) ?? { width: 48, height: 48 };
      c.save();
      c.translate(...position);
      c.transform(
        m[0] * this.zoom,
        m[1] * this.zoom,
        m[2] * this.zoom,
        m[3] * this.zoom,
        0,
        0,
      );
      const drawn = this.drawEntity?.(c, entity.guid, m) ?? false;
      if (!drawn) {
        c.fillStyle = this.model.world.isActive(entity.id)
          ? '#506778'
          : '#303943';
        c.fillRect(-size.width / 2, -size.height / 2, size.width, size.height);
      }
      c.strokeStyle = selected ? '#ffb66f' : '#738696';
      c.lineWidth = 1.5 / this.zoom;
      if (selected || !drawn)
        c.strokeRect(
          -size.width / 2,
          -size.height / 2,
          size.width,
          size.height,
        );
      const light = this.model.world.read(entity.id, Light2D);
      if (selected && light) {
        // Light dimensions are world units, independent of inherited entity scale.
        c.setTransform(ratio, 0, 0, ratio, 0, 0);
        c.translate(...position);
        c.rotate(Math.atan2(m[1], m[0]));
        c.scale(this.zoom, this.zoom);
        c.strokeStyle = light.color;
        c.lineWidth = 1.5 / this.zoom;
        c.setLineDash([5 / this.zoom, 4 / this.zoom]);
        c.beginPath();
        if (light.kind === 'area')
          c.rect(
            -light.width / 2,
            -light.height / 2,
            light.width,
            light.height,
          );
        else if (light.kind === 'spot') {
          const angle = (light.outerAngle * Math.PI) / 360;
          c.moveTo(0, 0);
          c.arc(0, 0, light.range, -angle, angle);
          c.closePath();
        } else
          c.arc(
            0,
            0,
            light.kind === 'ambient' ? 18 : light.range,
            0,
            Math.PI * 2,
          );
        c.stroke();
      }
      c.restore();
      if (selected) {
        c.fillStyle = '#e3eaf0';
        c.font = '11px system-ui';
        c.fillText(entity.name, position[0] + 12, position[1] + 30);
      }
    }
    if (this.model.selection.size && !this.model.locked) {
      const p = this.toScreen(this.pivot());
      c.save();
      c.translate(...p);
      c.lineWidth = 2;
      if (this.tool === 'move') {
        c.strokeStyle = '#ef797c';
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(76, 0);
        c.lineTo(65, -5);
        c.moveTo(76, 0);
        c.lineTo(65, 5);
        c.stroke();
        c.strokeStyle = '#80d6ad';
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(0, -76);
        c.lineTo(-5, -65);
        c.moveTo(0, -76);
        c.lineTo(5, -65);
        c.stroke();
        c.fillStyle = '#ffc286';
        c.fillRect(-6, -6, 12, 12);
      }
      if (this.tool === 'rotate') {
        c.strokeStyle = '#ffc286';
        c.beginPath();
        c.arc(0, 0, 64, 0, Math.PI * 2);
        c.stroke();
      }
      if (this.tool === 'scale') {
        c.strokeStyle = '#ffc286';
        c.beginPath();
        c.moveTo(0, -64);
        c.lineTo(0, 0);
        c.lineTo(64, 0);
        c.stroke();
        for (const [x, y] of [
          [64, 0],
          [0, -64],
          [64, -64],
        ]) {
          c.fillStyle = '#ffc286';
          c.fillRect(x! - 5, y! - 5, 10, 10);
        }
      }
      c.restore();
    }
    if (this.drag?.kind === 'marquee') {
      c.fillStyle = '#ffb66f22';
      c.strokeStyle = '#ffb66f';
      c.fillRect(
        this.drag.start[0],
        this.drag.start[1],
        this.drag.last[0] - this.drag.start[0],
        this.drag.last[1] - this.drag.start[1],
      );
      c.strokeRect(
        this.drag.start[0],
        this.drag.start[1],
        this.drag.last[0] - this.drag.start[0],
        this.drag.last[1] - this.drag.start[1],
      );
    }
    this.onViewChange?.();
  }
  dispose(): void {
    this.observer.disconnect();
  }
}
