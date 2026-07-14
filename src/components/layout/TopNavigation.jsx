export function TopNavigation({
  items,
  activeKey,
  onSelect,
  id,
  mobileOpen = false,
  onCloseMobile,
}) {
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
          const isActive = activeKey === item.key;

          return (
            <button
              key={item.key}
              type="button"
              className="top-nav__item"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                onSelect(item.key);
                onCloseMobile?.();
              }}
            >
              {Icon ? <Icon aria-hidden="true" className="top-nav__icon" /> : null}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
