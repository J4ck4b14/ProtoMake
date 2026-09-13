import type { InterchangeAsset } from './index';

export interface ExportFile {
  readonly path: string;
  readonly data: Uint8Array;
}

export const encodeText = (value: string): Uint8Array =>
  new TextEncoder().encode(value);

export function decodeAssetData(asset: InterchangeAsset): Uint8Array {
  const match = /^data:([^;,]+);base64,(.*)$/.exec(asset.data);
  if (!match) return encodeText(asset.data);
  if (match[1] !== asset.mime)
    throw new Error(`Asset MIME mismatch: ${asset.path}`);
  const binary = atob(match[2]!);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function safeFileName(value: string): string {
  const result = value
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return result || 'ProtoMake';
}

export function assetExtension(asset: InterchangeAsset): string {
  const byMime: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'audio/wav': '.wav',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'text/plain': '.txt',
    'application/json': '.json',
    'text/typescript': '.ts',
  };
  return byMime[asset.mime] ?? '.json';
}

export function generatedAssetPath(asset: InterchangeAsset): string {
  return `Generated/ProtoMake/Assets/${asset.id}${assetExtension(asset)}`;
}

export function sortedFiles(files: readonly ExportFile[]): ExportFile[] {
  const result = [...files].sort((a, b) => a.path.localeCompare(b.path)),
    seen = new Set<string>();
  for (const file of result) {
    if (
      !file.path ||
      file.path.startsWith('/') ||
      file.path.includes('\\') ||
      file.path
        .split('/')
        .some((part) => !part || part === '.' || part === '..') ||
      seen.has(file.path)
    )
      throw new Error(`Unsafe or duplicate export path: ${file.path}`);
    seen.add(file.path);
  }
  return result;
}
