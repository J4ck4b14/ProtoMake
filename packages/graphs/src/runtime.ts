import type { ContactEvent } from '@protomake/physics2d/rapier';
import type { AssetData } from '@protomake/assets';
import type { Behaviour, ScriptContext } from '@protomake/scripting';
import {
  BehaviourGraphSchema,
  GRAPH_MIME,
  type BehaviourGraph,
  type GraphValue,
} from './schema';
import { coreNodeRegistry } from './builtins';
import type { GraphNode, NodeExecution, NodeRegistry } from './registry';

export interface GraphTrace {
  readonly graph: string;
  readonly node: string;
  readonly phase: string;
  readonly values: Readonly<Record<string, GraphValue | undefined>>;
}
export interface GraphRuntimeOptions {
  readonly registry?: NodeRegistry;
  readonly trace?: (event: GraphTrace) => void;
  readonly budget?: number;
}
export class GraphRuntime {
  private readonly assets = new Map<string, AssetData>();
  readonly registry: NodeRegistry;
  constructor(
    assets: readonly AssetData[],
    private readonly options: GraphRuntimeOptions = {},
  ) {
    this.registry = options.registry ?? coreNodeRegistry();
    for (const asset of assets) this.assets.set(asset.id, asset);
  }
  create(
    assetId: string,
    values: Readonly<Record<string, unknown>>,
  ): Behaviour {
    const asset = this.assets.get(assetId);
    if (!asset || asset.mime !== GRAPH_MIME)
      throw new Error(`Missing Behaviour Graph ${assetId}`);
    const graph = BehaviourGraphSchema.parse(JSON.parse(asset.data));
    const diagnostics = this.registry.validate(graph);
    if (diagnostics.length)
      throw new Error(diagnostics.map((item) => item.message).join('; '));
    return new GraphBehaviour(graph, values, this.registry, this.options);
  }
}

class GraphBehaviour implements Behaviour {
  private readonly variables = new Map<string, GraphValue>();
  private readonly state = new Map<string, Map<string, unknown>>();
  private signalOff: (() => void)[] = [];
  private readonly resolving = new Set<string>();
  constructor(
    private readonly graph: BehaviourGraph,
    values: Readonly<Record<string, unknown>>,
    private readonly registry: NodeRegistry,
    private readonly options: GraphRuntimeOptions,
  ) {
    for (const name of Object.keys(values))
      if (!graph.variables[name])
        throw new Error(`Missing graph variable ${name}`);
    for (const [name, variable] of Object.entries(graph.variables)) {
      const override = values[name],
        value = (override as GraphValue | undefined) ?? variable.default,
        valid =
          variable.type === 'number'
            ? typeof value === 'number'
            : variable.type === 'boolean'
              ? typeof value === 'boolean'
              : variable.type === 'vector2'
                ? Array.isArray(value) &&
                  value.length === 2 &&
                  value.every((item) => typeof item === 'number')
                : typeof value === 'string';
      if (!valid)
        throw new Error(`Graph variable ${name} must be ${variable.type}`);
      this.variables.set(name, value);
    }
  }
  private run(
    phase: string,
    context: ScriptContext,
    event?: ContactEvent,
  ): void {
    for (const node of this.graph.nodes) {
      const eventDefinition = this.registry.get(node.type)?.event;
      if (
        eventDefinition &&
        'hook' in eventDefinition &&
        eventDefinition.hook === phase
      ) {
        this.options.trace?.({
          graph: this.graph.id,
          node: node.id,
          phase,
          values: {},
        });
        this.flow(node, 'out', context, event);
      }
    }
    if (phase === 'update')
      for (const node of this.graph.nodes) {
        const eventDefinition = this.registry.get(node.type)?.event,
          action = String(node.properties.action ?? '');
        if (
          eventDefinition &&
          'input' in eventDefinition &&
          (eventDefinition.input === 'pressed'
            ? context.input.wasPressed(action)
            : context.input.wasReleased(action))
        ) {
          this.options.trace?.({
            graph: this.graph.id,
            node: node.id,
            phase: node.type,
            values: {},
          });
          this.flow(node, 'out', context);
        }
      }
  }
  private execution(
    node: GraphNode,
    context: ScriptContext,
    event?: ContactEvent,
    continuation: (port: string, delaySeconds?: number) => void = () => {},
  ): NodeExecution {
    const input = (port: string): GraphValue | undefined => {
      const connection = this.graph.connections.find(
        (candidate) =>
          candidate.to.node === node.id && candidate.to.port === port,
      );
      if (!connection) return node.properties[port];
      const source = this.graph.nodes.find(
        (candidate) => candidate.id === connection.from.node,
      );
      const definition = source && this.registry.get(source.type);
      if (!source || !definition?.evaluate) return undefined;
      const key = `${source.id}:${connection.from.port}`;
      if (this.resolving.has(key))
        throw new Error(`Cyclic graph value connection at ${key}`);
      this.resolving.add(key);
      try {
        return definition.evaluate(
          this.execution(source, context, event),
          connection.from.port,
        );
      } finally {
        this.resolving.delete(key);
      }
    };
    return {
      context,
      graph: this.graph,
      node,
      ...(event ? { event } : {}),
      state:
        this.state.get(node.id) ??
        (() => {
          const value = new Map<string, unknown>();
          this.state.set(node.id, value);
          return value;
        })(),
      input,
      variable: (name) => this.variables.get(name),
      setVariable: (name, value) => {
        if (!this.graph.variables[name])
          throw new Error(`Missing graph variable ${name}`);
        this.variables.set(name, value);
      },
      continue: continuation,
    };
  }
  private flow(
    source: GraphNode,
    port: string,
    context: ScriptContext,
    event?: ContactEvent,
  ): void {
    const queue: { node: GraphNode; port: string }[] = [{ node: source, port }];
    let steps = 0;
    while (queue.length) {
      if (++steps > (this.options.budget ?? 1024))
        throw new Error(`Graph ${this.graph.id} exceeded its execution budget`);
      const current = queue.shift()!;
      for (const connection of this.graph.connections.filter(
        (candidate) =>
          candidate.from.node === current.node.id &&
          candidate.from.port === current.port,
      )) {
        const node = this.graph.nodes.find(
          (candidate) => candidate.id === connection.to.node,
        )!;
        const definition = this.registry.get(node.type)!,
          execution = this.execution(node, context, event, (next, delay) => {
            if (delay !== undefined)
              context.time.after(delay, () =>
                this.flow(node, next, context, event),
              );
            else queue.push({ node, port: next });
          });
        this.options.trace?.({
          graph: this.graph.id,
          node: node.id,
          phase: source.type,
          values: Object.fromEntries(
            definition.ports
              .filter(
                (candidate) =>
                  candidate.direction === 'input' && candidate.type !== 'flow',
              )
              .map((candidate) => [
                candidate.id,
                execution.input(candidate.id),
              ]),
          ),
        });
        const outputs = definition.execute?.(execution);
        for (const next of outputs === undefined
          ? []
          : Array.isArray(outputs)
            ? outputs
            : [outputs])
          queue.push({ node, port: next });
      }
    }
  }
  awake(context: ScriptContext): void {
    this.run('awake', context);
  }
  start(context: ScriptContext): void {
    this.run('start', context);
  }
  update(context: ScriptContext): void {
    this.run('update', context);
  }
  fixedUpdate(context: ScriptContext): void {
    this.run('fixedUpdate', context);
  }
  onEnable(context: ScriptContext): void {
    this.run('enable', context);
    for (const node of this.graph.nodes.filter((item) => {
      const eventDefinition = this.registry.get(item.type)?.event;
      return eventDefinition && 'signal' in eventDefinition;
    }))
      this.signalOff.push(
        context.events.on(String(node.properties.name ?? ''), (payload) => {
          const state = this.state.get(node.id) ?? new Map<string, unknown>();
          state.set('payload', payload);
          this.state.set(node.id, state);
          this.options.trace?.({
            graph: this.graph.id,
            node: node.id,
            phase: node.type,
            values: { payload: payload as GraphValue },
          });
          this.flow(node, 'out', context);
        }),
      );
  }
  onDisable(context: ScriptContext): void {
    for (const off of this.signalOff.splice(0)) off();
    this.run('disable', context);
  }
  onDestroy(context: ScriptContext): void {
    for (const off of this.signalOff.splice(0)) off();
    this.run('destroy', context);
  }
  onCollisionEnter(context: ScriptContext, event: ContactEvent): void {
    this.run('collisionEnter', context, event);
  }
  onCollisionExit(context: ScriptContext, event: ContactEvent): void {
    this.run('collisionExit', context, event);
  }
  onTriggerEnter(context: ScriptContext, event: ContactEvent): void {
    this.run('triggerEnter', context, event);
  }
  onTriggerExit(context: ScriptContext, event: ContactEvent): void {
    this.run('triggerExit', context, event);
  }
}
