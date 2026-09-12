import { describe, expect, it, vi } from 'vitest';
import { guid } from '@protomake/core';
import type { AssetData } from '@protomake/assets';
import type { ContactEvent } from '@protomake/physics2d/rapier';
import type { ScriptContext } from '@protomake/scripting';
import {
  BehaviourGraphSchema,
  GRAPH_MIME,
  GraphRuntime,
  coreNodeRegistry,
  emptyGraph,
  type BehaviourGraph,
} from '@protomake/graphs';

function asset(graph: BehaviourGraph): AssetData {
  return {
    id: guid(),
    path: 'Assets/Door.graph',
    kind: 'text',
    mime: GRAPH_MIME,
    data: JSON.stringify(graph),
    width: 0,
    height: 0,
  };
}

describe('Behaviour Graph V1', () => {
  it('uses versioned authored data with stable identities and broken-reference validation', () => {
    const graph = emptyGraph('door_graph');
    graph.nodes.push({
      id: 'start',
      type: 'event.start',
      x: 0,
      y: 0,
      properties: {},
    });
    graph.connections.push({
      id: 'broken',
      from: { node: 'start', port: 'out' },
      to: { node: 'missing', port: 'in' },
    });
    expect(() => BehaviourGraphSchema.parse(graph)).toThrow(/missing node/i);
    expect(() =>
      BehaviourGraphSchema.parse({ ...emptyGraph('graph'), version: 2 }),
    ).toThrow();
  });

  it('finds nodes by gameplay language and rejects incompatible typed ports', () => {
    const registry = coreNodeRegistry(),
      graph = emptyGraph('typed_graph');
    expect(registry.search('play sound')[0]?.type).toBe('audio.play');
    expect(registry.search('spawn prefab')[0]?.type).toBe('prefab.spawn');
    graph.nodes.push(
      {
        id: 'axis',
        type: 'input.axis',
        x: 0,
        y: 0,
        properties: { action: 'Move' },
      },
      { id: 'branch', type: 'flow.branch', x: 200, y: 0, properties: {} },
    );
    graph.connections.push({
      id: 'wrong_type',
      from: { node: 'axis', port: 'value' },
      to: { node: 'branch', port: 'condition' },
    });
    expect(registry.validate(graph)[0]?.message).toMatch(/number to boolean/);
  });

  it('executes a trigger/audio/tween/delay chain through shared ScriptContext services', () => {
    const graph = emptyGraph('door_graph');
    graph.nodes.push(
      { id: 'trigger', type: 'event.triggerEnter', x: 0, y: 0, properties: {} },
      { id: 'other', type: 'event.other', x: 0, y: 160, properties: {} },
      {
        id: 'tag',
        type: 'entity.hasTag',
        x: 220,
        y: 0,
        properties: { tag: 'Player' },
      },
      { id: 'branch', type: 'flow.branch', x: 430, y: 0, properties: {} },
      { id: 'audio', type: 'audio.play', x: 640, y: 0, properties: {} },
      {
        id: 'open_position',
        type: 'value.constant',
        x: 640,
        y: 180,
        properties: { value: [10, 0] },
      },
      {
        id: 'open',
        type: 'time.tweenPosition',
        x: 850,
        y: 0,
        properties: { duration: 0.2 },
      },
      {
        id: 'delay',
        type: 'flow.delay',
        x: 1060,
        y: 0,
        properties: { seconds: 1 },
      },
      {
        id: 'closed_position',
        type: 'value.constant',
        x: 1060,
        y: 180,
        properties: { value: [0, 0] },
      },
      {
        id: 'close',
        type: 'time.tweenPosition',
        x: 1270,
        y: 0,
        properties: { duration: 0.2 },
      },
    );
    const connect = (
      id: string,
      from: string,
      fromPort: string,
      to: string,
      toPort: string,
    ) =>
      graph.connections.push({
        id,
        from: { node: from, port: fromPort },
        to: { node: to, port: toPort },
      });
    connect('flow1', 'trigger', 'out', 'branch', 'in');
    connect('other_tag', 'other', 'entity', 'tag', 'entity');
    connect('tag_condition', 'tag', 'value', 'branch', 'condition');
    connect('flow2', 'branch', 'true', 'audio', 'in');
    connect('flow3', 'audio', 'out', 'open', 'in');
    connect('open_value', 'open_position', 'value', 'open', 'position');
    connect('flow4', 'open', 'out', 'delay', 'in');
    connect('flow5', 'delay', 'out', 'close', 'in');
    connect('closed_value', 'closed_position', 'value', 'close', 'position');
    const graphAsset = asset(graph),
      playAudio = vi.fn(),
      tween = vi.fn(),
      trace = vi.fn(),
      context = {
        entity: 'door',
        entities: {
          withTag: (tag: string) => (tag === 'Player' ? ['player'] : []),
        },
        playAudio,
        tween: { to: tween, cancel: vi.fn() },
        time: {
          after: (_seconds: number, callback: () => void) => {
            callback();
            return 'timer';
          },
          every: vi.fn(),
          cancel: vi.fn(),
        },
      } as unknown as ScriptContext,
      behaviour = new GraphRuntime([graphAsset], { trace }).create(
        graphAsset.id,
        {},
      ),
      event: ContactEvent = {
        a: 'door',
        b: 'player',
        started: true,
        sensor: true,
      };
    behaviour.onTriggerEnter?.(context, event);
    expect(playAudio).toHaveBeenCalledWith('door');
    expect(tween).toHaveBeenNthCalledWith(
      1,
      'door',
      expect.objectContaining({ position: [10, 0] }),
    );
    expect(tween).toHaveBeenNthCalledWith(
      2,
      'door',
      expect.objectContaining({ position: [0, 0] }),
    );
    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({ graph: 'door_graph', node: 'audio' }),
    );
  });
});
