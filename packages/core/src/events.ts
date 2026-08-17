/** Dispatch is synchronous, ordered, and snapshot-based. Listener failures propagate. */
export class EventBus<Events extends object> {
  private readonly listeners = new Map<
    keyof Events,
    Set<(event: never) => void>
  >();
  on<K extends keyof Events>(
    type: K,
    listener: (event: Events[K]) => void,
  ): () => void {
    let group = this.listeners.get(type);
    if (!group) {
      group = new Set();
      this.listeners.set(type, group);
    }
    group.add(listener as (event: never) => void);
    return () => {
      group.delete(listener as (event: never) => void);
      if (group.size === 0 && this.listeners.get(type) === group)
        this.listeners.delete(type);
    };
  }
  emit<K extends keyof Events>(type: K, event: Events[K]): void {
    for (const listener of [...(this.listeners.get(type) ?? [])])
      listener(event as never);
  }
  clear(): void {
    this.listeners.clear();
  }
}
