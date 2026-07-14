export function SummaryCard({
  label,
  value,
  detail = '',
  tone = 'default',
}) {
  return (
    <article className={`summary-card summary-card--${tone}`}>
      <span className="summary-card__label">{label}</span>
      <strong className="summary-card__value">{value}</strong>
      {detail ? <span className="summary-card__detail">{detail}</span> : null}
    </article>
  );
}
