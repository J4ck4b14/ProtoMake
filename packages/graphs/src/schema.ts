import { z } from 'zod';

export const GRAPH_MIME = 'application/x-protomake-behaviour-graph' as const;
export const GRAPH_VERSION = 1 as const;
const stableId = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9_-]+$/);
export const GraphValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.tuple([z.number().finite(), z.number().finite()]),
]);
export type GraphValue = z.infer<typeof GraphValueSchema>;
export const GraphVariableSchema = z.strictObject({
  type: z.enum(['number', 'boolean', 'string', 'vector2', 'entity', 'asset']),
  default: GraphValueSchema,
});
export const GraphNodeSchema = z.strictObject({
  id: stableId,
  type: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  properties: z.record(z.string(), GraphValueSchema),
});
export const GraphConnectionSchema = z.strictObject({
  id: stableId,
  from: z.strictObject({ node: stableId, port: z.string().min(1) }),
  to: z.strictObject({ node: stableId, port: z.string().min(1) }),
});
export const GraphGroupSchema = z.strictObject({
  id: stableId,
  title: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  color: z.string(),
});
export const BehaviourGraphSchema = z
  .strictObject({
    version: z.literal(GRAPH_VERSION),
    id: stableId,
    nodes: z.array(GraphNodeSchema),
    connections: z.array(GraphConnectionSchema),
    variables: z.record(z.string(), GraphVariableSchema),
    groups: z.array(GraphGroupSchema),
  })
  .superRefine((graph, context) => {
    for (const [label, ids] of [
      ['node', graph.nodes.map((node) => node.id)],
      ['connection', graph.connections.map((connection) => connection.id)],
      ['group', graph.groups.map((group) => group.id)],
    ] as const)
      if (new Set(ids).size !== ids.length)
        context.addIssue({ code: 'custom', message: `Duplicate ${label} ID` });
    const nodes = new Set(graph.nodes.map((node) => node.id));
    for (const connection of graph.connections)
      if (!nodes.has(connection.from.node) || !nodes.has(connection.to.node))
        context.addIssue({
          code: 'custom',
          message: `Connection ${connection.id} references a missing node`,
        });
  });
export type BehaviourGraph = z.infer<typeof BehaviourGraphSchema>;

export function emptyGraph(id: string): BehaviourGraph {
  return BehaviourGraphSchema.parse({
    version: GRAPH_VERSION,
    id,
    nodes: [],
    connections: [],
    variables: {},
    groups: [],
  });
}
