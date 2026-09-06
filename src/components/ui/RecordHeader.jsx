import { useDiagnostics } from './Diagnostics.jsx';

export function RecordHeader({
  eyebrow,
  title,
  description,
  meta = [],
  actions = null,
  descriptionIsDiagnostic = false,
}) {
  const diagnostics = useDiagnostics();
  return (
    <section className="record-header">
      <div className="record-header__main">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h3>{title}</h3>
        {description && (!descriptionIsDiagnostic || diagnostics) ? <p>{description}</p> : null}
      </div>
      <div className="record-header__aside">
        {meta.length ? (
          <div className="record-header__facts">
            {meta.map((item) => (
              <div className="record-header__fact" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
        {actions ? <div className="record-header__actions">{actions}</div> : null}
      </div>
    </section>
  );
}
