import { guid } from '@protomake/core';
import {
  compileScript,
  compileProjectScripts,
  scriptDiagnostics,
} from '@protomake/scripting/compiler';
import { ScriptBehaviour } from '@protomake/scripting';
import type { EditorModel } from './model';
import { node, button, input } from './dom';
import { ScriptCodeEditor } from './code-editor';
import { SCRIPT_CONTEXT_API } from './scripting-api';

const templates = {
  Behaviour: `import type { ScriptContext } from '@protomake/scripting';

export const fields = {
  speed: {
    type: 'number', default: 1, min: 0, max: 20, step: 0.1,
    label: 'Speed', help: 'Author-facing script properties appear automatically in the Inspector.',
  },
} as const;

export default class Behaviour {
  speed = 1;

  start(ctx: ScriptContext) {
    ctx.log('Behaviour started');
  }

  update(ctx: ScriptContext) {
    // Frame-rate independent behaviour belongs here.
  }
}
`,
  Trigger: `import type { ScriptContext } from '@protomake/scripting';
import type { ContactEvent } from '@protomake/physics2d/rapier';

export const fields = {
  message: { type: 'string', default: 'Triggered', label: 'Message' },
} as const;

export default class Trigger {
  message = 'Triggered';

  onTriggerEnter(ctx: ScriptContext, event: ContactEvent) {
    ctx.log(\`${'${this.message}'} by ${'${event.a === ctx.entity ? event.b : event.a}'}\`);
  }
}
`,
  'Character Controller': `import type { ScriptContext } from '@protomake/scripting';

export const fields = {
  speed: { type: 'number', default: 220, min: 0, max: 1000, step: 10, label: 'Move speed' },
} as const;

export default class CharacterController {
  speed = 220;

  update(ctx: ScriptContext) {
    const [x, y] = ctx.input.getVector('Move');
    const [px, py] = ctx.position();
    ctx.setPosition(px + x * this.speed * ctx.delta, py + y * this.speed * ctx.delta);
  }
}
`,
  Interaction: `import type { ScriptContext } from '@protomake/scripting';

export const fields = {
  target: { type: 'entity', default: '', label: 'Target entity', help: 'Entity references are remapped when prefabs/duplicates are created.' },
} as const;

export default class Interaction {
  target = '';

  update(ctx: ScriptContext) {
    if (!ctx.input.wasPressed('Interact')) return;
    ctx.log(this.target ? \`Interacted with ${'${this.target}'}\` : 'Interact pressed');
  }
}
`,
  'UI Controller': `import type { ScriptContext } from '@protomake/scripting';

export const fields = {
  indicator: { type: 'entity', default: '', label: 'Indicator entity' },
  threshold: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.05, label: 'Light threshold' },
} as const;

type SpriteData = { visible: boolean; [key: string]: unknown };

export default class UIController {
  indicator = '';
  threshold = 0.5;

  update(ctx: ScriptContext) {
    if (!this.indicator) return;
    const sprite = ctx.get<SpriteData>('protomake.sprite', this.indicator);
    if (sprite) ctx.set('protomake.sprite', { ...sprite, visible: ctx.illumination() >= this.threshold }, this.indicator);
  }
}
`,
  'Stealth Guard': `import type { ScriptContext } from '@protomake/scripting';

export const fields = {
  player: { type: 'entity', default: '', label: 'Player' },
  detectionLight: { type: 'number', default: 0.6, min: 0, max: 1, step: 0.05, label: 'Detection light' },
  detectionTime: { type: 'number', default: 1, min: 0.05, max: 10, step: 0.05, label: 'Detection time' },
  viewRange: { type: 'number', default: 450, min: 0, max: 2000, step: 10, label: 'View range' },
  viewAngle: { type: 'number', default: 90, min: 1, max: 360, step: 1, label: 'View angle' },
} as const;

export default class StealthGuard {
  player = '';
  detectionLight = 0.6;
  detectionTime = 1;
  viewRange = 450;
  viewAngle = 90;
  private alert = 0;

  update(ctx: ScriptContext) {
    if (!this.player) return;
    const exposed = ctx.canSee(this.player, this.viewRange, this.viewAngle) &&
      ctx.illumination(this.player) >= this.detectionLight;
    this.alert = Math.max(0, Math.min(1, this.alert + (exposed ? 1 : -1) * ctx.delta / this.detectionTime));
    if (this.alert >= 1) ctx.log('Player detected');
  }
}
`,
} as const;

type TemplateName = keyof typeof templates;

interface Draft {
  path: string;
  source: string;
  updated: number;
}
export interface ScriptOpenLocation {
  line?: number;
  column?: number;
}

const draftPrefix = 'protomake.scriptDraft.v2.';

export function showScripts(
  model: EditorModel,
  report: (message: string, error?: boolean) => void,
  initialAsset?: string,
  location: ScriptOpenLocation = {},
): void {
  if (model.locked) {
    report('Stop Play Mode before editing scripts.', true);
    return;
  }
  const dialog = node('dialog', 'script-editor'),
    title = node('h2', '', 'Project TypeScript'),
    select = node('select'),
    templateSelect = node('select'),
    name = input('Script path', 'Assets/Scripts/Behaviour.ts'),
    code = new ScriptCodeEditor(templates.Behaviour),
    draftStatus = node('p', 'draft-status'),
    diagnosticList = node('div', 'script-diagnostics'),
    apiPanel = node('aside', 'script-api'),
    apiSearch = input('Search API', ''),
    apiResults = node('div', 'api-results'),
    actions = node('div', 'actions');
  select.setAttribute('aria-label', 'Project script');
  select.append(new Option('New script', ''));
  for (const asset of model.project.assets)
    if (asset.mime === 'text/typescript') select.append(new Option(asset.path, asset.id));
  templateSelect.setAttribute('aria-label', 'Script template');
  for (const template of Object.keys(templates) as TemplateName[])
    templateSelect.append(new Option(template, template));

  let currentId = '', loadedPath = name.input.value, loadedSource = code.value;

  const draftKey = (id = currentId) => `${draftPrefix}${model.project.id}.${id || 'new'}`;
  const readDraft = (id: string): Draft | undefined => {
    try {
      const value = JSON.parse(localStorage.getItem(draftKey(id)) ?? 'null') as Draft | null;
      return value && typeof value.path === 'string' && typeof value.source === 'string' ? value : undefined;
    } catch { return undefined; }
  };
  const saveDraft = () => {
    if (name.input.value === loadedPath && code.value === loadedSource) return;
    try {
      localStorage.setItem(
        draftKey(),
        JSON.stringify({ path: name.input.value, source: code.value, updated: Date.now() } satisfies Draft),
      );
      draftStatus.textContent = 'Local draft protected';
    } catch {
      draftStatus.textContent = 'Draft storage unavailable — use Save script before closing';
    }
  };
  const clearDraft = (id = currentId) => {
    try { localStorage.removeItem(draftKey(id)); } catch { /* optional storage */ }
  };

  const renderApi = () => {
    const query = apiSearch.input.value.trim().toLowerCase();
    apiResults.replaceChildren();
    for (const entry of SCRIPT_CONTEXT_API.filter((item) =>
      !query || item.name.toLowerCase().includes(query) || item.signature.toLowerCase().includes(query) || item.description.toLowerCase().includes(query),
    )) {
      const row = button(entry.signature, () => {
        const cursor = code.selectionStart;
        code.setRangeText(entry.signature.replace(/^ctx\./, ''), cursor, code.selectionEnd, 'end');
        code.focus();
        saveDraft();
      });
      row.title = entry.description;
      row.append(node('small', '', entry.description));
      apiResults.append(row);
    }
  };
  apiSearch.input.oninput = renderApi;
  apiPanel.append(node('h3', '', 'ProtoMake scripting API'), apiSearch.row, apiResults);
  renderApi();

  const showDiagnostics = () => {
    diagnosticList.replaceChildren();
    const diagnostics = scriptDiagnostics(code.value, name.input.value);
    if (!diagnostics.length) {
      diagnosticList.append(node('p', 'ok', 'Syntax diagnostics: no errors.'));
      return diagnostics;
    }
    for (const diagnostic of diagnostics) {
      const row = button(
        `Line ${diagnostic.line}:${diagnostic.column} · ${diagnostic.message}`,
        () => code.jumpTo(diagnostic.line, diagnostic.column),
      );
      row.classList.add('error');
      diagnosticList.append(row);
    }
    return diagnostics;
  };

  const load = (id: string) => {
    currentId = id;
    const asset = model.project.assets.find((a) => a.id === id), draft = readDraft(id);
    name.input.value = draft?.path ?? asset?.path ?? 'Assets/Scripts/Behaviour.ts';
    code.value = draft?.source ?? asset?.data ?? templates.Behaviour;
    loadedPath = asset?.path ?? name.input.value;
    loadedSource = asset?.data ?? (draft ? '' : templates.Behaviour);
    draftStatus.textContent = draft
      ? `Restored protected draft from ${new Date(draft.updated).toLocaleString()}`
      : '';
    showDiagnostics();
    if (id === initialAsset && location.line) requestAnimationFrame(() => code.jumpTo(location.line!, location.column));
  };
  select.onchange = () => load(select.value);
  templateSelect.onchange = () => {
    if (currentId && !confirm('Replace the current editor contents with this template?')) return;
    const selected = templateSelect.value as TemplateName;
    code.value = templates[selected];
    if (!currentId) name.input.value = `Assets/Scripts/${selected.replace(/\s+/g, '')}.ts`;
    showDiagnostics();
    saveDraft();
  };
  code.onInput(() => {
    saveDraft();
    showDiagnostics();
  });
  name.input.addEventListener('input', () => { saveDraft(); showDiagnostics(); });

  const check = () => {
    const result = compileScript(code.value, name.input.value);
    diagnosticList.replaceChildren(
      node('p', 'ok', `Compilation passed · exposed fields: ${Object.keys(result.fields).join(', ') || 'none'} · Ctrl/Cmd+Space opens ctx autocomplete.`),
    );
    return result;
  };
  const saveButton = button('Save script · Ctrl/Cmd+S', () => {
    try {
      check();
      let saved = '';
      model.change('Save script', () => {
        const id = currentId || guid(),
          asset = {
            id,
            path: name.input.value,
            kind: 'text' as const,
            mime: 'text/typescript' as const,
            data: code.value,
            width: 0,
            height: 0,
          },
          index = model.project.assets.findIndex((item) => item.id === id);
        if (index < 0) model.project.assets.push(asset);
        else model.project.assets[index] = asset;
        compileProjectScripts(model.project.assets);
        saved = id;
      });
      clearDraft(currentId);
      currentId = saved;
      clearDraft(saved);
      loadedPath = name.input.value;
      loadedSource = code.value;
      draftStatus.textContent = 'Saved to project';
      const existing = [...select.options].find((option) => option.value === saved);
      if (!existing) select.append(new Option(name.input.value, saved));
      else existing.text = name.input.value;
      select.value = saved;
      report(`Saved and compiled ${name.input.value}`);
    } catch (error) {
      showDiagnostics();
      report(String(error), true);
    }
  });
  code.textarea.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveButton.click();
    }
  });

  actions.append(
    button('Compile', () => {
      try { check(); } catch (error) { showDiagnostics(); report(String(error), true); }
    }),
    button('API · Ctrl/Cmd+Space', () => { code.showApi(); code.focus(); }),
    saveButton,
    button('Attach to selection', () => {
      try {
        if (!currentId) throw new Error('Save the script first');
        if (!model.selection.size) throw new Error('Select at least one entity first');
        model.change('Attach script', () => {
          for (const id of model.selection) {
            const entity = model.entity(id), value = { script: currentId, values: {} };
            if (model.world.components(entity).has(ScriptBehaviour.type))
              model.world.set(entity, ScriptBehaviour.type, value);
            else model.world.add(entity, ScriptBehaviour.type, value);
          }
        });
        report('Script attached. Exposed properties are now in the Inspector.');
      } catch (error) { report(String(error), true); }
    }),
    button('Close', () => { saveDraft(); dialog.close(); }),
  );

  const top = node('div', 'script-topbar');
  top.append(select, templateSelect, name.row);
  const body = node('div', 'script-workspace');
  body.append(code.host, apiPanel);
  dialog.append(
    title,
    node('p', 'script-help', 'TypeScript is a first-class project asset. The editor provides syntax colour, line numbers, live diagnostics, jump-to-error, ctx autocomplete, API search and protected drafts.'),
    top,
    body,
    draftStatus,
    diagnosticList,
    actions,
  );
  dialog.onclose = () => { saveDraft(); dialog.remove(); };
  document.body.append(dialog);
  if (initialAsset && [...select.options].some((option) => option.value === initialAsset))
    select.value = initialAsset;
  load(select.value);
  dialog.showModal();
  code.focus();
}
