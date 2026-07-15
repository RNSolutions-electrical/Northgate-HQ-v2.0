export function WorkspaceTabs({
  tabs,
  activeKey,
  onChange,
  ariaLabel,
}) {
  return (
    <div className="workspace-tabs" role="tablist" aria-label={ariaLabel}>
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
  );
}
