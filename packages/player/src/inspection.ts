import type { InspectorField } from '@protomake/core';
import type { EngineProfile } from '@protomake/runtime';
import type { RuntimeBehaviourSnapshot } from '@protomake/scripting';
export interface RuntimePropertySnapshot extends InspectorField {
  readonly value: unknown;
}
export interface RuntimeComponentSnapshot {
  readonly type: string;
  readonly name: string;
  readonly properties: readonly RuntimePropertySnapshot[];
}
export interface RuntimeEntitySnapshot {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly active: boolean;
  readonly parent: string | null;
  readonly components: readonly RuntimeComponentSnapshot[];
}
export interface RuntimeGraphSnapshot {
  readonly graph: string;
  readonly node: string;
  readonly phase: string;
  readonly values: Readonly<Record<string, unknown>>;
}
export interface RuntimeSnapshot {
  readonly scene: string;
  readonly state: string;
  readonly settings: readonly RuntimePropertySnapshot[];
  readonly entities: readonly RuntimeEntitySnapshot[];
  readonly behaviours: readonly RuntimeBehaviourSnapshot[];
  readonly graphs: readonly RuntimeGraphSnapshot[];
  readonly profile: EngineProfile;
}
