import {
  scriptLexemes,
  type ScriptLexeme,
} from '@protomake/scripting/compiler';
import { node } from './dom';
import { SCRIPT_CONTEXT_API, type ScriptApiEntry } from './scripting-api';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );

function tokenClass(kind: ScriptLexeme['kind']): string {
  return kind === 'plain' ? '' : `tok-${kind}`;
}

export function highlightTypeScript(source: string): string {
  const html = scriptLexemes(source)
    .map(({ text, kind }) => {
      const cls = tokenClass(kind);
      return cls ? `<span class="${cls}">${escape(text)}</span>` : escape(text);
    })
    .join('');
  // A trailing newline keeps the overlay height aligned with textarea scrolling.
  return html + (source.endsWith('\n') ? ' ' : '');
}

export class ScriptCodeEditor {
  readonly host = node('div', 'code-editor');
  readonly textarea = node('textarea', 'code-input');
  private readonly gutter = node('pre', 'code-gutter');
  private readonly highlight = node('pre', 'code-highlight');
  private readonly viewport = node('div', 'code-viewport');
  private readonly autocomplete = node('div', 'code-autocomplete');
  private suggestions: ScriptApiEntry[] = [];
  private suggestionIndex = 0;
  private inputListeners = new Set<() => void>();

  constructor(source = '') {
    this.textarea.spellcheck = false;
    this.textarea.wrap = 'off';
    this.textarea.setAttribute('aria-label', 'Script source');
    this.autocomplete.hidden = true;
    this.viewport.append(this.highlight, this.textarea, this.autocomplete);
    this.host.append(this.gutter, this.viewport);
    this.textarea.value = source;
    this.textarea.addEventListener('input', () => {
      this.refresh();
      this.updateAutocomplete();
      for (const listener of this.inputListeners) listener();
    });
    this.textarea.addEventListener('scroll', () => this.syncScroll());
    this.textarea.addEventListener('click', () => this.updateAutocomplete());
    this.textarea.addEventListener('keyup', () => this.updateAutocomplete());
    this.textarea.addEventListener('keydown', (event) => this.keydown(event));
    this.refresh();
  }

  get value(): string {
    return this.textarea.value;
  }
  set value(value: string) {
    this.textarea.value = value;
    this.refresh();
    this.hideAutocomplete();
  }
  get selectionStart(): number {
    return this.textarea.selectionStart;
  }
  get selectionEnd(): number {
    return this.textarea.selectionEnd;
  }
  focus(): void {
    this.textarea.focus();
  }
  onInput(listener: () => void): () => void {
    this.inputListeners.add(listener);
    return () => this.inputListeners.delete(listener);
  }

  setRangeText(
    replacement: string,
    start: number,
    end: number,
    mode: SelectionMode = 'end',
  ): void {
    this.textarea.setRangeText(replacement, start, end, mode);
    this.refresh();
  }

  jumpTo(line: number, column = 1): void {
    const lines = this.value.split('\n');
    let offset = 0;
    for (let i = 0; i < Math.max(0, line - 1); i++)
      offset += (lines[i]?.length ?? 0) + 1;
    offset += Math.max(0, Math.min(lines[line - 1]?.length ?? 0, column - 1));
    this.textarea.focus();
    this.textarea.setSelectionRange(offset, offset);
    const lineHeight =
      Number.parseFloat(getComputedStyle(this.textarea).lineHeight) || 20;
    this.textarea.scrollTop = Math.max(0, (line - 3) * lineHeight);
    this.syncScroll();
  }

  showApi(prefix = ''): void {
    const query = prefix.toLowerCase();
    this.suggestions = SCRIPT_CONTEXT_API.filter(
      (entry) =>
        !query ||
        entry.name.toLowerCase().includes(query) ||
        entry.signature.toLowerCase().includes(query),
    ).slice(0, 12);
    this.suggestionIndex = 0;
    this.renderAutocomplete(false);
  }

  private refresh(): void {
    this.highlight.innerHTML = highlightTypeScript(this.value);
    const count = Math.max(1, this.value.split('\n').length);
    this.gutter.textContent = Array.from({ length: count }, (_, index) =>
      String(index + 1),
    ).join('\n');
    this.syncScroll();
  }

  private syncScroll(): void {
    this.highlight.style.transform = `translate(${-this.textarea.scrollLeft}px, ${-this.textarea.scrollTop}px)`;
    this.gutter.style.transform = `translateY(${-this.textarea.scrollTop}px)`;
  }

  private completionContext(): { start: number; prefix: string } | undefined {
    const cursor = this.textarea.selectionStart,
      before = this.value.slice(0, cursor),
      match = /ctx\.([A-Za-z0-9_.]*)$/.exec(before);
    return match
      ? { start: cursor - match[1]!.length, prefix: match[1]! }
      : undefined;
  }

  private updateAutocomplete(): void {
    const context = this.completionContext();
    if (!context) return this.hideAutocomplete();
    const prefix = context.prefix.toLowerCase();
    this.suggestions = SCRIPT_CONTEXT_API.filter((entry) =>
      entry.name.toLowerCase().startsWith(prefix),
    ).slice(0, 10);
    this.suggestionIndex = 0;
    this.renderAutocomplete(true);
  }

  private renderAutocomplete(insertable: boolean): void {
    this.autocomplete.replaceChildren();
    if (!this.suggestions.length) return this.hideAutocomplete();
    this.autocomplete.hidden = false;
    this.suggestions.forEach((entry, index) => {
      const row = node(
        'button',
        index === this.suggestionIndex ? 'selected' : '',
      );
      row.type = 'button';
      row.innerHTML = `<strong>${escape(entry.signature)}</strong><span>${escape(entry.description)}</span>`;
      row.onmousedown = (event) => event.preventDefault();
      row.onclick = () =>
        insertable ? this.acceptSuggestion(index) : undefined;
      row.title = entry.description;
      this.autocomplete.append(row);
    });
  }

  private acceptSuggestion(index = this.suggestionIndex): void {
    const entry = this.suggestions[index],
      context = this.completionContext();
    if (!entry || !context) return;
    const cursor = this.textarea.selectionStart,
      insertion = entry.name;
    this.textarea.setRangeText(insertion, context.start, cursor, 'end');
    this.refresh();
    this.hideAutocomplete();
    for (const listener of this.inputListeners) listener();
  }

  private hideAutocomplete(): void {
    this.autocomplete.hidden = true;
    this.autocomplete.replaceChildren();
    this.suggestions = [];
  }

  private keydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
      event.preventDefault();
      const context = this.completionContext();
      this.showApi(context?.prefix ?? '');
      return;
    }
    if (!this.autocomplete.hidden && this.suggestions.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        this.suggestionIndex =
          (this.suggestionIndex + direction + this.suggestions.length) %
          this.suggestions.length;
        this.renderAutocomplete(!!this.completionContext());
        return;
      }
      if (event.key === 'Enter' && this.completionContext()) {
        event.preventDefault();
        this.acceptSuggestion();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.hideAutocomplete();
        return;
      }
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      const start = this.textarea.selectionStart,
        end = this.textarea.selectionEnd;
      this.textarea.setRangeText('  ', start, end, 'end');
      this.refresh();
      for (const listener of this.inputListeners) listener();
    }
  }
}
