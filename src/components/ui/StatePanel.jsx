export function StatePanel({
  eyebrow,
  title,
  description,
  tone = 'neutral',
  actions = null,
  children = null,
  compact = false,
  incomplete = null,
  developmentOnly = null,
}) {
  const isIncomplete = incomplete ?? hasIncompleteSignal([eyebrow, title, description]);
  const isDevelopmentOnly = developmentOnly ?? hasDevelopmentSignal([eyebrow, title, description]);

  return (
    <section className={`state-panel state-panel--${tone}${compact ? ' state-panel--compact' : ''}${isIncomplete ? ' ng-incomplete-component' : ''}${isDevelopmentOnly ? ' ng-development-component' : ''}`}>
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

function hasDevelopmentSignal(values) {
  const text = values.filter(Boolean).join(' ').toLowerCase();
  if (!text) return false;

  return [
    'boundary',
    'foundation only',
    'implementation guidance',
    'structurally ready',
    'read model pending',
    'developer scope',
    'not in this pass',
  ].some((signal) => text.includes(signal));
}

function hasIncompleteSignal(values) {
  const text = values.filter(Boolean).join(' ').toLowerCase();
  if (!text) return false;

  return [
    'deferred',
    'reserved',
    'future',
    'not wired',
    'not implemented',
    'not enabled yet',
    'not connected',
    'not added',
    'not in this pass',
    'remain owner-scoped',
    'remain reserved',
    'remains reserved',
    'remain deferred',
    'remains deferred',
    'remain future',
    'remains future',
    'placeholder',
    'unavailable yet',
  ].some((signal) => text.includes(signal));
}
