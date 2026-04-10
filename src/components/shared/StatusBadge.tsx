import React from 'react';
import type { TaskStatus } from '../../types';
import { getStatusColor, getStatusLabel } from '../../types';

interface StatusBadgeProps {
  status: TaskStatus;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  style,
}) => {
  const color = getStatusColor(status);
  const label = getStatusLabel(status);

  const isSmall = size === 'sm';

  // We need to set background with opacity. Since the color value is a CSS
  // variable reference (e.g. "var(--color-done)"), we cannot manipulate it
  // directly in JS. Instead we use a wrapper with a pseudo-element approach
  // via two nested elements: an outer for the background and inner for text.

  const outerStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    position: 'relative',
    fontSize: isSmall ? 10 : 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    padding: isSmall ? '2px 6px' : '3px 8px',
    borderRadius: 999,
    color: color,
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    ...style,
  };

  const bgStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundColor: color,
    opacity: 0.15,
    borderRadius: 999,
    pointerEvents: 'none',
  };

  const textStyle: React.CSSProperties = {
    position: 'relative',
  };

  return (
    <span style={outerStyle}>
      <span style={bgStyle} />
      <span style={textStyle}>{label}</span>
    </span>
  );
};

export default StatusBadge;
