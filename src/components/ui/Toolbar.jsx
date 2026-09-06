/**
 * Workspace toolbar built on the existing `.module-toolbar` class.
 *
 * Three near-duplicate toolbars shipped independently — `.module-toolbar`,
 * `.inventory-workspace__toolbar`, and `.jobs-directory-toolbar`. This is the
 * shared shape; the module-specific ones can be retired as their modules are
 * extracted.
 *
 * `search` and `filters` are slots rather than props with behavior, because
 * filter semantics are module-specific and division scope must be applied in
 * the query, never in a client-side filter (Section 17a).
 */
import { useDiagnostics } from './Diagnostics.jsx';

export function Toolbar({
  eyebrow,
  title,
  description,
  search = null,
  filters = null,
  meta = [],
  actions = null,
  dense = false,
  descriptionIsDiagnostic = false,
}) {
  const diagnostics = useDiagnostics();
  if (descriptionIsDiagnostic && !diagnostics) description = null;
  const hasCopy = Boolean(eyebrow || title || description);
  const hasControls = Boolean(search || filters || meta.length);

  return (
    <div className={`module-toolbar${dense ? ' module-toolbar--dense' : ''}`}>
      {hasCopy || hasControls ? (
        <div className="module-toolbar__main">
          {hasCopy ? (
            <div className="module-toolbar__copy">
              {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
              {title ? <h3>{title}</h3> : null}
              {description ? <p>{description}</p> : null}
            </div>
          ) : null}

          {hasControls ? (
            <div className="module-toolbar__controls">
              {search ? <div className="module-toolbar__search">{search}</div> : null}
              {filters ? <div className="module-toolbar__filters">{filters}</div> : null}
              {meta.length ? (
                <div className="module-toolbar__meta">
                  {meta.map((item) => (
                    <span className="module-toolbar__meta-item" key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {actions ? <div className="module-toolbar__actions">{actions}</div> : null}
    </div>
  );
}
