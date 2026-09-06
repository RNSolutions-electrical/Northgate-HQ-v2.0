import { uiElementAttributes } from '../../config/uiTerminology.js';
import { useDiagnostics } from './Diagnostics.jsx';

export function SummaryCard({
  label,
  value,
  detail = '',
  tone = 'default',
  incomplete = null,
  developmentOnly = false,
  detailIsDiagnostic = false,
}) {
  const diagnostics = useDiagnostics();
  const isIncomplete = incomplete ?? hasIncompleteSignal([label, value, detail]);
  if (developmentOnly && !diagnostics) return null;

  return (
    <article className={`summary-card summary-card--${tone}${isIncomplete ? ' ng-incomplete-component' : ''}${developmentOnly ? ' ng-development-component' : ''}`} {...uiElementAttributes('CARD', label || 'Summary')}>
      <span className="summary-card__label">{label}</span>
      <strong className="summary-card__value">{value}</strong>
      {detail && (!detailIsDiagnostic || diagnostics) ? <span className="summary-card__detail">{detail}</span> : null}
    </article>
  );
}

function hasIncompleteSignal(values) {
  const text = values.filter(Boolean).join(' ').toLowerCase();
  if (!text) return false;

  return [
    'reserved',
    'deferred',
    'awaiting',
    'pending source',
    'not connected',
    'not wired',
    'not added',
    'future',
  ].some((signal) => text.includes(signal));
}
