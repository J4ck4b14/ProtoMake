import { node, button, input } from './dom';
export function editData(
  title: string,
  path: string,
  data: unknown,
  save: (path: string, data: unknown) => void,
): void {
  const dialog = node('dialog', 'script-editor'),
    field = input('Asset path', path),
    text = node('textarea'),
    error = node('p', 'error');
  text.rows = 24;
  text.spellcheck = false;
  text.value = JSON.stringify(data, null, 2);
  text.setAttribute('aria-label', title + ' data');
  dialog.append(
    node('h2', '', title),
    field.row,
    text,
    error,
    button('Save data', () => {
      try {
        save(field.input.value, JSON.parse(text.value));
        dialog.close();
      } catch (e) {
        error.textContent = String(e);
      }
    }),
    button('Cancel', () => dialog.close()),
  );
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}
