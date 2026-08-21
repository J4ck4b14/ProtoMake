import type { EditorModel } from './model';
export class PlayMode {
  private frame: HTMLIFrameElement | undefined;
  private token = '';
  state: 'stopped' | 'running' | 'paused' = 'stopped';
  constructor(
    private readonly host: HTMLElement,
    private readonly model: EditorModel,
    private readonly report: (message: string) => void,
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
          },
          location.origin,
        );
      if (data.kind === 'error') this.report(data.message ?? 'Runtime error');
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
    this.state = 'running';
    this.model.notify();
    this.changed();
  }
  pause(): void {
    if (this.state === 'stopped') return;
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
