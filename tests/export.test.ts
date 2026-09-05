import { it, expect } from 'vitest';
import { projectBuildFiles, zipFiles } from '../packages/editor/src/build-game';
import { EditorModel } from '../packages/editor/src/model';
import { guid } from '@protomake/core';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
it('exports linked JS modules, a startup scene and a dependency report without shipping TS source', async () => {
  const m = new EditorModel(),
    helper = guid(),
    script = guid();
  m.createEntity('Game');
  m.change('Scripts', () => {
    m.project.assets.push(
      {
        id: helper,
        path: 'Assets/helper.ts',
        mime: 'text/typescript',
        kind: 'text',
        data: 'export const amount:number=7;',
        width: 0,
        height: 0,
      },
      {
        id: script,
        path: 'Assets/main.ts',
        mime: 'text/typescript',
        kind: 'text',
        data: 'import {amount} from "./helper";export default class Behaviour {value=amount;}',
        width: 0,
        height: 0,
      },
    );
  });
  const files = projectBuildFiles(m.project);
  const source = new TextDecoder().decode(
    files.find((f) => f.path === `scripts/${script}.js`)!.data,
  );
  expect(source).toContain(`./${helper}.js`);
  const project = JSON.parse(
    new TextDecoder().decode(
      files.find((f) => f.path === 'project.protomake.json')!.data,
    ),
  );
  expect(project.startupScene).toBe(m.sceneId);
  expect(project.assets.every((a: { data: string }) => a.data === '')).toBe(
    true,
  );
  expect(m.project.assets[0]!.data).toContain('amount');
  const dir = await mkdtemp(join(tmpdir(), 'protomake-export-'));
  try {
    await writeFile(join(dir, 'package.json'), '{"type":"module"}');
    for (const file of files.filter((f) => f.path.endsWith('.js')))
      await writeFile(join(dir, file.path.split('/').at(-1)!), file.data);
    const module = await import(
      /* @vite-ignore */ pathToFileURL(join(dir, `${script}.js`)).href
    );
    expect(new module.default().value).toBe(7);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it('produces a ZIP accepted by Python, preserves bytes and rejects traversal', async () => {
  const files = [
    {
      path: 'index.html',
      data: new TextEncoder().encode('<main>hello</main>'),
    },
    { path: 'assets/ñ.bin', data: new Uint8Array([0, 1, 255, 33]) },
  ];
  const dir = await mkdtemp(join(tmpdir(), 'protomake-zip-'));
  try {
    const path = join(dir, 'game.zip');
    await writeFile(path, zipFiles(files));
    const out = execFileSync(
      'python3',
      [
        '-c',
        'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;assert z.read("assets/ñ.bin")==bytes([0,1,255,33]);print("verified")',
        path,
      ],
      { encoding: 'utf8' },
    );
    expect(out.trim()).toBe('verified');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  expect(() =>
    zipFiles([{ path: '../escape', data: new Uint8Array() }]),
  ).toThrow();
});
it('blocks invalid project references and compilation faults before creating export files', () => {
  const m = new EditorModel();
  const bad = structuredClone(m.project);
  bad.startupScene = null;
  expect(() => projectBuildFiles(bad)).toThrow('startup');
  m.project.assets.push({
    id: guid(),
    path: 'Assets/broken.ts',
    kind: 'text',
    mime: 'text/typescript',
    data: 'export default class {',
    width: 0,
    height: 0,
  });
  expect(() => projectBuildFiles(m.project)).toThrow('broken.ts');
});
