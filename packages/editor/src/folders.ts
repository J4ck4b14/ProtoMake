import { AssetSchema } from '@protomake/assets';
import { compileProjectScripts } from '@protomake/scripting/compiler';
import type { EditorModel } from './model';
export function folders(model: EditorModel): string[] {
  const all = new Set(model.project.folders);
  for (const path of [...all, ...model.project.assets.map((a) => a.path)]) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) all.add(parts.slice(0, i).join('/'));
  }
  return [...all].sort((a, b) => a.localeCompare(b));
}
export function createFolder(model: EditorModel, path: string): void {
  model.change('Create folder', () => {
    if (folders(model).some((p) => p.toLowerCase() === path.toLowerCase()))
      throw new Error('Folder already exists');
    model.project.folders.push(path);
  });
}
export function moveFolder(model: EditorModel, from: string, to: string): void {
  if (to === from) return;
  model.change('Move folder', () => {
    if (
      !to ||
      to.startsWith(from + '/') ||
      folders(model).some((p) => p.toLowerCase() === to.toLowerCase())
    )
      throw new Error('Invalid folder destination');
    const change = (p: string) =>
      p === from || p.startsWith(from + '/') ? to + p.slice(from.length) : p;
    model.project.folders = folders(model).map(change);
    for (const asset of model.project.assets)
      asset.path = AssetSchema.parse({
        ...asset,
        path: change(asset.path),
      }).path;
    for (const [id, path] of Object.entries(model.project.sceneFolders))
      model.project.sceneFolders[id] = change(path);
    compileProjectScripts(model.project.assets);
  });
}
export function deleteFolder(model: EditorModel, path: string): void {
  model.change('Delete empty folder', () => {
    if (
      model.project.assets.some((a) => a.path.startsWith(path + '/')) ||
      Object.values(model.project.sceneFolders).some(
        (p) => p === path || p.startsWith(path + '/'),
      ) ||
      folders(model).some((p) => p.startsWith(path + '/'))
    )
      throw new Error(
        'Move folder contents first; only empty folders can be deleted',
      );
    model.project.folders = model.project.folders.filter((p) => p !== path);
  });
}
