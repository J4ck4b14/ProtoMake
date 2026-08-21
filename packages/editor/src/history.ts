export interface Command {
  readonly label: string;
  undo(): void;
  redo(): void;
}
/** A committed gesture is one command, irrespective of its pointer event count. */
export class History {
  private past: Command[] = [];
  private future: Command[] = [];
  constructor(readonly limit = 100) {}
  get undoLabel(): string | undefined {
    return this.past.at(-1)?.label;
  }
  get redoLabel(): string | undefined {
    return this.future.at(-1)?.label;
  }
  push(command: Command): void {
    this.past.push(command);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  undo(): void {
    const command = this.past.at(-1);
    if (!command) return;
    command.undo();
    this.past.pop();
    this.future.push(command);
  }
  redo(): void {
    const command = this.future.at(-1);
    if (!command) return;
    command.redo();
    this.future.pop();
    this.past.push(command);
  }
  clear(): void {
    this.past = [];
    this.future = [];
  }
}
