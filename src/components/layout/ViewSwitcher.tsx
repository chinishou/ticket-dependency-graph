interface ViewSwitcherProps {
  activeView: 'A' | 'B' | 'C' | 'D';
  onSwitch: (view: 'A' | 'B' | 'C' | 'D') => void;
  style?: React.CSSProperties;
}

const views: { key: 'A' | 'B' | 'C' | 'D'; label: string }[] = [
  { key: 'A', label: 'Tech Tree' },
  { key: 'B', label: 'Dashboard' },
  { key: 'C', label: 'Timeline' },
  { key: 'D', label: 'Workers' },
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
      {views.map(({ key, label }) => {
        const isActive = activeView === key;
        const isDisabled = false;
        return (
          <button
            key={key}
            onClick={() => !isDisabled && onSwitch(key)}
            disabled={isDisabled}
            style={{
              padding: '5px 14px',
              fontSize: 12,
              fontWeight: isActive ? 600 : 400,
              color: isDisabled
                ? 'var(--color-text-muted)'
                : isActive
                  ? 'var(--color-text-primary)'
                  : 'var(--color-text-secondary)',
              backgroundColor: isActive
                ? 'var(--color-bg-tertiary)'
                : 'transparent',
              border: 'none',
              borderRight: '1px solid var(--color-border)',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              opacity: isDisabled ? 0.5 : 1,
              transition: 'background-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!isActive && !isDisabled) {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive && !isDisabled) {
                e.currentTarget.style.backgroundColor = 'transparent';
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
