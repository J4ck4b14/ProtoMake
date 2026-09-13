import { GRAPH_MIME } from '@protomake/graphs';
import {
  createExportManifest,
  serializeInterchange,
  serializeReport,
  TARGET_COORDINATES,
  type ProtoMakeInterchange,
} from './index';
import {
  decodeAssetData,
  encodeText,
  generatedAssetPath,
  sortedFiles,
  type ExportFile,
} from './files';
import {
  UNITY_GRAPH_RUNTIME,
  UNITY_IDENTITY,
  UNITY_IMPORTER,
} from './unity-code';

const json = (value: unknown): string => JSON.stringify(value, null, 2);

function packageManifest(): string {
  return json({
    dependencies: {
      'com.unity.inputsystem': '1.7.0',
      'com.unity.nuget.newtonsoft-json': '3.2.1',
      'com.unity.modules.audio': '1.0.0',
      'com.unity.modules.imageconversion': '1.0.0',
      'com.unity.modules.jsonserialize': '1.0.0',
      'com.unity.modules.physics2d': '1.0.0',
    },
  });
}

function coordinateCode(): string {
  const profile = TARGET_COORDINATES.unity;
  return `using UnityEngine;

namespace ProtoMake.Generated
{
    public static class ProtoMakeCoordinates
    {
        public const float UnitsPerPixel = ${profile.unitsPerPixel}f;
        public const float PixelsPerUnit = ${1 / profile.unitsPerPixel}f;
        public const float YSign = ${profile.invertY ? -1 : 1}f;
        public const float RotationSign = ${profile.rotationSign}f;
        public static float X(float pixels) { return pixels * UnitsPerPixel; }
        public static float Y(float pixels) { return pixels * UnitsPerPixel * YSign; }
        public static float Length(float pixels) { return pixels * UnitsPerPixel; }
        public static float PixelsX(float units) { return units * PixelsPerUnit; }
        public static float PixelsY(float units) { return units * PixelsPerUnit * YSign; }
        public static float Degrees(float radians) { return radians * Mathf.Rad2Deg * RotationSign; }
    }
}
`;
}

function readme(interchange: ProtoMakeInterchange): string {
  const report = createExportManifest(interchange, 'unity').report;
  return `# ${interchange.source.name} — Unity export

Open this directory as a Unity 2022.3 LTS or newer project. Unity compiles the scripts and the supported Editor importer reconstructs scenes, input actions and component assets from ProtoMake Interchange IR. You can also run **Tools → ProtoMake → Reimport**.

Generated target assets live in \`Assets/Generated/ProtoMake\`. Keep custom Unity work outside that directory because reimport replaces generated assets. ProtoMake remains the source of truth; this is a one-way export, not a round trip.

Review \`Assets/Generated/ProtoMake/Data/portability-report.json\` before shipping:

- Fully portable: ${report.summary['fully-portable']}
- Approximated: ${report.summary.approximated}
- Manual work: ${report.summary['manual-work']}
- Unsupported: ${report.summary.unsupported}
`;
}

export function exportUnity(interchange: ProtoMakeInterchange): ExportFile[] {
  const manifest = createExportManifest(interchange, 'unity'),
    files: ExportFile[] = [
      { path: 'Packages/manifest.json', data: encodeText(packageManifest()) },
      {
        path: 'ProjectSettings/ProjectVersion.txt',
        data: encodeText('m_EditorVersion: 2022.3.0f1\n'),
      },
      { path: 'README_IMPORT.md', data: encodeText(readme(interchange)) },
      {
        path: 'Assets/ProtoMake/Editor/ProtoMakeImporter.cs',
        data: encodeText(UNITY_IMPORTER),
      },
      {
        path: 'Assets/ProtoMake/Runtime/ProtoMakeIdentity.cs',
        data: encodeText(UNITY_IDENTITY),
      },
      {
        path: 'Assets/ProtoMake/Runtime/ProtoMakeCoordinates.cs',
        data: encodeText(coordinateCode()),
      },
      {
        path: 'Assets/ProtoMake/Runtime/ProtoMakeGraphBehaviour.cs',
        data: encodeText(UNITY_GRAPH_RUNTIME),
      },
      {
        path: 'Assets/Generated/ProtoMake/Data/protomake-ir.json',
        data: encodeText(serializeInterchange(interchange)),
      },
      {
        path: 'Assets/Generated/ProtoMake/Data/export-manifest.json',
        data: encodeText(json(manifest)),
      },
      {
        path: 'Assets/Generated/ProtoMake/Data/portability-report.json',
        data: encodeText(serializeReport(manifest.report)),
      },
    ];
  for (const asset of interchange.assets) {
    if (asset.kind === 'image' || asset.kind === 'audio')
      files.push({
        path: `Assets/${generatedAssetPath(asset)}`,
        data: decodeAssetData(asset),
      });
    if (asset.mime === GRAPH_MIME)
      files.push({
        path: `Assets/Generated/ProtoMake/Data/graphs/${asset.id}.json`,
        data: encodeText(asset.data),
      });
  }
  return sortedFiles(files);
}
