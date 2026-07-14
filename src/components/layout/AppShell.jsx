import { Bell, Menu } from 'lucide-react';
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
              NG
            </div>
            <div className="ng-shell__brand-copy">
              <p className="eyebrow">{eyebrow}</p>
              <h1 className="ng-shell__title">{title}</h1>
              <p className="build-note">{buildLabel}</p>
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

      <div className="ng-shell__content">{children}</div>
    </main>
  );
}
