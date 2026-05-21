import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import type { UserRole } from '../../types';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  coordinator: 'Coordinator',
  worker: 'Worker',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: '#ef4444',
  coordinator: '#f59e0b',
  worker: '#6b7280',
};

export function UserTagPicker() {
  const userName = useStore((s) => s.userName);
  const setUserName = useStore((s) => s.setUserName);
  const isConnected = useStore((s) => s.isConnected);
  const userRole = useStore((s) => s.userRole);
  const upgradeToAdmin = useStore((s) => s.upgradeToAdmin);
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradePassword, setUpgradePassword] = useState('');
  const [upgradeError, setUpgradeError] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowUpgrade(false);
        setUpgradePassword('');
        setUpgradeError('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleSignOut = () => {
    // Reset the URL first so the next login lands on the role's default view
    // instead of replaying whatever path the signed-out user was on (e.g. an
    // admin on /settings — their replacement would otherwise inherit the
    // settings URL on next sign-in).
    navigate('/', { replace: true });
    setUserName(null);
    setIsOpen(false);
  };

  const handleUpgrade = async () => {
    setUpgradeError('');
    const success = await upgradeToAdmin(upgradePassword);
    if (success) {
      setShowUpgrade(false);
      setUpgradePassword('');
      setIsOpen(false);
    } else {
      setUpgradeError('Invalid password');
    }
  };

  const dotColor = isConnected ? '#22c55e' : '#ef4444';
  const roleColor = ROLE_COLORS[userRole];

  if (!userName) return null;

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 6,
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-bg-tertiary)',
          color: 'var(--color-text-primary)',
          fontSize: 12,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          backgroundColor: dotColor, display: 'inline-block',
        }} />
        {userName}
        <span style={{
          fontSize: 9, padding: '1px 5px', borderRadius: 3,
          backgroundColor: `${roleColor}20`, color: roleColor,
          fontWeight: 600, marginLeft: 2,
        }}>
          {ROLE_LABELS[userRole]}
        </span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 4,
          width: 240,
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          zIndex: 1000,
          overflow: 'hidden',
        }}>
          {/* Current user info */}
          <div style={{
            padding: '10px 12px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 600 }}>
              {userName}
            </span>
            <span style={{
              fontSize: 9, padding: '2px 6px', borderRadius: 4,
              backgroundColor: `${roleColor}20`, color: roleColor,
              fontWeight: 600,
            }}>
              {ROLE_LABELS[userRole]}
            </span>
          </div>

          {/* Admin upgrade */}
          {userRole !== 'admin' && (
            <div style={{ borderBottom: '1px solid var(--color-border)' }}>
              {!showUpgrade ? (
                <button
                  onClick={() => setShowUpgrade(true)}
                  style={{
                    display: 'block', width: '100%',
                    padding: '8px 12px', border: 'none',
                    backgroundColor: 'transparent',
                    color: '#ef4444', fontSize: 11, textAlign: 'left', cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Upgrade to Admin
                </button>
              ) : (
                <div style={{ padding: '8px 12px' }}>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 4 }}>Enter admin password:</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      type="password"
                      value={upgradePassword}
                      onChange={(e) => setUpgradePassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUpgrade()}
                      autoFocus
                      style={{
                        flex: 1, padding: '4px 8px', borderRadius: 4,
                        border: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-bg-primary)',
                        color: 'var(--color-text-primary)',
                        fontSize: 12, outline: 'none',
                      }}
                    />
                    <button
                      onClick={handleUpgrade}
                      style={{
                        padding: '4px 8px', borderRadius: 4,
                        border: '1px solid #ef4444',
                        backgroundColor: 'rgba(239,68,68,0.15)',
                        color: '#ef4444', fontSize: 11, cursor: 'pointer',
                      }}
                    >
                      Go
                    </button>
                  </div>
                  {upgradeError && (
                    <div style={{ fontSize: 10, color: '#ef4444', marginTop: 4 }}>{upgradeError}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 12px',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--color-text-muted)',
              fontSize: 11,
              textAlign: 'left',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
