/**
 * Re-exports the standalone player APIs used by browser hosts and editor Play Mode.
 */
export { runtimeRegistry, NoteComponent } from './registry';
export { RuntimePrefabs } from './prefabs';
export type {
  RuntimePropertySnapshot,
  RuntimeComponentSnapshot,
  RuntimeEntitySnapshot,
  RuntimeGraphSnapshot,
  RuntimeSnapshot,
} from './inspection';
