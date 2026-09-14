import { ChevronDown, X } from 'lucide-react';
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
        <div className="top-nav__mobile-heading">
          <div><span className="eyebrow">Navigate</span><strong>Main menu</strong></div>
          <button type="button" onClick={onCloseMobile} aria-label="Close main menu"><X aria-hidden="true" /></button>
        </div>
        {items.map((item) => {
          const Icon = item.icon;
          const isGroup = Array.isArray(item.items);
          const isActive = activeKey === item.key || item.items?.some((child) => child.key === activeKey);

          return (
            <div key={item.key} className={`top-nav__group${isGroup ? ' top-nav__group--menu' : ''}`}
              onPointerEnter={e=>{if(isGroup&&e.pointerType==='mouse'&&window.matchMedia('(min-width: 900px) and (hover: hover)').matches)setOpenGroup(item.key);}}
              onPointerLeave={e=>{if(e.pointerType==='mouse')setOpenGroup(null);}}
              onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpenGroup(null);}}
              onKeyDown={e=>{if(e.key==='Escape')setOpenGroup(null);}}
            >
              <button
                type="button"
                className="top-nav__item"
                aria-current={isActive ? 'page' : undefined}
                onKeyDown={e=>{if(isGroup&&e.key==='ArrowDown'){e.preventDefault();setOpenGroup(item.key);}}}
                onClick={() => {
                  onSelect(item.defaultTarget||item);
                  setOpenGroup(null);
                  onCloseMobile?.();
                }}
              >
                {Icon ? <Icon aria-hidden="true" className="top-nav__icon" /> : null}
                <span>{item.label}</span>
              </button>
              {isGroup&&<button type="button" className="top-nav__disclosure" aria-label={`Show ${item.label} options`}
                aria-expanded={openGroup===item.key} aria-haspopup="menu"
                onClick={()=>setOpenGroup(current=>current===item.key?null:item.key)}>
                <ChevronDown aria-hidden="true" className="top-nav__chevron"/>
              </button>}
              {isGroup && openGroup === item.key ? (
                <div className="top-nav__menu" role="menu" aria-label={`${item.label} navigation`}>
                  {item.items.map((child) => (
                    <button
                      key={child.key}
                      type="button"
                      role="menuitem"
                      className="top-nav__menu-item"
                      onClick={() => {
                        onSelect(child);
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
