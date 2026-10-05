export function DashboardSectionTree({ sections, activeKey, onSelect, label = 'Dashboard sections' }) {
  return (
    <nav className="dashboard-section-tree" aria-label={label}>
      {sections.map((section) => (
        <div className="dashboard-section-tree__branch" key={section.key}>
          <button
            type="button"
            className="dashboard-section-tree__section"
            aria-current={section.key === activeKey ? 'page' : undefined}
            onClick={() => onSelect(section.key)}
          >
            {section.label}
          </button>
          {section.key === activeKey && section.children?.length ? (
            <div className="dashboard-section-tree__children">
              {section.children.map((child) => (
                <button key={child.key} type="button" onClick={() => onSelect(section.key, child.key)}>
                  {child.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}
