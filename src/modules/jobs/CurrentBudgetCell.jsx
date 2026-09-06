import { Pencil, RotateCcw } from 'lucide-react';
import { calculatedCurrentBudget, effectiveCurrentBudget, hasCurrentBudgetOverride } from './currentBudget.js';

const money = (value) => Number(value).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export function CurrentBudgetCell({ line, changeOrders = 0, editing, value, onChange, onEdit, disabled }) {
  const calculated = calculatedCurrentBudget(line, changeOrders);
  const manual = editing ? value !== '' : hasCurrentBudgetOverride(line);
  return <div className="current-budget-cell">
    {editing ? <div className="current-budget-cell__controls">
      <input aria-label={`Current budget for ${line.description}`} type="number" min="0" step="0.01"
        value={value} placeholder={String(calculated)} disabled={disabled}
        onChange={(event) => onChange(event.target.value)} />
      <button type="button" className="icon-button" title="Use calculated budget" aria-label="Use calculated budget"
        disabled={disabled || !manual} onClick={() => onChange('')}><RotateCcw aria-hidden="true" /></button>
    </div> : <div className="current-budget-cell__controls">
      <strong>{money(effectiveCurrentBudget(line, changeOrders))}</strong>
      {onEdit ? <button type="button" className="icon-button" title="Edit current budget" aria-label={`Edit current budget for ${line.description}`}
        disabled={disabled} onClick={onEdit}><Pencil aria-hidden="true" /></button> : null}
    </div>}
    <small className={manual ? 'current-budget-cell__manual' : ''}>{manual ? 'Manual override' : 'Calculated'}</small>
    {manual ? <small>Calculated: {money(calculated)}</small> : null}
  </div>;
}
