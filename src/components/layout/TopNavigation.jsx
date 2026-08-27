import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

export function TopNavigation({
  items,
  activeKey,
  onSelect,
  id,
  mobileOpen = false,
  onCloseMobile,
}) {
  const [openGroup, setOpenGroup] = useState(null);

  return (
    <>
      <button
        type="button"
        className={`top-nav-scrim${mobileOpen ? ' is-open' : ''}`}
        aria-hidden={!mobileOpen}
        tabIndex={mobileOpen ? 0 : -1}
        onClick={onCloseMobile}
      />
      <nav
        id={id}
        className={`top-nav${mobileOpen ? ' is-open' : ''}`}
        aria-label="Primary workspace navigation"
      >
        {items.map((item) => {
          const Icon = item.icon;
          const isGroup = Array.isArray(item.items);
          const isActive = activeKey === item.key || item.items?.some((child) => child.key === activeKey);

          return (
            <div key={item.key} className={`top-nav__group${isGroup ? ' top-nav__group--menu' : ''}`}>
              <button
                type="button"
                className="top-nav__item"
                aria-current={isActive ? 'page' : undefined}
                aria-expanded={isGroup ? openGroup === item.key : undefined}
                aria-haspopup={isGroup ? 'menu' : undefined}
                onClick={() => {
                  if (isGroup) {
                    setOpenGroup((current) => current === item.key ? null : item.key);
                    return;
                  }
                  onSelect(item.key);
                  onCloseMobile?.();
                }}
              >
                {Icon ? <Icon aria-hidden="true" className="top-nav__icon" /> : null}
                <span>{item.label}</span>
                {isGroup ? <ChevronDown aria-hidden="true" className="top-nav__chevron" /> : null}
              </button>
              {isGroup && openGroup === item.key ? (
                <div className="top-nav__menu" role="menu" aria-label={`${item.label} navigation`}>
                  {item.items.map((child) => (
                    <button
                      key={child.key}
                      type="button"
                      role="menuitem"
                      className="top-nav__menu-item"
                      onClick={() => {
                        onSelect(child.key);
                        setOpenGroup(null);
                        onCloseMobile?.();
                      }}
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </>
  );
}
