import { PanelRightClose, X } from 'lucide-react';

export function SecondarySidebar({
  eyebrow,
  title,
  description,
  mobileOpen = false,
  onCloseMobile,
  onCloseDesktop,
  children,
}) {
  return (
    <>
      <button
        type="button"
        className={`workspace-sidebar-scrim workspace-sidebar-scrim--secondary${mobileOpen ? ' is-open' : ''}`}
        aria-hidden={!mobileOpen}
        tabIndex={mobileOpen ? 0 : -1}
        onClick={onCloseMobile}
      />
      <aside
        className={[
          'workspace-sidebar',
          'workspace-sidebar--secondary',
          mobileOpen ? 'is-open' : '',
        ].filter(Boolean).join(' ')}
        aria-label={title}
      >
        <div className="workspace-sidebar__header">
          <div className="workspace-sidebar__heading">
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <div className="workspace-sidebar__header-actions">
            {onCloseDesktop ? (
              <button
                type="button"
                className="workspace-sidebar__icon-button workspace-sidebar__collapse-toggle"
                onClick={onCloseDesktop}
                aria-label="Hide context panel"
              >
                <PanelRightClose aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              className="workspace-sidebar__icon-button workspace-sidebar__close-button"
              onClick={onCloseMobile}
              aria-label="Close context panel"
            >
              <X aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="workspace-sidebar__body">{children}</div>
      </aside>
    </>
  );
}
