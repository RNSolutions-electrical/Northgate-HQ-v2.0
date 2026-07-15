export function StatePanel({
  eyebrow,
  title,
  description,
  tone = 'neutral',
  actions = null,
  children = null,
  compact = false,
}) {
  return (
    <section className={`state-panel state-panel--${tone}${compact ? ' state-panel--compact' : ''}`}>
      <div className="state-panel__copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
        {children}
      </div>
      {actions ? <div className="state-panel__actions">{actions}</div> : null}
    </section>
  );
}
