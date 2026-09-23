export function newGuidedItem() {
  return { key: crypto.randomUUID(), title: '', scope: '', financialLineId: '', materials: '', labor: '', equipment: '', schedule: '', access: '', clarifications: '', materialAmount: '', laborAmount: '', equipmentAmount: '', subcontractAmount: '', otherAmount: '', markupAmount: '', addressed: {} };
}

export function newGuidedChangeOrder() {
  return { workflow: 'change_order', version: 1, coNumber: `DRAFT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`, title: '', scope: '', internalNotes: '', currentSection: 'overall', selectedItem: 0, readyForReview: false, items: [newGuidedItem()] };
}

const AMOUNTS = ['materialAmount', 'laborAmount', 'equipmentAmount', 'subcontractAmount', 'otherAmount', 'markupAmount'];

export function guidedMissing(state) {
  const missing = [];
  if (!state.coNumber?.trim() || state.coNumber.startsWith('DRAFT-')) missing.push('Choose the final Change Order number.');
  if (!state.title?.trim()) missing.push('Name the overall change.');
  if (!state.scope?.trim()) missing.push('Describe what changed.');
  if (!state.items?.length) missing.push('Add at least one line item.');
  (state.items || []).forEach((item, index) => {
    const label = `Line ${index + 1}`;
    if (!item.title?.trim() || !item.scope?.trim()) missing.push(`${label}: add a title and scope.`);
    for (const [section, amount] of [['Materials', 'materialAmount'], ['Labor', 'laborAmount'], ['Equipment', 'equipmentAmount']]) {
      if (!item.addressed?.[section.toLowerCase()] && String(item[amount] ?? '').trim() === '') missing.push(`${label}: address ${section.toLowerCase()} or mark it not applicable.`);
    }
  });
  return missing;
}

export function guidedDraftLines(state) {
  return (state.items || []).filter((item) => item.title?.trim() || item.scope?.trim() || AMOUNTS.some((key) => String(item[key] ?? '').trim())).map((item, index) => {
    const details = [item.title?.trim() || `Line ${index + 1}`, item.scope?.trim(), item.schedule?.trim() && `Schedule: ${item.schedule.trim()}`, item.access?.trim() && `Access/shutdown: ${item.access.trim()}`, item.clarifications?.trim() && `Clarifications: ${item.clarifications.trim()}`].filter(Boolean);
    return {
      job_budget_line_id: item.financialLineId || null,
      description: details.join('\n'),
      material_amount: Number(item.materialAmount || 0),
      labor_amount: Number(item.laborAmount || 0),
      equipment_amount: Number(item.equipmentAmount || 0),
      subcontract_amount: Number(item.subcontractAmount || 0),
      other_amount: Number(item.otherAmount || 0),
      markup_amount: Number(item.markupAmount || 0),
      sort_order: index,
    };
  });
}

export function guidedInternalNotes(state) {
  const itemNotes = (state.items || []).flatMap((item, index) => [
    item.materials?.trim() && `Line ${index + 1} materials: ${item.materials.trim()}`,
    item.labor?.trim() && `Line ${index + 1} labor: ${item.labor.trim()}`,
    item.equipment?.trim() && `Line ${index + 1} equipment: ${item.equipment.trim()}`,
  ].filter(Boolean));
  return [state.internalNotes?.trim(), itemNotes.length && `Guided working notes\n${itemNotes.join('\n')}`].filter(Boolean).join('\n\n');
}
