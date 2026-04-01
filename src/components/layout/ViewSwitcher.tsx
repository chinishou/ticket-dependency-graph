import type { UserRole } from '../../types';

export type TopView = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

interface ViewSwitcherProps {
  activeView: TopView;
  onSwitch: (view: TopView) => void;
  role: UserRole;
  style?: React.CSSProperties;
}

const allViews: { key: TopView; label: string }[] = [
  { key: 'F', label: 'My Tasks' },
  { key: 'A', label: 'Tech Tree' },
  { key: 'B', label: 'Dashboard' },
  { key: 'C', label: 'Timeline' },
  { key: 'D', label: 'Workers' },
  { key: 'E', label: 'Settings' },
];

function getViewsForRole(role: UserRole) {
  switch (role) {
    case 'admin':
      // Admin sees all except My Tasks is available but not prominent
      return allViews.filter((v) => v.key !== 'F');
    case 'coordinator':
      // No Settings, no My Tasks in nav
      return allViews.filter((v) => v.key !== 'E' && v.key !== 'F');
    case 'worker':
      // My Tasks, Tech Tree, Dashboard, Timeline — no Workers or Settings
      return allViews.filter((v) => v.key !== 'D' && v.key !== 'E');
    default:
      return allViews;
  }
}

export function getDefaultView(role: UserRole): TopView {
  switch (role) {
    case 'admin': return 'B';       // Dashboard
    case 'coordinator': return 'A'; // Tech Tree
    case 'worker': return 'F';      // My Tasks
  }
}

export function ViewSwitcher({ activeView, onSwitch, role, style }: ViewSwitcherProps) {
  const views = getViewsForRole(role);

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
