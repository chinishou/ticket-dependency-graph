import { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';

export function UserTagPicker() {
  const userName = useStore((s) => s.userName);
  const setUserName = useStore((s) => s.setUserName);
  const isConnected = useStore((s) => s.isConnected);

  const [isOpen, setIsOpen] = useState(false);
  const [users, setUsers] = useState<{ name: string }[]>([]);
  const [newName, setNewName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch user list when dropdown opens
  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/users')
      .then((r) => r.json())
      .then(setUsers)
      .catch(() => {});
  }, [isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const handleCreateAndSelect = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setUserName(trimmed);
    setNewName('');
    setIsOpen(false);
  };

  const handleSelect = (name: string) => {
    setUserName(name);
    setIsOpen(false);
  };

  const handleSignOut = () => {
    setUserName(null);
    setIsOpen(false);
  };

  const dotColor = isConnected ? '#22c55e' : '#ef4444';

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
          color: userName ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
          fontSize: 12,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          backgroundColor: dotColor, display: 'inline-block',
        }} />
        {userName ? userName : 'No user'}
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 4,
          width: 220,
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          zIndex: 1000,
          overflow: 'hidden',
        }}>
          {/* Current user */}
          {userName && (
            <div style={{
              padding: '8px 12px',
              borderBottom: '1px solid var(--color-border)',
              fontSize: 11,
              color: 'var(--color-text-muted)',
            }}>
              Editing as: <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{userName}</span>
            </div>
          )}

          {/* Existing users */}
          {users.length > 0 && (
            <div style={{ maxHeight: 160, overflowY: 'auto' }}>
              {users.map((u) => (
                <button
                  key={u.name}
                  onClick={() => handleSelect(u.name)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '6px 12px',
                    border: 'none',
                    backgroundColor: u.name === userName ? 'var(--color-bg-tertiary)' : 'transparent',
                    color: 'var(--color-text-primary)',
                    fontSize: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = u.name === userName ? 'var(--color-bg-tertiary)' : 'transparent')}
                >
                  {u.name === userName ? `* ${u.name}` : u.name}
                </button>
              ))}
            </div>
          )}

          {/* Create new user */}
          <div style={{
            padding: '8px 12px',
            borderTop: users.length > 0 ? '1px solid var(--color-border)' : 'none',
            display: 'flex',
            gap: 4,
          }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateAndSelect()}
              placeholder="New name..."
              style={{
                flex: 1,
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-primary)',
                color: 'var(--color-text-primary)',
                fontSize: 12,
                outline: 'none',
              }}
            />
            <button
              onClick={handleCreateAndSelect}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-accent)',
                color: '#fff',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Add
            </button>
          </div>

          {/* Sign out */}
          {userName && (
            <div style={{ borderTop: '1px solid var(--color-border)' }}>
              <button
                onClick={handleSignOut}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '6px 12px',
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
      )}
    </div>
  );
}
