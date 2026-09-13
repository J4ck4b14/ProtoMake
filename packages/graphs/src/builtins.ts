import type { Guid } from '@protomake/core';
import {
  NodeRegistry,
  flowIn,
  flowOut,
  type GraphPort,
  type PortType,
} from './registry';
import type { GraphValue } from './schema';

const output = (id: string, label: string, type: PortType): GraphPort => ({
  id,
  label,
  type,
  direction: 'output',
});
const input = (id: string, label: string, type: PortType): GraphPort => ({
  id,
  label,
  type,
  direction: 'input',
});
const property = (
  value: GraphValue | undefined,
  fallback: GraphValue,
): GraphValue => (value === undefined ? fallback : value);
const number = (value: GraphValue | undefined): number =>
  typeof value === 'number' ? value : 0;
const entity = (value: GraphValue | undefined, self: Guid): Guid =>
  typeof value === 'string' && value ? value : self;

export function coreNodeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  for (const [type, title] of [
    ['event.awake', 'Awake'],
    ['event.start', 'Start'],
    ['event.update', 'Update'],
    ['event.fixedUpdate', 'Fixed Update'],
    ['event.enable', 'Enable'],
    ['event.disable', 'Disable'],
    ['event.destroy', 'Destroy'],
    ['event.collisionEnter', 'Collision Enter'],
    ['event.collisionExit', 'Collision Exit'],
    ['event.triggerEnter', 'Trigger Enter'],
    ['event.triggerExit', 'Trigger Exit'],
  ] as const)
    registry.register({
      type,
      title,
      category: 'Events',
      ports: [flowOut],
      event: { hook: type.slice('event.'.length) },
    });
  registry
    .register({
      type: 'event.inputPressed',
      title: 'Input Pressed',
      category: 'Events',
      ports: [flowOut],
      properties: [
        { id: 'action', label: 'Action', type: 'string', default: 'Interact' },
      ],
      event: { input: 'pressed' },
    })
    .register({
      type: 'event.inputReleased',
      title: 'Input Released',
      category: 'Events',
      ports: [flowOut],
      properties: [
        { id: 'action', label: 'Action', type: 'string', default: 'Interact' },
      ],
      event: { input: 'released' },
    })
    .register({
      type: 'event.signal',
      title: 'Signal Received',
      category: 'Events',
      ports: [flowOut, output('payload', 'Payload', 'any')],
      properties: [
        { id: 'name', label: 'Signal', type: 'string', default: 'OpenDoor' },
      ],
      event: { signal: true },
      evaluate: (run) => run.state.get('payload') as GraphValue | undefined,
    })
    .register({
      type: 'flow.branch',
      title: 'Branch',
      category: 'Flow',
      ports: [
        flowIn,
        input('condition', 'Condition', 'boolean'),
        output('true', 'True', 'flow'),
        output('false', 'False', 'flow'),
      ],
      execute: (run) => (run.input('condition') ? 'true' : 'false'),
    })
    .register({
      type: 'flow.sequence',
      title: 'Sequence',
      category: 'Flow',
      ports: [
        flowIn,
        output('first', 'First', 'flow'),
        output('then', 'Then', 'flow'),
      ],
      execute: () => ['first', 'then'],
    })
    .register({
      type: 'flow.once',
      title: 'Once',
      category: 'Flow',
      ports: [flowIn, flowOut],
      execute: (run) => {
        if (run.state.get('done')) return;
        run.state.set('done', true);
        return 'out';
      },
    })
    .register({
      type: 'value.constant',
      title: 'Constant',
      category: 'Values',
      ports: [output('value', 'Value', 'any')],
      evaluate: (run) => property(run.node.properties.value, 0),
      properties: [{ id: 'value', label: 'Value', type: 'number', default: 0 }],
    })
    .register({
      type: 'variable.get',
      title: 'Get Variable',
      category: 'Values',
      ports: [output('value', 'Value', 'any')],
      evaluate: (run) => run.variable(String(run.node.properties.name ?? '')),
      properties: [
        { id: 'name', label: 'Variable', type: 'string', default: 'value' },
      ],
    })
    .register({
      type: 'variable.set',
      title: 'Set Variable',
      category: 'Values',
      ports: [flowIn, input('value', 'Value', 'any'), flowOut],
      execute: (run) => {
        const value = run.input('value');
        if (value !== undefined)
          run.setVariable(String(run.node.properties.name ?? ''), value);
        return 'out';
      },
      properties: [
        { id: 'name', label: 'Variable', type: 'string', default: 'value' },
      ],
    })
    .register({
      type: 'math.add',
      title: 'Add',
      category: 'Math',
      ports: [
        input('a', 'A', 'number'),
        input('b', 'B', 'number'),
        output('value', 'Value', 'number'),
      ],
      evaluate: (run) => number(run.input('a')) + number(run.input('b')),
    })
    .register({
      type: 'math.compare',
      title: 'Compare Numbers',
      category: 'Math',
      ports: [
        input('a', 'A', 'number'),
        input('b', 'B', 'number'),
        output('value', 'A ≥ B', 'boolean'),
      ],
      evaluate: (run) => number(run.input('a')) >= number(run.input('b')),
    })
    .register({
      type: 'entity.self',
      title: 'Self',
      category: 'Entity',
      ports: [output('entity', 'Entity', 'entity')],
      evaluate: (run) => run.context.entity,
    })
    .register({
      type: 'event.other',
      title: 'Collision Other Entity',
      category: 'Entity',
      ports: [output('entity', 'Other', 'entity')],
      evaluate: (run) => {
        if (!run.event) return '';
        return run.event.a === run.context.entity ? run.event.b : run.event.a;
      },
    })
    .register({
      type: 'entity.hasTag',
      title: 'Has Tag',
      category: 'Entity',
      search: ['check player tag'],
      ports: [
        input('entity', 'Entity', 'entity'),
        output('value', 'Has Tag', 'boolean'),
      ],
      evaluate: (run) => {
        const target = entity(run.input('entity'), run.context.entity);
        return run.context.entities
          .withTag(String(run.node.properties.tag ?? ''))
          .includes(target);
      },
      properties: [
        { id: 'tag', label: 'Tag', type: 'string', default: 'Player' },
      ],
    })
    .register({
      type: 'entity.closestTag',
      title: 'Find Closest by Tag',
      category: 'Entity',
      ports: [output('entity', 'Entity', 'entity')],
      evaluate: (run) =>
        run.context.entities.closestWithTag(
          String(run.node.properties.tag ?? ''),
        ) ?? '',
      properties: [
        { id: 'tag', label: 'Tag', type: 'string', default: 'Enemy' },
      ],
    })
    .register({
      type: 'transform.position',
      title: 'Get Position',
      category: 'Transform',
      ports: [
        input('entity', 'Entity', 'entity'),
        output('value', 'Position', 'vector2'),
      ],
      evaluate: (run) =>
        [
          ...run.context.position(
            entity(run.input('entity'), run.context.entity),
          ),
        ] as [number, number],
    })
    .register({
      type: 'transform.setPosition',
      title: 'Set Position',
      category: 'Transform',
      ports: [
        flowIn,
        input('entity', 'Entity', 'entity'),
        input('position', 'Position', 'vector2'),
        flowOut,
      ],
      execute: (run) => {
        const value = run.input('position');
        if (Array.isArray(value))
          run.context.setPosition(
            value[0],
            value[1],
            entity(run.input('entity'), run.context.entity),
          );
        return 'out';
      },
      properties: [
        { id: 'name', label: 'Signal', type: 'string', default: 'OpenDoor' },
      ],
    })
    .register({
      type: 'signal.emit',
      title: 'Emit Signal',
      category: 'Signals',
      ports: [flowIn, input('payload', 'Payload', 'any'), flowOut],
      execute: (run) => {
        run.context.events.emit(
          String(run.node.properties.name ?? ''),
          run.input('payload'),
        );
        return 'out';
      },
      properties: [
        { id: 'prefab', label: 'Prefab asset ID', type: 'string', default: '' },
      ],
    })
    .register({
      type: 'audio.play',
      title: 'Play Audio',
      category: 'Audio',
      search: ['play sound'],
      ports: [flowIn, input('entity', 'Entity', 'entity'), flowOut],
      execute: (run) => {
        run.context.playAudio(entity(run.input('entity'), run.context.entity));
        return 'out';
      },
    })
    .register({
      type: 'prefab.spawn',
      title: 'Spawn Prefab',
      category: 'Prefabs',
      search: ['instantiate'],
      ports: [
        flowIn,
        input('position', 'Position', 'vector2'),
        flowOut,
        output('entity', 'Entity', 'entity'),
      ],
      execute: (run) => {
        const position = run.input('position');
        const spawned = run.context.prefabs.instantiate(
          String(run.node.properties.prefab ?? ''),
          {
            ...(Array.isArray(position) ? { position } : {}),
          },
        );
        run.state.set('entity', spawned);
        return 'out';
      },
      evaluate: (run) => String(run.state.get('entity') ?? ''),
    })
    .register({
      type: 'scene.load',
      title: 'Load Scene',
      category: 'Scene',
      ports: [flowIn],
      execute: (run) =>
        run.context.loadScene(String(run.node.properties.scene ?? '')),
      properties: [
        { id: 'scene', label: 'Scene', type: 'string', default: '' },
      ],
    })
    .register({
      type: 'debug.log',
      title: 'Log',
      category: 'Debug',
      ports: [flowIn, input('message', 'Message', 'any'), flowOut],
      execute: (run) => {
        run.context.log(
          String(run.input('message') ?? run.node.properties.message ?? ''),
        );
        return 'out';
      },
      properties: [
        { id: 'message', label: 'Message', type: 'string', default: '' },
      ],
    });
  registry
    .register({
      type: 'flow.delay',
      title: 'Delay',
      category: 'Time',
      search: ['wait timer'],
      ports: [flowIn, input('seconds', 'Seconds', 'number'), flowOut],
      properties: [
        { id: 'seconds', label: 'Seconds', type: 'number', default: 1 },
      ],
      execute: (run) =>
        run.continue('out', Math.max(0, number(run.input('seconds')))),
    })
    .register({
      type: 'time.tweenPosition',
      title: 'Tween Position',
      category: 'Time',
      ports: [
        flowIn,
        input('entity', 'Entity', 'entity'),
        input('position', 'Position', 'vector2'),
        input('duration', 'Duration', 'number'),
        flowOut,
      ],
      properties: [
        { id: 'duration', label: 'Duration', type: 'number', default: 0.3 },
      ],
      execute: (run) => {
        const position = run.input('position');
        if (Array.isArray(position))
          run.context.tween.to(
            entity(run.input('entity'), run.context.entity),
            {
              duration: number(run.input('duration')) || 0.3,
              position,
            },
          );
        return 'out';
      },
    })
    .register({
      type: 'input.axis',
      title: 'Input Axis',
      category: 'Input',
      ports: [output('value', 'Value', 'number')],
      properties: [
        { id: 'action', label: 'Action', type: 'string', default: 'Move' },
      ],
      evaluate: (run) =>
        run.context.input.getAxis(String(run.node.properties.action ?? '')),
    })
    .register({
      type: 'input.vector2',
      title: 'Input Vector2',
      category: 'Input',
      ports: [output('value', 'Value', 'vector2')],
      properties: [
        { id: 'action', label: 'Action', type: 'string', default: 'Move' },
      ],
      evaluate: (run) =>
        [
          ...run.context.input.getVector(
            String(run.node.properties.action ?? ''),
          ),
        ] as [number, number],
    })
    .register({
      type: 'pointer.world',
      title: 'Pointer World Position',
      category: 'Input',
      ports: [output('value', 'Position', 'vector2')],
      evaluate: (run) =>
        [...run.context.pointer.worldPosition] as [number, number],
    })
    .register({
      type: 'physics.velocity',
      title: 'Get Velocity',
      category: 'Physics',
      ports: [
        input('entity', 'Entity', 'entity'),
        output('value', 'Velocity', 'vector2'),
      ],
      evaluate: (run) =>
        [
          ...run.context.physics.velocity(
            entity(run.input('entity'), run.context.entity),
          ),
        ] as [number, number],
    })
    .register({
      type: 'physics.setVelocity',
      title: 'Set Velocity',
      category: 'Physics',
      ports: [
        flowIn,
        input('entity', 'Entity', 'entity'),
        input('velocity', 'Velocity', 'vector2'),
        flowOut,
      ],
      execute: (run) => {
        const velocity = run.input('velocity');
        if (Array.isArray(velocity))
          run.context.physics.setVelocity(
            entity(run.input('entity'), run.context.entity),
            velocity[0],
            velocity[1],
          );
        return 'out';
      },
    });
  registry
    .register({
      type: 'ui.setText',
      title: 'Set UI Text',
      category: 'UI',
      ports: [
        flowIn,
        input('entity', 'Entity', 'entity'),
        input('text', 'Text', 'string'),
        flowOut,
      ],
      execute: (run) => {
        run.context.ui.setText(
          entity(run.input('entity'), run.context.entity),
          String(run.input('text') ?? ''),
        );
        return 'out';
      },
    })
    .register({
      type: 'ui.setVisible',
      title: 'Set UI Visible',
      category: 'UI',
      ports: [
        flowIn,
        input('entity', 'Entity', 'entity'),
        input('visible', 'Visible', 'boolean'),
        flowOut,
      ],
      execute: (run) => {
        run.context.ui.setVisible(
          entity(run.input('entity'), run.context.entity),
          Boolean(run.input('visible')),
        );
        return 'out';
      },
    })
    .register({
      type: 'ui.setValue',
      title: 'Set UI Value',
      category: 'UI',
      ports: [
        flowIn,
        input('entity', 'Entity', 'entity'),
        input('value', 'Value', 'any'),
        flowOut,
      ],
      execute: (run) => {
        const value = run.input('value');
        if (
          typeof value !== 'number' &&
          typeof value !== 'boolean' &&
          typeof value !== 'string'
        )
          throw new Error('UI value must be a number, boolean or string');
        run.context.ui.setValue(
          entity(run.input('entity'), run.context.entity),
          value,
        );
        return 'out';
      },
    })
    .register({
      type: 'save.write',
      title: 'Save Game',
      category: 'Persistence',
      ports: [flowIn, flowOut],
      properties: [
        { id: 'profile', label: 'Profile', type: 'string', default: 'default' },
        { id: 'slot', label: 'Slot', type: 'string', default: 'manual' },
      ],
      execute: (run) => {
        void run.context.save
          .save(
            String(run.node.properties.profile ?? 'default'),
            String(run.node.properties.slot ?? 'manual'),
          )
          .catch((error) => run.context.log(String(error)));
        return 'out';
      },
    })
    .register({
      type: 'save.load',
      title: 'Load Game',
      category: 'Persistence',
      ports: [flowIn, flowOut],
      properties: [
        { id: 'profile', label: 'Profile', type: 'string', default: 'default' },
        { id: 'slot', label: 'Slot', type: 'string', default: 'manual' },
      ],
      execute: (run) => {
        void run.context.save
          .load(
            String(run.node.properties.profile ?? 'default'),
            String(run.node.properties.slot ?? 'manual'),
          )
          .catch((error) => run.context.log(String(error)));
        return 'out';
      },
    })
    .register({
      type: 'achievement.unlock',
      title: 'Unlock Achievement',
      category: 'Persistence',
      ports: [flowIn, flowOut],
      properties: [
        { id: 'id', label: 'Achievement', type: 'string', default: '' },
      ],
      execute: (run) => {
        run.context.achievements.unlock(String(run.node.properties.id ?? ''));
        return 'out';
      },
    });
  return registry;
}
