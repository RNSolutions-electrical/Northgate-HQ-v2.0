import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';

export function PrimarySidebar({
  eyebrow,
  title,
  description,
  items,
  activeKey,
  onSelect,
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  onCloseMobile,
  footer,
}) {
  return (
    <>
      <button
        type="button"
        className={`workspace-sidebar-scrim${mobileOpen ? ' is-open' : ''}`}
        aria-hidden={!mobileOpen}
        tabIndex={mobileOpen ? 0 : -1}
        onClick={onCloseMobile}
      />
      <aside
        className={[
          'workspace-sidebar',
          'workspace-sidebar--primary',
          collapsed ? 'is-collapsed' : '',
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
            {onToggleCollapse ? (
              <button
                type="button"
                className="workspace-sidebar__icon-button workspace-sidebar__collapse-toggle"
                onClick={onToggleCollapse}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
              </button>
            ) : null}
            <button
              type="button"
              className="workspace-sidebar__icon-button workspace-sidebar__close-button"
              onClick={onCloseMobile}
              aria-label="Close sidebar"
            >
              <X aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="workspace-sidebar__nav">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === activeKey;

            return (
              <button
                key={item.key}
                type="button"
                className="workspace-sidebar__item"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  onSelect(item.key);
                  onCloseMobile?.();
                }}
                title={collapsed ? item.label : undefined}
              >
                <span className="workspace-sidebar__item-icon">
                  {Icon ? <Icon aria-hidden="true" /> : null}
                </span>
                <span className="workspace-sidebar__item-copy">
                  <strong>{item.label}</strong>
                  {item.description ? <small>{item.description}</small> : null}
                </span>
                {item.badge != null ? (
                  <span className="workspace-sidebar__item-badge">{item.badge}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        {footer ? <div className="workspace-sidebar__footer">{footer}</div> : null}
      </aside>
    </>
  );
}
