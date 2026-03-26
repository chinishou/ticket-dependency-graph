import React from 'react';
import type { StrategicPriority } from '../../types';
import { getPriorityColor } from '../../types';

interface PriorityBadgeProps {
  priority: StrategicPriority;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

const priorityLabels: Record<StrategicPriority, string> = {
  P1: 'Critical',
  P2: 'High',
  P3: 'Medium',
  P4: 'Low',
};

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  priority,
  showLabel = false,
  size = 'md',
  style,
}) => {
  const color = getPriorityColor(priority);
  const isSmall = size === 'sm';
  const text = showLabel ? `${priority} ${priorityLabels[priority]}` : priority;

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
      <span style={textStyle}>{text}</span>
    </span>
  );
};

export default PriorityBadge;
