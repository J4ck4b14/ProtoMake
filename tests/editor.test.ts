import { describe, it, expect } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { compose, guid } from '@protomake/core';
import {
  EditorModel,
  NoteComponent,
  pivotDelta,
  getPath,
} from '@protomake/editor';
import { ProjectStorage } from '../packages/editor/src/storage';
import { instantiateScene, serializeProject } from '@protomake/serialization';
import { Rigidbody2D } from '@protomake/physics2d';
describe('Milestone 1 acceptance', () => {
  it('creates a project, scene, entities, components, saves and reopens equivalent data', async () => {
    const editor = new EditorModel();
    editor.newProject('Acceptance');
    editor.createScene('Room');
    const parent = editor.createEntity('Parent'),
      child = editor.createEntity('Child', parent);
    editor.addComponent(NoteComponent.type);
    editor.setProperty(NoteComponent.type, 'text', 'Authored note');
    editor.translate(80, 32);
    const before = serializeProject(editor.project, editor.registry);
    const storage = new ProjectStorage(new IDBFactory());
    await storage.save(editor.project, editor.sceneId);
    editor.markSaved();
    expect(editor.dirty).toBe(false);
    const reopened = new EditorModel();
    const session = await storage.loadSession(editor.project.id);
    reopened.load(session.project);
    reopened.switchScene(session.activeScene!);
    expect(serializeProject(reopened.project, reopened.registry)).toBe(before);
    expect(reopened.world.get(reopened.entity(child)).parent).toBe(
      reopened.entity(parent),
    );
    expect(
      reopened.world.read(reopened.entity(child), NoteComponent)?.text,
    ).toBe('Authored note');
    expect((await storage.list())[0]?.name).toBe('Acceptance');
  });
  it('undoes and redoes entity creation, deletion, properties and parenting', () => {
    const e = new EditorModel(),
      a = e.createEntity('A'),
      b = e.createEntity('B');
    e.reparent(a);
    e.undo();
    expect(e.world.get(e.entity(b)).parent).toBeNull();
    e.redo();
    expect(e.world.get(e.entity(b)).parent).toBe(e.entity(a));
    e.addComponent(NoteComponent.type);
    e.setProperty(NoteComponent.type, 'text', 'hello');
    e.undo();
    expect(e.world.read(e.entity(b), NoteComponent)?.text).toBe('');
    e.redo();
    e.select([a]);
    e.deleteSelection();
    expect([...e.world.all()]).toHaveLength(0);
    e.undo();
    expect([...e.world.all()]).toHaveLength(2);
  });
  it('collapses continuous transforms into one undo, and cancels gestures', () => {
    const e = new EditorModel(),
      id = e.createEntity();
    const original = new Map([[id, e.world.worldMatrix(e.entity(id))]]);
    e.beginGesture();
    for (let i = 0; i < 100; i++) e.transformSelection(compose(i, 0), original);
    e.finishGesture('Move');
    expect(e.world.worldPosition(e.entity(id))).toEqual([99, 0]);
    e.undo();
    expect(e.world.worldPosition(e.entity(id))).toEqual([0, 0]);
    e.redo();
    e.beginGesture();
    e.transformSelection(compose(400, 0), original);
    e.cancelGesture();
    expect(e.world.worldPosition(e.entity(id))).toEqual([99, 0]);
  });
  it('transforms a selected parent and child only once', () => {
    const e = new EditorModel(),
      a = e.createEntity('A'),
      b = e.createEntity('B', a);
    e.select([a, b]);
    e.translate(10, 20);
    expect(e.world.worldPosition(e.entity(b))).toEqual([10, 20]);
  });
  it('duplicates subtrees with new identities and remapped parents', () => {
    const e = new EditorModel(),
      a = e.createEntity('A');
    e.createEntity('B', a);
    e.select([a]);
    e.duplicate();
    expect([...e.world.all()]).toHaveLength(4);
    const copy = [...e.selection][0]!;
    expect(copy).not.toBe(a);
    expect(e.world.children(e.entity(copy))).toHaveLength(1);
    e.undo();
    expect([...e.world.all()]).toHaveLength(2);
  });
  it('copies a child as a root preserving world transform before paste offset', () => {
    const e = new EditorModel(),
      a = e.createEntity();
    e.translate(100, 0);
    const b = e.createEntity('Child', a);
    e.select([b]);
    e.duplicate();
    expect(e.world.worldPosition(e.entity([...e.selection][0]!))).toEqual([
      124, 24,
    ]);
  });
  it('rolls back a partially applied invalid operation', () => {
    const e = new EditorModel(),
      a = e.createEntity('A'),
      b = e.createEntity('B', a);
    e.select([a]);
    expect(() => e.reparent(b)).toThrow(/Cyclic/);
    expect(e.world.get(e.entity(a)).parent).toBeNull();
    expect(e.history.undoLabel).toBe('Create entity');
  });
  it('handles scenes and project metadata through history', () => {
    const e = new EditorModel(),
      first = e.sceneId;
    e.createScene('Other');
    e.createEntity();
    e.duplicateScene();
    expect(e.project.scenes).toHaveLength(3);
    e.renameScene('Copy');
    e.deleteScene();
    expect(e.project.scenes).toHaveLength(2);
    e.undo();
    expect(e.scene.name).toBe('Copy');
    e.switchScene(first);
    expect([...e.world.all()]).toHaveLength(0);
  });
  it('isolates runtime and blocks authoring during play', () => {
    const e = new EditorModel(),
      id = e.createEntity();
    const runtime = instantiateScene(e.scene, e.registry).world;
    e.locked = true;
    expect(() => e.createEntity()).toThrow(/Stop Play/);
    runtime.setLocalMatrix(runtime.find(id)!, compose(99, 44));
    e.locked = false;
    expect(e.world.worldPosition(e.entity(id))).toEqual([0, 0]);
  });
  it('applies safe runtime values while Play locks ordinary authoring', () => {
    const e = new EditorModel(),
      id = e.createEntity();
    e.addComponent(NoteComponent.type);
    e.addComponent(Rigidbody2D.type);
    e.locked = true;
    e.applyRuntimeComponent(id, NoteComponent.type, 'text', 'tuned');
    expect(e.world.read(e.entity(id), NoteComponent)?.text).toBe('tuned');
    expect(() =>
      e.applyRuntimeComponent(id, 'protomake.transform', 'local.4', 10),
    ).toThrow(/Dynamic runtime transforms/);
  });
  it('bounds history and invalidates redo after a new branch', () => {
    const e = new EditorModel();
    for (let i = 0; i < 105; i++) e.createEntity();
    for (let i = 0; i < 100; i++) e.undo();
    expect([...e.world.all()]).toHaveLength(5);
    expect(e.history.undoLabel).toBeUndefined();
    e.createEntity();
    expect(e.history.redoLabel).toBeUndefined();
  });
  it('keeps newer changes dirty when an older save completes', () => {
    const e = new EditorModel(),
      snapshot = structuredClone(e.project);
    e.createEntity();
    e.markSaved(snapshot);
    expect(e.dirty).toBe(true);
  });
  it('persists separate projects and deletes only the requested saved copy', async () => {
    const storage = new ProjectStorage(new IDBFactory()),
      a = new EditorModel(),
      b = new EditorModel();
    await storage.save(a.project);
    await storage.save(b.project);
    await storage.delete(a.project.id);
    expect(await storage.list()).toHaveLength(1);
    await expect(storage.load(a.project.id)).rejects.toThrow();
    expect((await storage.load(b.project.id)).id).toBe(b.project.id);
  });
  it('rejects malformed imports without losing the current world', () => {
    const e = new EditorModel(),
      id = e.createEntity();
    expect(() => e.load({ id: guid() })).toThrow();
    expect(e.world.find(id)).toBeDefined();
  });
  it('rotates around a selected pivot', () => {
    expect(pivotDelta(5, 10, Math.PI / 2)[4]).toBeCloseTo(15);
    expect(getPath({ a: [1, 2] }, 'a.1')).toBe(2);
  });
});
