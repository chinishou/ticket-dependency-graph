import React, { useState, useRef, useEffect } from 'react';
import { useNotificationStore } from '../../store/useNotificationStore';
import type { NotificationPriority } from '../../types';

const priorityColors: Record<NotificationPriority, string> = {
  low: '#64748b',
  medium: '#38bdf8',
  high: '#f97316',
  urgent: '#ef4444',
};

const typeIcons: Record<string, string> = {
  task_assigned: '👤',
  task_status_changed: '🔄',
  task_completed: '✅',
  dependency_completed: '🔓',
  milestone_unlocked: '🏆',
  lock_acquired: '🔒',
  lock_released: '🔓',
  priority_overridden: '📊',
  priority_override_lifted: '📈',
  calibration_changed: '⚙️',
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export const NotificationCenter: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { markAsRead, markAllAsRead, clearAll, removeNotification, getUnreadCount, getVisibleNotifications } = useNotificationStore();
  const unreadCount = getUnreadCount();
  const notifications = getVisibleNotifications();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const bellButtonStyle: React.CSSProperties = {
    position: 'relative',
    background: 'none',
    border: 'none',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    padding: '8px',
    fontSize: '18px',
    borderRadius: '6px',
    transition: 'background-color 0.15s, color 0.15s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const badgeStyle = (): React.CSSProperties => ({
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: unreadCount > 0 ? '#ef4444' : 'transparent',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: unreadCount > 9 ? '0 4px' : 0,
    transition: 'background-color 0.2s',
  });

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 8,
    width: 360,
    maxHeight: 480,
    backgroundColor: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 8,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    zIndex: 1000,
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--color-border)',
  };

  const headerTitleStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  };

  const headerActionsStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
  };

  const headerButtonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    fontSize: 11,
    padding: '4px 6px',
    borderRadius: 4,
    transition: 'color 0.15s, background-color 0.15s',
  };

  const listStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 0',
  };

  const emptyStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 16px',
    color: 'var(--color-text-muted)',
    fontSize: 13,
    gap: 8,
  };

  const itemStyle = (unread: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '10px 16px',
    cursor: 'pointer',
    backgroundColor: unread ? 'rgba(56, 189, 248, 0.05)' : 'transparent',
    borderLeft: unread ? `2px solid var(--color-accent)` : '2px solid transparent',
    transition: 'background-color 0.15s',
  });

  const itemIconStyle: React.CSSProperties = {
    fontSize: 16,
    flexShrink: 0,
    marginTop: 2,
  };

  const itemContentStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
  };

  const itemTitleStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-text-primary)',
    marginBottom: 2,
  };

  const itemMessageStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    lineHeight: 1.4,
    wordBreak: 'break-word',
  };

  const itemMetaStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  };

  const itemTimeStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--color-text-muted)',
  };

  const priorityDotStyle = (priority: NotificationPriority): React.CSSProperties => ({
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: priorityColors[priority],
    flexShrink: 0,
  });

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        style={bellButtonStyle}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
          e.currentTarget.style.color = 'var(--color-text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = 'var(--color-text-secondary)';
        }}
      >
        🔔
        <span style={badgeStyle()}>
          {unreadCount > 0 ? unreadCount : ''}
        </span>
      </button>

      {isOpen && (
        <div style={dropdownStyle}>
          <div style={headerStyle}>
            <span style={headerTitleStyle}>Notifications</span>
            <div style={headerActionsStyle}>
              {unreadCount > 0 && (
                <button
                  style={headerButtonStyle}
                  onClick={markAllAsRead}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-muted)';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  Mark all read
                </button>
              )}
              <button
                style={headerButtonStyle}
                onClick={clearAll}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ef4444';
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--color-text-muted)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Clear all
              </button>
            </div>
          </div>

          <div style={listStyle}>
            {notifications.length === 0 ? (
              <div style={emptyStyle}>
                <span style={{ fontSize: 32 }}>🔕</span>
                <span>No notifications yet</span>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  style={itemStyle(!notif.read)}
                  onClick={() => markAsRead(notif.id)}
                  onMouseEnter={(e) => {
                    if (!notif.read) {
                      e.currentTarget.style.backgroundColor = 'rgba(56, 189, 248, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = notif.read ? 'transparent' : 'rgba(56, 189, 248, 0.05)';
                  }}
                >
                  <span style={itemIconStyle}>{typeIcons[notif.type] || '🔔'}</span>
                  <div style={itemContentStyle}>
                    <div style={itemTitleStyle}>{notif.title}</div>
                    <div style={itemMessageStyle}>{notif.message}</div>
                    <div style={itemMetaStyle}>
                      <span style={itemTimeStyle}>{formatTimestamp(notif.timestamp)}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={priorityDotStyle(notif.priority)} />
                        <button
                          style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '2px 4px', fontSize: 12, lineHeight: 1 }}
                          onClick={(e) => { e.stopPropagation(); removeNotification(notif.id); }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;