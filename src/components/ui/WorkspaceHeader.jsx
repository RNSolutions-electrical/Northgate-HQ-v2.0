export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  status,
  actions,
}) {
  return (
    <div className="workspace-header">
      <div className="workspace-header__copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="workspace-header__actions">
        {status ? <div className="workspace-header__status">{status}</div> : null}
        {actions}
      </div>
    </div>
  );
}
