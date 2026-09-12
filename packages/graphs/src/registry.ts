import type { ContactEvent } from '@protomake/physics2d/rapier';
import type { ScriptContext } from '@protomake/scripting';
import type { BehaviourGraph, GraphNodeSchema, GraphValue } from './schema';
import type { z } from 'zod';

export type PortType =
  | 'flow'
  | 'any'
  | 'number'
  | 'boolean'
  | 'string'
  | 'vector2'
  | 'entity'
  | 'asset';
export interface GraphPort {
  readonly id: string;
  readonly label: string;
  readonly type: PortType;
  readonly direction: 'input' | 'output';
  readonly multiple?: boolean;
}
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export interface NodeExecution {
  readonly context: ScriptContext;
  readonly graph: BehaviourGraph;
  readonly node: GraphNode;
  readonly event?: ContactEvent;
  readonly state: Map<string, unknown>;
  input(name: string): GraphValue | undefined;
  variable(name: string): GraphValue | undefined;
  setVariable(name: string, value: GraphValue): void;
  continue(port: string, delaySeconds?: number): void;
}
export interface NodeDefinition {
  readonly type: string;
  readonly title: string;
  readonly category: string;
  readonly ports: readonly GraphPort[];
  readonly search?: readonly string[];
  readonly properties?: readonly {
    readonly id: string;
    readonly label: string;
    readonly type: 'string' | 'number' | 'boolean';
    readonly default: string | number | boolean;
  }[];
  readonly event?:
    | { readonly hook: string }
    | { readonly input: 'pressed' | 'released' }
    | { readonly signal: true };
  evaluate?(execution: NodeExecution, port: string): GraphValue | undefined;
  execute?(execution: NodeExecution): string | readonly string[] | void;
}
export interface GraphDiagnostic {
  readonly node?: string;
  readonly connection?: string;
  readonly message: string;
}
export class NodeRegistry {
  private readonly definitions = new Map<string, NodeDefinition>();
  register(definition: NodeDefinition): this {
    if (this.definitions.has(definition.type))
      throw new Error(`Duplicate graph node type: ${definition.type}`);
    this.definitions.set(definition.type, definition);
    return this;
  }
  get(type: string): NodeDefinition | undefined {
    return this.definitions.get(type);
  }
  all(): readonly NodeDefinition[] {
    return [...this.definitions.values()].sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.title.localeCompare(b.title),
    );
  }
  search(query: string): readonly NodeDefinition[] {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return this.all().filter((definition) => {
      const text = [
        definition.title,
        definition.category,
        ...(definition.search ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }
  validate(graph: BehaviourGraph): GraphDiagnostic[] {
    const diagnostics: GraphDiagnostic[] = [];
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const node of graph.nodes)
      if (!this.get(node.type))
        diagnostics.push({
          node: node.id,
          message: `Missing node definition ${node.type}`,
        });
      else if (
        (node.type === 'event.signal' || node.type === 'signal.emit') &&
        !String(node.properties.name ?? '').trim()
      )
        diagnostics.push({
          node: node.id,
          message: 'Signal name cannot be empty',
        });
    for (const connection of graph.connections) {
      const fromNode = nodes.get(connection.from.node),
        toNode = nodes.get(connection.to.node),
        from =
          fromNode &&
          this.get(fromNode.type)?.ports.find(
            (port) =>
              port.id === connection.from.port && port.direction === 'output',
          ),
        to =
          toNode &&
          this.get(toNode.type)?.ports.find(
            (port) =>
              port.id === connection.to.port && port.direction === 'input',
          );
      if (!from || !to) {
        diagnostics.push({
          connection: connection.id,
          message: `Connection ${connection.id} uses a missing or incorrectly directed port`,
        });
        continue;
      }
      if (from.type !== 'any' && to.type !== 'any' && from.type !== to.type)
        diagnostics.push({
          connection: connection.id,
          message: `Cannot connect ${from.type} to ${to.type}`,
        });
    }
    const destinations = new Map<string, number>();
    for (const connection of graph.connections) {
      const key = `${connection.to.node}:${connection.to.port}`;
      destinations.set(key, (destinations.get(key) ?? 0) + 1);
    }
    for (const [key, count] of destinations)
      if (count > 1) {
        const separator = key.lastIndexOf(':'),
          nodeId = key.slice(0, separator),
          portId = key.slice(separator + 1),
          node = nodes.get(nodeId!),
          port =
            node &&
            this.get(node.type)?.ports.find((item) => item.id === portId);
        if (!port?.multiple)
          diagnostics.push({
            node: nodeId,
            message: `Input ${portId} has multiple connections`,
          });
      }
    for (const name of Object.keys(graph.variables))
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
        diagnostics.push({ message: `Invalid variable name ${name}` });
    for (const [name, variable] of Object.entries(graph.variables)) {
      const value = variable.default,
        valid =
          variable.type === 'number'
            ? typeof value === 'number'
            : variable.type === 'boolean'
              ? typeof value === 'boolean'
              : variable.type === 'vector2'
                ? Array.isArray(value)
                : typeof value === 'string';
      if (!valid)
        diagnostics.push({
          message: `Variable ${name} default does not match ${variable.type}`,
        });
    }
    return diagnostics;
  }
}

export const flowIn: GraphPort = {
  id: 'in',
  label: 'In',
  type: 'flow',
  direction: 'input',
};
export const flowOut: GraphPort = {
  id: 'out',
  label: 'Out',
  type: 'flow',
  direction: 'output',
};
