export function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}
export function button(
  label: string,
  action: () => void,
  title = label,
): HTMLButtonElement {
  const element = node('button', '', label);
  element.type = 'button';
  element.title = title;
  element.addEventListener('click', action);
  return element;
}
export function input(
  label: string,
  value: string,
  type = 'text',
): { row: HTMLLabelElement; input: HTMLInputElement } {
  const row = node('label', 'field'),
    caption = node('span', '', label),
    control = node('input');
  control.type = type;
  control.value = value;
  control.setAttribute('aria-label', label);
  row.append(caption, control);
  return { row, input: control };
}
export function ask(title: string, initial = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const dialog = node('dialog'),
      form = node('form'),
      heading = node('h2', '', title),
      field = input(title, initial),
      actions = node('div', 'actions'),
      cancel = button('Cancel', () => dialog.close()),
      submit = node('button', '', 'Create');
    submit.type = 'submit';
    actions.append(cancel, submit);
    form.append(heading, field.row, actions);
    dialog.append(form);
    document.body.append(dialog);
    let answer: string | null = null;
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!field.input.value.trim()) return;
      answer = field.input.value.trim();
      dialog.close();
    };
    dialog.onclose = () => {
      dialog.remove();
      resolve(answer);
    };
    dialog.showModal();
    field.input.focus();
    field.input.select();
  });
}
