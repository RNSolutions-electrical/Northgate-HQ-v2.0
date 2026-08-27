import { Bell, Menu, Search, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TopNavigation } from './TopNavigation.jsx';

export function AppShell({
  eyebrow,
  title,
  buildLabel,
  navItems,
  activeWorkspace,
  onOpenWorkspace,
  identitySummary,
  feedbackControl,
  developerToggle,
  profileControl,
  children,
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeWorkspace]);

  return (
    <main className="ng-shell">
      <header className="ng-shell__header">
        <div className="ng-shell__header-inner">
          <div className="ng-shell__brand">
            <button
              type="button"
              className="ng-shell__menu-button"
              onClick={() => setMobileNavOpen((current) => !current)}
              aria-expanded={mobileNavOpen}
              aria-controls="northgate-top-nav"
              aria-label="Toggle workspace navigation"
            >
              <Menu aria-hidden="true" />
            </button>
            <div className="ng-shell__brand-mark" aria-hidden="true">
              <span>N</span>
            </div>
            <div className="ng-shell__brand-copy">
              <h1 className="ng-shell__title">{title}</h1>
              <p className="build-note">{eyebrow || buildLabel}</p>
            </div>
          </div>

          <TopNavigation
            items={navItems}
            activeKey={activeWorkspace}
            onSelect={onOpenWorkspace}
            mobileOpen={mobileNavOpen}
            onCloseMobile={() => setMobileNavOpen(false)}
            id="northgate-top-nav"
          />

          <div className="ng-shell__actions">
            {feedbackControl}
            <button type="button" className="ng-shell__notice-button" aria-label="Search">
              <Search aria-hidden="true" />
            </button>
            {identitySummary ? (
              <div className="ng-shell__identity" aria-label="Current user access summary">
                <strong>{identitySummary.role}</strong>
                <span>{identitySummary.division}</span>
              </div>
            ) : null}
            <button type="button" className="ng-shell__notice-button" aria-label="Notifications">
              <Bell aria-hidden="true" />
            </button>
            {developerToggle}
            <div className="ng-shell__profile">{profileControl}</div>
          </div>
        </div>
      </header>

      <div className="ng-shell__body">
        <aside className="ng-shell__rail" aria-label="Workspace context">
          <div className="ng-shell__rail-heading">
            <span className="ng-shell__rail-icon" aria-hidden="true">
              <Sparkles />
            </span>
            <div>
              <p className="eyebrow">Workspace</p>
              <h2>{navItems.find((item) => item.key === activeWorkspace)?.label ?? 'Dashboard'}</h2>
            </div>
          </div>
          <nav className="ng-shell__rail-nav" aria-label="Workspace shortcuts">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.key === activeWorkspace;

              return (
                <button
                  key={item.key}
                  type="button"
                  className="ng-shell__rail-link"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onOpenWorkspace(item.key)}
                >
                  {Icon ? <Icon aria-hidden="true" /> : null}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="ng-shell__rail-note">
            <strong>Northgate HQ</strong>
            <span>Operations rebuild · {buildLabel}</span>
          </div>
        </aside>

        <div className="ng-shell__content">{children}</div>
      </div>
    </main>
  );
}
