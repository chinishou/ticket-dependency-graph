import React, { useEffect, useState } from 'react';
import { useNotificationStore } from '../../store/useNotificationStore';
import type { Notification, NotificationPriority } from '../../types';

const priorityColors: Record<NotificationPriority, { bg: string; border: string; icon: string }> = {
  low: { bg: 'rgba(100, 116, 139, 0.15)', border: '#64748b', icon: 'ℹ️' },
  medium: { bg: 'rgba(56, 189, 248, 0.15)', border: '#38bdf8', icon: '🔔' },
  high: { bg: 'rgba(249, 115, 22, 0.15)', border: '#f97316', icon: '⚠️' },
  urgent: { bg: 'rgba(239, 68, 68, 0.15)', border: '#ef4444', icon: '🚨' },
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

interface ToastItemProps {
  notification: Notification;
  onDismiss: () => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ notification, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);
  const colors = priorityColors[notification.priority];
  const icon = typeIcons[notification.type] || '🔔';

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 200);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(onDismiss, 200);
    }, 4700);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px 16px',
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: '8px',
    minWidth: '320px',
    maxWidth: '420px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    transform: isExiting ? 'translateX(120%)' : 'translateX(0)',
    opacity: isExiting ? 0 : 1,
    transition: 'transform 0.2s ease-out, opacity 0.2s ease-out',
  };

  const iconStyle: React.CSSProperties = {
    fontSize: '20px',
    flexShrink: 0,
  };

  const contentStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    marginBottom: '2px',
  };

  const messageStyle: React.CSSProperties = {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    lineHeight: 1.4,
    wordBreak: 'break-word',
  };

  const dismissStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    padding: '4px',
    fontSize: '16px',
    lineHeight: 1,
    flexShrink: 0,
    opacity: 0.7,
    transition: 'opacity 0.15s',
  };

  return (
    <div style={containerStyle}>
      <span style={iconStyle}>{icon}</span>
      <div style={contentStyle}>
        <div style={titleStyle}>{notification.title}</div>
        <div style={messageStyle}>{notification.message}</div>
      </div>
      <button
        style={dismissStyle}
        onClick={handleDismiss}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
      >
        ✕
      </button>
    </div>
  );
};

export const NotificationToast: React.FC = () => {
  const { toasts, removeToast } = useNotificationStore();

  if (toasts.length === 0) return null;

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    display: 'flex',
    flexDirection: 'column-reverse',
    gap: '8px',
    zIndex: 9999,
    pointerEvents: 'none',
  };

  return (
    <div style={containerStyle}>
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          notification={toast}
          onDismiss={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};

export default NotificationToast;