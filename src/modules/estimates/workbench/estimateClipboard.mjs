const copy = value => structuredClone(value);

function renewWorkItem(item, idFactory) {
  const next = copy(item);
  next.id = idFactory();
  delete next.libraryId;
  delete next.updatedAt;
  const componentIds = new Map((next.components || []).map(component => [component.id, idFactory()]));
  if (next.components) next.components = next.components.map(component => ({ ...component, id: componentIds.get(component.id) }));
  next.lines = (next.lines || []).map(line => ({
    ...line,
    id: idFactory(),
    libraryLineId: null,
    ...(line.componentId ? { componentId: componentIds.get(line.componentId) } : {}),
  }));
  return next;
}

export function clipboardItem(type, value, label) {
  if (!['entry', 'workItem', 'component'].includes(type)) throw new Error('Unsupported estimate clipboard item.');
  return { id: crypto.randomUUID(), type, label, value: copy(value) };
}

export function pasteEntry(value, entries, idFactory = crypto.randomUUID.bind(crypto)) {
  const next = copy(value);
  next.id = idFactory();
  next.number = Math.max(0, ...entries.map(entry => Number(entry.number) || 0)) + 1;
  next.items = (next.items || []).map(item => renewWorkItem(item, idFactory));
  return next;
}

export function pasteWorkItem(value, items, idFactory = crypto.randomUUID.bind(crypto)) {
  const next = renewWorkItem(value, idFactory);
  next.number = Math.max(0, ...items.map(item => Number(item.number) || 0)) + 1;
  next.status = 'Not started';
  return next;
}

export function pasteComponent(value, workItem, idFactory = crypto.randomUUID.bind(crypto)) {
  const existing = copy(workItem);
  if (!existing.components) {
    existing.components = (existing.lines || []).map(line => ({ id: `component-${line.id}`, name: line.name || 'Component' }));
    existing.lines = (existing.lines || []).map(line => ({ ...line, componentId: `component-${line.id}` }));
  }
  const componentId = idFactory();
  const component = { ...copy(value.component), id: componentId };
  const lines = (value.lines || []).map(line => ({ ...copy(line), id: idFactory(), componentId, libraryLineId: null }));
  return { ...existing, components: [...existing.components, component], lines: [...existing.lines, ...lines] };
}

export function clipboardAssembly(item, name) {
  if (item.type === 'workItem') return { ...copy(item.value), name };
  if (item.type === 'component') return { id: crypto.randomUUID(), name, qty: 1, kind: 'Assembly', status: 'Not started', notes: '', components: [{ ...copy(item.value.component), id: item.value.component.id }], lines: copy(item.value.lines) };
  return null;
}
