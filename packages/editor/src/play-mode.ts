import type { EditorModel } from './model';
import type { RuntimeSnapshot } from '@protomake/player';
export class PlayMode {
  private frame: HTMLIFrameElement | undefined;
  debug = false;
  private token = '';
  private playPosition: readonly [number, number] | undefined;
  private listeners = new Set<
    (snapshot: RuntimeSnapshot | undefined) => void
  >();
  snapshot: RuntimeSnapshot | undefined;
  state: 'stopped' | 'loading' | 'running' | 'paused' | 'faulted' = 'stopped';
  constructor(
    private readonly host: HTMLElement,
    private readonly model: EditorModel,
    private readonly report: (message: string, error?: boolean) => void,
    private readonly changed: () => void,
  ) {
    window.addEventListener('message', (event) => {
      if (
        event.source !== this.frame?.contentWindow ||
        event.origin !== location.origin ||
        !event.data ||
        event.data.token !== this.token
      )
        return;
      const data = event.data as {
        kind: string;
        message?: string;
        detail?: unknown;
      };
      if (data.kind === 'ready')
        this.frame?.contentWindow?.postMessage(
          {
            kind: 'load',
            token: this.token,
            scene: structuredClone(this.model.scene),
            project: structuredClone(this.model.project),
            detail: this.playPosition
              ? { position: [...this.playPosition] }
              : undefined,
          },
          location.origin,
        );
      if (data.kind === 'loaded') {
        this.state = 'running';
        this.setDebug(this.debug);
        this.changed();
      }
      if (data.kind === 'log') this.report(data.message ?? '');
      if (data.kind === 'faulted') {
        this.state = 'faulted';
        this.changed();
      }
      if (data.kind === 'error')
        this.report(data.message ?? 'Runtime error', true);
      if (data.kind === 'graph-trace')
        window.dispatchEvent(
          new CustomEvent('protomake-graph-trace', { detail: data.detail }),
        );
      if (data.kind === 'inspection') {
        this.snapshot = data.detail as RuntimeSnapshot | undefined;
        for (const listener of this.listeners) listener(this.snapshot);
      }
    });
  }
  onInspection(
    listener: (snapshot: RuntimeSnapshot | undefined) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  start(position?: readonly [number, number]): void {
    if (this.state !== 'stopped') return;
    this.model.cancelGesture();
    this.model.locked = true;
    this.playPosition = position;
    this.token = crypto.randomUUID();
    const frame = document.createElement('iframe');
    frame.title = 'ProtoMake isolated Play Mode';
    frame.src = `./play.html#${this.token}`;
    this.frame = frame;
    this.host.replaceChildren(frame);
    this.host.hidden = false;
    this.state = 'loading';
    this.model.notify();
    this.changed();
  }
  pause(): void {
    if (
      this.state === 'stopped' ||
      this.state === 'loading' ||
      this.state === 'faulted'
    )
      return;
    this.state = this.state === 'paused' ? 'running' : 'paused';
    this.send(this.state === 'paused' ? 'pause' : 'resume');
    this.changed();
  }
  step(): void {
    if (this.state === 'paused') this.send('step');
  }
  restart(): void {
    if (this.state !== 'stopped') this.send('restart');
  }
  recompile(): void {
    if (this.state !== 'stopped')
      this.send('recompile', { project: structuredClone(this.model.project) });
  }
  inspect(): void {
    if (this.state !== 'stopped') this.send('inspect');
  }
  setRuntimeComponent(
    entity: string,
    type: string,
    path: string,
    value: unknown,
  ): void {
    this.send('set-runtime-component', {
      detail: { entity, type, path, value },
    });
  }
  setRuntimeBehaviour(
    entity: string,
    behaviour: string,
    field: string,
    value: unknown,
  ): void {
    this.send('set-runtime-behaviour', {
      detail: { entity, behaviour, field, value },
    });
  }
  setRuntimeSetting(path: string, value: unknown): void {
    this.send('set-runtime-setting', { detail: { path, value } });
  }
  private send(kind: string, data: Record<string, unknown> = {}): void {
    this.frame?.contentWindow?.postMessage(
      { kind, token: this.token, ...data },
      location.origin,
    );
  }
  setDebug(enabled: boolean): void {
    this.debug = enabled;
    this.frame?.contentWindow?.postMessage(
      { kind: 'debug', token: this.token, enabled },
      location.origin,
    );
  }
  stop(): void {
    this.frame?.remove();
    this.frame = undefined;
    this.host.hidden = true;
    this.state = 'stopped';
    this.playPosition = undefined;
    this.snapshot = undefined;
    for (const listener of this.listeners) listener(undefined);
    this.model.locked = false;
    this.model.notify();
    this.changed();
  }
}
