import { uiElementAttributes } from '../../config/uiTerminology.js';
import { useDiagnostics } from './Diagnostics.jsx';

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  status,
  actions,
  descriptionIsDiagnostic = true,
  statusIsDiagnostic = false,
}) {
  const diagnostics = useDiagnostics();
  return (
    <div className="workspace-header" {...uiElementAttributes('MODULE', title || 'Workspace Header')}>
      <div className="workspace-header__copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description && (!descriptionIsDiagnostic || diagnostics) ? <p>{description}</p> : null}
      </div>
      <div className="workspace-header__actions">
        {status && (!statusIsDiagnostic || diagnostics) ? <div className="workspace-header__status">{status}</div> : null}
        {actions}
      </div>
    </div>
  );
}
