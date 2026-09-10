import type { AnimatorController } from '@protomake/animation';
import { node, button } from './dom';
/** Automatic graph layout is derived from state order, never hidden asset metadata. */
export function animatorGraph(
  host: HTMLElement,
  c: AnimatorController,
  selected: string,
  select: (name: string) => void,
  transition: (index: number) => void,
  connect: (from: string, to: string) => void,
): void {
  const section = node('section', 'animator-graph');
  section.append(
    node('h3', '', 'State graph'),
    node(
      'p',
      '',
      'Select a state to edit it. Use Connect to add a transition; select an arrow label to edit its conditions.',
    ),
  );
  const nodes = node('div', 'graph-states');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const height = Math.max(1, Math.ceil(c.states.length / 3)) * 120;
  svg.setAttribute('viewBox', `0 0 660 ${height}`);
  svg.setAttribute('aria-hidden', 'true');
  nodes.style.height = `${height}px`;
  nodes.append(svg);
  for (const t of c.transitions) {
    const a = c.states.findIndex((s) => s.name === t.from),
      b = c.states.findIndex((s) => s.name === t.to);
    if (a < 0 || b < 0) continue;
    const x1 = (a % 3) * 220 + 100,
      y1 = Math.floor(a / 3) * 120 + 72;
    const x2 = (b % 3) * 220 + 100,
      y2 = Math.floor(b / 3) * 120 + 8;
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute(
      'd',
      `M ${x1} ${y1} C ${x1 + 70} ${y1 + 40}, ${x2 - 70} ${y2 - 30}, ${x2} ${y2} l -5 -8 m 5 8 l 5 -8`,
    );
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#f3ac66');
    path.setAttribute('stroke-width', '2');
    svg.append(path);
  }
  for (const state of c.states) {
    const card = node('div', 'graph-state');
    const index = c.states.indexOf(state);
    card.style.left = `${(index % 3) * 220 + 10}px`;
    card.style.top = `${Math.floor(index / 3) * 120 + 10}px`;
    if (state.name === selected) card.classList.add('selected');
    card.append(
      button(`${c.initial === state.name ? '● ' : ''}${state.name}`, () =>
        select(state.name),
      ),
    );
    if (selected && selected !== state.name)
      card.append(
        button(`Connect ${selected} → ${state.name}`, () =>
          connect(selected, state.name),
        ),
      );
    nodes.append(card);
  }
  const edges = node('div', 'graph-edges');
  for (const [i, t] of c.transitions.entries()) {
    const conditions =
      t.conditions
        .map((v) => `${v.parameter} ${v.operator} ${v.value}`)
        .join(' AND ') || 'Always';
    edges.append(
      button(
        `${i + 1}. ${t.from === '*' ? 'Any state' : t.from} → ${t.to} · ${conditions}${t.exitTime === null ? '' : ` · exit ${t.exitTime}`}`,
        () => transition(i),
      ),
    );
  }
  section.append(nodes, edges);
  host.append(section);
}
