interface ViewSwitcherProps {
  activeView: 'A' | 'B' | 'C' | 'D' | 'E';
  onSwitch: (view: 'A' | 'B' | 'C' | 'D' | 'E') => void;
  style?: React.CSSProperties;
}

const views: { key: 'A' | 'B' | 'C' | 'D' | 'E'; label: string }[] = [
  { key: 'A', label: 'Tech Tree' },
  { key: 'B', label: 'Dashboard' },
  { key: 'C', label: 'Timeline' },
  { key: 'D', label: 'Workers' },
  { key: 'E', label: 'Settings' },
];

export function ViewSwitcher({ activeView, onSwitch, style }: ViewSwitcherProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        borderRadius: 8,
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {views.map(({ key, label }, i) => {
        const isActive = activeView === key;
        return (
          <button
            key={key}
            onClick={() => onSwitch(key)}
            style={{
              padding: '5px 14px',
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              color: isActive
                ? 'var(--color-accent)'
                : 'var(--color-text-secondary)',
              backgroundColor: isActive
                ? 'rgba(56, 189, 248, 0.08)'
                : 'transparent',
              border: 'none',
              borderRight: i < views.length - 1 ? '1px solid var(--color-border)' : 'none',
              borderBottom: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'background-color 0.15s, color 0.15s, border-color 0.15s',
              position: 'relative',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)';
                e.currentTarget.style.color = 'var(--color-text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--color-text-secondary)';
              }
            }}
          >
            [{key}] {label}
          </button>
        );
      })}
    </div>
  );
}
