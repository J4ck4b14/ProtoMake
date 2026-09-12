import { AssetSchema } from '@protomake/assets';
import { guid } from '@protomake/core';
import {
  BehaviourGraphSchema,
  GRAPH_MIME,
  coreNodeRegistry,
  emptyGraph,
  type BehaviourGraph,
  type GraphNode,
} from '@protomake/graphs';
import { EditorModel } from './model';
import { node, button, input } from './dom';

interface View {
  x: number;
  y: number;
  zoom: number;
}

export function createGraphAsset(
  model: EditorModel,
  path = 'Assets/Behaviour.graph',
): string {
  const id = guid(),
    extension = path.endsWith('.graph') ? '.graph' : '',
    base = extension ? path.slice(0, -extension.length) : path;
  let uniquePath = path,
    suffix = 2;
  while (
    model.project.assets.some(
      (asset) => asset.path.toLowerCase() === uniquePath.toLowerCase(),
    )
  )
    uniquePath = `${base} ${suffix++}${extension}`;
  model.change('Create behaviour graph', () => {
    model.project.assets.push(
      AssetSchema.parse({
        id,
        path: uniquePath,
        kind: 'text',
        mime: GRAPH_MIME,
        data: JSON.stringify(emptyGraph(guid())),
        width: 0,
        height: 0,
      }),
    );
  });
  return id;
}

export function editBehaviourGraph(
  model: EditorModel,
  report: (message: string, error?: boolean) => void,
  assetId?: string,
): void {
  const id = assetId ?? createGraphAsset(model),
    asset = model.project.assets.find((candidate) => candidate.id === id);
  if (!asset || asset.mime !== GRAPH_MIME)
    throw new Error('Select a Behaviour Graph asset');
  const view: View = { x: 80, y: 70, zoom: 1 };
  let graph = BehaviourGraphSchema.parse(JSON.parse(asset.data)),
    selected = new Set<string>(),
    connectionStart: { node: string; port: string } | undefined,
    clipboard:
      | { nodes: GraphNode[]; connections: BehaviourGraph['connections'] }
      | undefined,
    history = [JSON.stringify(graph)],
    historyIndex = 0;
  let activeNode: string | undefined,
    activeValues: Readonly<Record<string, unknown>> = {};
  const registry = coreNodeRegistry(),
    dialog = node('dialog', 'graph-dialog'),
    shell = node('div', 'graph-shell'),
    toolbar = node('div', 'graph-toolbar'),
    search = node('input'),
    palette = node('div', 'graph-palette'),
    viewport = node('div', 'graph-viewport'),
    wires = document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    surface = node('div', 'graph-surface'),
    status = node('div', 'graph-status');
  search.type = 'search';
  search.placeholder = 'Search nodes: play audio, spawn prefab, wait…';
  search.setAttribute('aria-label', 'Node search');
  wires.classList.add('graph-wires');
  viewport.append(wires, surface);
  shell.append(toolbar, palette, viewport, status);
  dialog.append(shell);
  document.body.append(dialog);

  const persist = (label: string, remember = true) => {
    graph = BehaviourGraphSchema.parse(graph);
    const diagnostics = registry.validate(graph);
    if (diagnostics.length)
      throw new Error(diagnostics.map((item) => item.message).join('; '));
    const serialized = JSON.stringify(graph);
    if (remember) {
      history = history.slice(0, historyIndex + 1);
      if (history.at(-1) !== serialized) history.push(serialized);
      historyIndex = history.length - 1;
    }
    model.change(label, () => {
      const current = model.project.assets.find(
        (candidate) => candidate.id === id,
      );
      if (!current) throw new Error('Graph asset was removed');
      current.data = serialized;
    });
    render();
  };
  const restore = (next: number) => {
    if (next < 0 || next >= history.length || next === historyIndex) return;
    historyIndex = next;
    graph = BehaviourGraphSchema.parse(JSON.parse(history[next]!));
    persist('Graph undo/redo', false);
  };
  const graphPoint = (event: PointerEvent) => {
    const bounds = viewport.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left - view.x) / view.zoom,
      y: (event.clientY - bounds.top - view.y) / view.zoom,
    };
  };
  const addNode = (type: string, x = 80, y = 80) => {
    const definition = registry.get(type)!;
    graph.nodes.push({
      id: guid(),
      type,
      x,
      y,
      properties: Object.fromEntries(
        (definition.properties ?? []).map((property) => [
          property.id,
          property.default,
        ]),
      ),
    });
    selected = new Set([graph.nodes.at(-1)!.id]);
    persist('Create graph node');
  };
  const removeSelected = () => {
    if (!selected.size) return;
    graph.nodes = graph.nodes.filter((item) => !selected.has(item.id));
    graph.connections = graph.connections.filter(
      (item) => !selected.has(item.from.node) && !selected.has(item.to.node),
    );
    selected.clear();
    persist('Delete graph nodes');
  };
  const duplicateSelected = (offset = 28) => {
    const ids = new Map<string, string>();
    for (const item of graph.nodes)
      if (selected.has(item.id)) ids.set(item.id, guid());
    const nodes = graph.nodes
      .filter((item) => selected.has(item.id))
      .map((item) => ({
        ...structuredClone(item),
        id: ids.get(item.id)!,
        x: item.x + offset,
        y: item.y + offset,
      }));
    const connections = graph.connections
      .filter((item) => ids.has(item.from.node) && ids.has(item.to.node))
      .map((item) => ({
        ...structuredClone(item),
        id: guid(),
        from: { ...item.from, node: ids.get(item.from.node)! },
        to: { ...item.to, node: ids.get(item.to.node)! },
      }));
    graph.nodes.push(...nodes);
    graph.connections.push(...connections);
    selected = new Set(ids.values());
    persist('Duplicate graph nodes');
  };
  const copySelected = () => {
    clipboard = {
      nodes: structuredClone(
        graph.nodes.filter((item) => selected.has(item.id)),
      ),
      connections: structuredClone(
        graph.connections.filter(
          (item) => selected.has(item.from.node) && selected.has(item.to.node),
        ),
      ),
    };
  };
  const pasteClipboard = () => {
    if (!clipboard?.nodes.length) return;
    const ids = new Map(clipboard.nodes.map((item) => [item.id, guid()]));
    graph.nodes.push(
      ...clipboard.nodes.map((item) => ({
        ...structuredClone(item),
        id: ids.get(item.id)!,
        x: item.x + 36,
        y: item.y + 36,
      })),
    );
    graph.connections.push(
      ...clipboard.connections.map((item) => ({
        ...structuredClone(item),
        id: guid(),
        from: { ...item.from, node: ids.get(item.from.node)! },
        to: { ...item.to, node: ids.get(item.to.node)! },
      })),
    );
    selected = new Set(ids.values());
    persist('Paste graph nodes');
  };
  const frameSelected = () => {
    const nodes = graph.nodes.filter((item) =>
      selected.size ? selected.has(item.id) : true,
    );
    if (!nodes.length) return;
    const minX = Math.min(...nodes.map((item) => item.x)),
      minY = Math.min(...nodes.map((item) => item.y)),
      maxX = Math.max(...nodes.map((item) => item.x + 190)),
      maxY = Math.max(...nodes.map((item) => item.y + 120)),
      bounds = viewport.getBoundingClientRect();
    view.zoom = Math.min(
      1.5,
      Math.max(
        0.25,
        Math.min(
          (bounds.width - 100) / (maxX - minX),
          (bounds.height - 100) / (maxY - minY),
        ),
      ),
    );
    view.x = (bounds.width - (minX + maxX) * view.zoom) / 2;
    view.y = (bounds.height - (minY + maxY) * view.zoom) / 2;
    render();
  };
  const renderPalette = () => {
    palette.replaceChildren();
    for (const definition of registry.search(search.value).slice(0, 30))
      palette.append(
        button(`${definition.category} / ${definition.title}`, () => {
          addNode(
            definition.type,
            (-view.x + 120) / view.zoom,
            (-view.y + 120) / view.zoom,
          );
          search.value = '';
          renderPalette();
        }),
      );
    palette.hidden = !search.value;
  };
  const connect = (
    nodeId: string,
    portId: string,
    direction: 'input' | 'output',
  ) => {
    if (direction === 'output') {
      connectionStart = { node: nodeId, port: portId };
      status.textContent = 'Choose an input port';
      return;
    }
    if (!connectionStart) return;
    const previous = graph.connections;
    graph.connections = graph.connections.filter(
      (item) => !(item.to.node === nodeId && item.to.port === portId),
    );
    graph.connections.push({
      id: guid(),
      from: connectionStart,
      to: { node: nodeId, port: portId },
    });
    connectionStart = undefined;
    try {
      persist('Connect graph nodes');
    } catch (error) {
      graph.connections = previous;
      report(String(error), true);
      render();
    }
  };
  const render = () => {
    surface.replaceChildren();
    surface.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
    wires.replaceChildren();
    wires.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
    for (const group of graph.groups) {
      const region = node('section', 'graph-group'),
        title = input('Comment', group.title);
      region.style.left = `${group.x}px`;
      region.style.top = `${group.y}px`;
      region.style.width = `${group.width}px`;
      region.style.height = `${group.height}px`;
      region.style.borderColor = group.color;
      title.input.onchange = () => {
        group.title = title.input.value;
        persist('Edit graph comment');
      };
      region.append(title.row);
      surface.append(region);
    }
    for (const item of graph.nodes) {
      const definition = registry.get(item.type)!,
        card = node('article', 'graph-node'),
        heading = node('header', '', definition.title),
        body = node('div', 'graph-node-body');
      card.dataset.node = item.id;
      card.style.left = `${item.x}px`;
      card.style.top = `${item.y}px`;
      card.classList.toggle('selected', selected.has(item.id));
      card.classList.toggle('active', activeNode === item.id);
      heading.onpointerdown = (event) => {
        event.stopPropagation();
        const start = graphPoint(event),
          originals = new Map(
            graph.nodes
              .filter((candidate) => selected.has(candidate.id))
              .map((candidate) => [
                candidate.id,
                [candidate.x, candidate.y] as const,
              ]),
          );
        if (!selected.has(item.id)) {
          selected = new Set(
            event.shiftKey ? [...selected, item.id] : [item.id],
          );
          originals.clear();
          originals.set(item.id, [item.x, item.y]);
          render();
        }
        const move = (next: PointerEvent) => {
          const point = graphPoint(next);
          for (const [nodeId, original] of originals) {
            const target = graph.nodes.find(
              (candidate) => candidate.id === nodeId,
            )!;
            target.x = original[0] + point.x - start.x;
            target.y = original[1] + point.y - start.y;
          }
          render();
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          persist('Move graph nodes');
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up, { once: true });
      };
      card.onclick = (event) => {
        event.stopPropagation();
        if (event.shiftKey) {
          if (selected.has(item.id)) selected.delete(item.id);
          else selected.add(item.id);
        } else selected = new Set([item.id]);
        render();
      };
      for (const port of definition.ports) {
        const row = node('div', `graph-port ${port.direction}`),
          socket = button(
            '',
            () => connect(item.id, port.id, port.direction),
            `${port.direction} ${port.type} port`,
          );
        socket.className = `graph-socket ${port.type}`;
        socket.dataset.port = port.id;
        row.append(socket, node('span', '', port.label));
        body.append(row);
      }
      for (const property of definition.properties ?? []) {
        const value = item.properties[property.id] ?? property.default,
          control = input(
            property.label,
            String(value),
            property.type === 'number'
              ? 'number'
              : property.type === 'boolean'
                ? 'checkbox'
                : 'text',
          );
        if (property.type === 'boolean') control.input.checked = Boolean(value);
        control.input.onchange = () => {
          const previous = item.properties[property.id];
          item.properties[property.id] =
            property.type === 'number'
              ? control.input.valueAsNumber
              : property.type === 'boolean'
                ? control.input.checked
                : control.input.value;
          try {
            persist('Edit graph property');
          } catch (error) {
            if (previous === undefined) delete item.properties[property.id];
            else item.properties[property.id] = previous;
            report(String(error), true);
            render();
          }
        };
        body.append(control.row);
      }
      card.append(heading, body);
      surface.append(card);
    }
    for (const connection of graph.connections) {
      const fromNode = graph.nodes.find(
          (item) => item.id === connection.from.node,
        ),
        toNode = graph.nodes.find((item) => item.id === connection.to.node);
      if (!fromNode || !toNode) continue;
      const path = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'path',
        ),
        x1 = fromNode.x + 190,
        y1 = fromNode.y + 54,
        x2 = toNode.x,
        y2 = toNode.y + 54,
        bend = Math.max(50, Math.abs(x2 - x1) / 2);
      path.setAttribute(
        'd',
        `M${x1} ${y1} C${x1 + bend} ${y1},${x2 - bend} ${y2},${x2} ${y2}`,
      );
      path.dataset.connection = connection.id;
      path.onclick = () => {
        graph.connections = graph.connections.filter(
          (item) => item.id !== connection.id,
        );
        persist('Remove graph connection');
      };
      wires.append(path);
    }
    status.textContent = activeNode
      ? `Running ${activeNode} · ${JSON.stringify(activeValues)}`
      : `${graph.nodes.length} nodes · ${graph.connections.length} connections · zoom ${Math.round(view.zoom * 100)}%`;
  };

  toolbar.append(
    node('strong', '', asset.path),
    search,
    button('Undo', () => restore(historyIndex - 1)),
    button('Redo', () => restore(historyIndex + 1)),
    button('Duplicate', () => duplicateSelected()),
    button('Copy', copySelected),
    button('Paste', pasteClipboard),
    button('Delete', removeSelected),
    button('+ Comment group', () => {
      graph.groups.push({
        id: guid(),
        title: 'Comment',
        x: 40,
        y: 40,
        width: 360,
        height: 220,
        color: '#495d70',
      });
      persist('Add graph comment');
    }),
    button('Frame selected', frameSelected),
    button('Close', () => dialog.close()),
  );
  search.oninput = renderPalette;
  viewport.onwheel = (event) => {
    event.preventDefault();
    if (event.ctrlKey)
      view.zoom = Math.min(
        2.5,
        Math.max(0.2, view.zoom * (event.deltaY > 0 ? 0.9 : 1.1)),
      );
    else {
      view.x -= event.deltaX;
      view.y -= event.deltaY;
    }
    render();
  };
  viewport.onpointerdown = (event) => {
    if (event.target !== viewport && event.target !== wires) return;
    selected.clear();
    if (event.shiftKey) {
      const origin = graphPoint(event),
        box = node('div', 'graph-selection-box');
      surface.append(box);
      const move = (next: PointerEvent) => {
        const point = graphPoint(next),
          left = Math.min(origin.x, point.x),
          top = Math.min(origin.y, point.y),
          right = Math.max(origin.x, point.x),
          bottom = Math.max(origin.y, point.y);
        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${right - left}px`;
        box.style.height = `${bottom - top}px`;
        selected = new Set(
          graph.nodes
            .filter(
              (item) =>
                item.x + 190 >= left &&
                item.x <= right &&
                item.y + 120 >= top &&
                item.y <= bottom,
            )
            .map((item) => item.id),
        );
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        render();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up, { once: true });
      return;
    }
    const start = {
      x: event.clientX,
      y: event.clientY,
      viewX: view.x,
      viewY: view.y,
    };
    const move = (next: PointerEvent) => {
      view.x = start.viewX + next.clientX - start.x;
      view.y = start.viewY + next.clientY - start.y;
      render();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    render();
  };
  dialog.onkeydown = (event) => {
    if (event.key === 'Delete' && document.activeElement?.tagName !== 'INPUT')
      removeSelected();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      restore(historyIndex + (event.shiftKey ? 1 : -1));
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      duplicateSelected();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      copySelected();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      pasteClipboard();
    }
  };
  dialog.onclose = () => {
    window.removeEventListener('protomake-graph-trace', onTrace);
    dialog.remove();
    report(`Saved ${asset.path}`);
  };
  const onTrace = (event: Event) => {
    const trace = (
      event as CustomEvent<{
        graph?: string;
        node?: string;
        values?: Readonly<Record<string, unknown>>;
      }>
    ).detail;
    if (trace?.graph !== graph.id || !trace.node) return;
    activeNode = trace.node;
    activeValues = trace.values ?? {};
    render();
  };
  window.addEventListener('protomake-graph-trace', onTrace);
  renderPalette();
  render();
  dialog.showModal();
  search.focus();
}
