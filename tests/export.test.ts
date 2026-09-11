import { it, expect } from 'vitest';
import { projectBuildFiles, zipFiles } from '../packages/editor/src/build-game';
import { EditorModel } from '../packages/editor/src/model';
import { guid } from '@protomake/core';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Parse ProtoMake's deliberately store-only ZIP format without any platform tool. */
function readStoredZip(data: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength),
    decode = new TextDecoder(),
    files = new Map<string, Uint8Array>();
  let cursor = 0;
  while (
    cursor + 4 <= data.length &&
    view.getUint32(cursor, true) === 0x04034b50
  ) {
    if (cursor + 30 > data.length)
      throw new Error('Truncated ZIP local header');
    const flags = view.getUint16(cursor + 6, true),
      compression = view.getUint16(cursor + 8, true),
      expectedCrc = view.getUint32(cursor + 14, true),
      compressedSize = view.getUint32(cursor + 18, true),
      uncompressedSize = view.getUint32(cursor + 22, true),
      nameLength = view.getUint16(cursor + 26, true),
      extraLength = view.getUint16(cursor + 28, true),
      nameStart = cursor + 30,
      payloadStart = nameStart + nameLength + extraLength,
      payloadEnd = payloadStart + compressedSize;
    if ((flags & 0x800) === 0) throw new Error('ZIP filename is not UTF-8');
    if (compression !== 0 || compressedSize !== uncompressedSize)
      throw new Error('ProtoMake export must use stored ZIP entries');
    if (payloadEnd > data.length) throw new Error('Truncated ZIP payload');
    const name = decode.decode(
        data.subarray(nameStart, nameStart + nameLength),
      ),
      payload = data.slice(payloadStart, payloadEnd);
    if (files.has(name)) throw new Error('Duplicate ZIP entry');
    if (crc32(payload) !== expectedCrc) throw new Error('ZIP CRC mismatch');
    files.set(name, payload);
    cursor = payloadEnd;
  }
  const directoryOffset = cursor;
  let directoryEntries = 0;
  while (
    cursor + 4 <= data.length &&
    view.getUint32(cursor, true) === 0x02014b50
  ) {
    if (cursor + 46 > data.length)
      throw new Error('Truncated ZIP directory entry');
    const nameLength = view.getUint16(cursor + 28, true),
      extraLength = view.getUint16(cursor + 30, true),
      commentLength = view.getUint16(cursor + 32, true);
    cursor += 46 + nameLength + extraLength + commentLength;
    directoryEntries++;
  }
  if (
    cursor + 22 !== data.length ||
    view.getUint32(cursor, true) !== 0x06054b50
  )
    throw new Error('Invalid ZIP end record');
  if (
    view.getUint16(cursor + 8, true) !== files.size ||
    view.getUint16(cursor + 10, true) !== files.size
  )
    throw new Error('ZIP entry count mismatch');
  if (view.getUint32(cursor + 12, true) !== cursor - directoryOffset)
    throw new Error('ZIP directory size mismatch');
  if (view.getUint32(cursor + 16, true) !== directoryOffset)
    throw new Error('ZIP directory offset mismatch');
  if (directoryEntries !== files.size)
    throw new Error('ZIP directory count mismatch');
  return files;
}

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
it('produces a portable valid ZIP, preserves bytes and rejects traversal', () => {
  const files = [
      {
        path: 'index.html',
        data: new TextEncoder().encode('<main>hello</main>'),
      },
      { path: 'assets/ñ.bin', data: new Uint8Array([0, 1, 255, 33]) },
    ],
    archive = readStoredZip(zipFiles(files));
  expect(new TextDecoder().decode(archive.get('index.html'))).toBe(
    '<main>hello</main>',
  );
  expect([...archive.get('assets/ñ.bin')!]).toEqual([0, 1, 255, 33]);
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
