import React from 'react';
import type { Worker } from '../../types';

interface WorkerAvatarsProps {
  workers: Worker[];
  max?: number;
  size?: number;
  style?: React.CSSProperties;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const WorkerAvatars: React.FC<WorkerAvatarsProps> = ({
  workers,
  max = 5,
  size = 28,
  style,
}) => {
  const visible = workers.slice(0, max);
  const overflow = workers.length - max;

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    ...style,
  };

  const avatarStyle = (index: number, isActive: boolean): React.CSSProperties => ({
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: 'var(--color-bg-tertiary)',
    border: '2px solid var(--color-bg-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: Math.round(size * 0.38),
    fontWeight: 600,
    color: 'var(--color-text-primary)',
    marginLeft: index === 0 ? 0 : -(size * 0.25),
    position: 'relative',
    zIndex: max - index,
    cursor: 'default',
    boxShadow: isActive ? '0 0 0 2px var(--color-done)' : undefined,
    flexShrink: 0,
  });

  const overflowStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: 'var(--color-bg-tertiary)',
    border: '2px solid var(--color-bg-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: Math.round(size * 0.34),
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    marginLeft: -(size * 0.25),
    position: 'relative',
    zIndex: 0,
    cursor: 'default',
    flexShrink: 0,
  };

  return (
    <div style={containerStyle}>
      {visible.map((worker, index) => {
        const isActive = (worker.activeTaskIds ?? []).length > 0;
        return (
          <div
            key={worker.id}
            style={avatarStyle(index, isActive)}
            title={worker.name}
          >
            {getInitials(worker.name)}
          </div>
        );
      })}
      {overflow > 0 && (
        <div
          style={overflowStyle}
          title={`${overflow} more`}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
};

export default WorkerAvatars;
