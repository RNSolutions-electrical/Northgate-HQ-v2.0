import { ChevronDown, List } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

export function WorkspaceTabs({
  tabs,
  activeKey,
  onChange,
  ariaLabel,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeTab = tabs.find((tab) => tab.key === activeKey);
  const listId = useId();

  useEffect(() => {
    setMobileOpen(false);
  }, [activeKey]);

  return (
    <div className={`workspace-tabs${mobileOpen ? ' is-mobile-open' : ''}`} aria-label={ariaLabel}>
      <button type="button" className="workspace-tabs__mobile-trigger" onClick={() => setMobileOpen((current) => !current)} aria-expanded={mobileOpen} aria-controls={listId}>
        <List aria-hidden="true" />
        <span><small>Current section</small><strong>{activeTab?.label ?? 'Choose section'}</strong></span>
        <ChevronDown aria-hidden="true" />
      </button>
      <div id={listId} className="workspace-tabs__list" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`workspace-tab${activeKey === tab.key ? ' workspace-tab--active' : ''}${tab.disabled ? ' workspace-tab--disabled' : ''}`}
            aria-selected={activeKey === tab.key}
            aria-disabled={tab.disabled}
            disabled={tab.disabled}
            onClick={tab.disabled ? undefined : () => onChange(tab.key)}
            title={tab.description || undefined}
          >
            <span>{tab.label}</span>
            {tab.meta ? <small>{tab.meta}</small> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
