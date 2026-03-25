import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
  breadcrumbs?: { label: string; href?: string; onClick?: () => void }[];
  title?: string;
  rightContent?: ReactNode;
}

export function AppShell({ children, breadcrumbs, title, rightContent }: AppShellProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top bar */}
      <header
        style={{
          height: 52,
          minHeight: 52,
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          backgroundColor: 'var(--color-bg-secondary)',
          borderBottom: '1px solid var(--color-border)',
          gap: 12,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 16 }}>
          <span style={{ fontSize: 18 }}>🌳</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '-0.02em' }}>
            Tech Tree
          </span>
        </div>

        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            {breadcrumbs.map((crumb, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <span style={{ color: 'var(--color-text-muted)' }}>/</span>}
                {crumb.onClick ? (
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); crumb.onClick!(); }}
                    style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
                  >
                    {crumb.label}
                  </a>
                ) : crumb.href ? (
                  <a
                    href={crumb.href}
                    style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
                  >
                    {crumb.label}
                  </a>
                ) : (
                  <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}

        {title && !breadcrumbs && (
          <span style={{ fontSize: 14, fontWeight: 500 }}>{title}</span>
        )}

        {/* Right content */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {rightContent}
        </div>
      </header>

      {/* Main content */}
      <main style={{ flex: 1, overflow: 'hidden' }}>
        {children}
      </main>
    </div>
  );
}
