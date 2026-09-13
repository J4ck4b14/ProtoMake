import {
  analyzePortability,
  lowerProject,
  serializeInterchange,
  serializeReport,
} from '@protomake/interchange';
import type { EditorModel } from './model';
import { button, node } from './dom';
import { zipFiles } from './build-game';

function download(name: string, data: string): void {
  const url = URL.createObjectURL(
      new Blob([data], { type: 'application/json' }),
    ),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadArchive(name: string, data: Uint8Array): void {
  const url = URL.createObjectURL(
      new Blob([data as Uint8Array<ArrayBuffer>], {
        type: 'application/zip',
      }),
    ),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function showPortability(model: EditorModel): void {
  const interchange = lowerProject(model.project),
    reports = (['godot', 'unity', 'unreal'] as const).map((target) =>
      analyzePortability(interchange, target),
    ),
    dialog = node('dialog', 'portability-dialog'),
    actions = node('div', 'actions');
  dialog.append(
    node('h2', '', 'Portability analysis'),
    node(
      'p',
      '',
      'ProtoMake remains the source of truth. Reports classify every lowered item before one-way target export.',
    ),
  );
  for (const report of reports) {
    const section = node('section'),
      summary = report.summary;
    section.append(
      node('h3', '', report.target.toUpperCase()),
      node(
        'p',
        'portability-summary',
        `${report.entities} entities · ${summary['fully-portable']} fully portable · ${summary.approximated} approximated · ${summary['manual-work']} manual · ${summary.unsupported} unsupported`,
      ),
    );
    const exceptions = report.items.filter(
      (item) => item.status !== 'fully-portable',
    );
    if (exceptions.length) {
      const details = node('details');
      details.append(
        node('summary', '', `${exceptions.length} fidelity notes`),
      );
      for (const item of exceptions)
        details.append(
          node(
            'p',
            `portability-${item.status}`,
            `${item.status} · ${item.path} · ${item.feature} · ${item.reason}`,
          ),
        );
      section.append(details);
    }
    section.append(
      button(`Download ${report.target} report`, () =>
        download(
          `${model.project.name.replace(/[^a-z0-9_-]/gi, '_')}-${report.target}-portability.json`,
          serializeReport(report),
        ),
      ),
    );
    if (report.target === 'godot')
      section.append(
        button('Export Godot project', async () => {
          const { exportGodot } = await import('@protomake/interchange/godot');
          downloadArchive(
            `${model.project.name.replace(/[^a-z0-9_-]/gi, '_')}-godot.zip`,
            zipFiles(exportGodot(interchange)),
          );
        }),
      );
    if (report.target === 'unity')
      section.append(
        button('Export Unity project', async () => {
          const { exportUnity } = await import('@protomake/interchange/unity');
          downloadArchive(
            `${model.project.name.replace(/[^a-z0-9_-]/gi, '_')}-unity.zip`,
            zipFiles(exportUnity(interchange)),
          );
        }),
      );
    if (report.target === 'unreal')
      section.append(
        button('Export Unreal project', async () => {
          const { exportUnreal } = await import('@protomake/interchange/unreal');
          downloadArchive(
            `${model.project.name.replace(/[^a-z0-9_-]/gi, '_')}-unreal.zip`,
            zipFiles(exportUnreal(interchange)),
          );
        }),
      );
    dialog.append(section);
  }
  actions.append(
    button('Download Interchange IR', () =>
      download(
        `${model.project.name.replace(/[^a-z0-9_-]/gi, '_')}.protomake-ir.json`,
        serializeInterchange(interchange),
      ),
    ),
    button('Close', () => dialog.close()),
  );
  dialog.append(actions);
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}
