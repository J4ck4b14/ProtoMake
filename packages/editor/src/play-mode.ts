import type { EditorModel } from './model';
export class PlayMode {
  private frame: HTMLIFrameElement | undefined;
  debug = false;
  private token = '';
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
      const data = event.data as { kind: string; message?: string };
      if (data.kind === 'ready')
        this.frame?.contentWindow?.postMessage(
          {
            kind: 'load',
            token: this.token,
            scene: structuredClone(this.model.scene),
            project: structuredClone(this.model.project),
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
    });
  }
  start(): void {
    if (this.state !== 'stopped') return;
    this.model.cancelGesture();
    this.model.locked = true;
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
  private send(kind: string): void {
    this.frame?.contentWindow?.postMessage(
      { kind, token: this.token },
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
    this.model.locked = false;
    this.model.notify();
    this.changed();
  }
}
