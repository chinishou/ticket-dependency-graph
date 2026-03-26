import React from 'react';

interface ProgressBarProps {
  value: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
  color?: string;
  showLabel?: boolean;
  style?: React.CSSProperties;
}

const sizeMap: Record<string, number> = {
  sm: 4,
  md: 8,
  lg: 12,
};

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  size = 'md',
  color,
  showLabel = false,
  style,
}) => {
  const clamped = Math.max(0, Math.min(100, value));
  const height = sizeMap[size];
  const barColor =
    color ?? (clamped === 100 ? 'var(--color-done)' : 'var(--color-accent)');

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    ...style,
  };

  const trackStyle: React.CSSProperties = {
    flex: 1,
    height,
    backgroundColor: 'var(--color-bg-tertiary)',
    borderRadius: height / 2,
    overflow: 'hidden',
  };

  const fillStyle: React.CSSProperties = {
    height: '100%',
    width: `${clamped}%`,
    backgroundColor: barColor,
    borderRadius: height / 2,
    transition: 'width 0.3s ease',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    minWidth: 32,
    textAlign: 'right',
  };

  return (
    <div style={containerStyle}>
      <div style={trackStyle}>
        <div style={fillStyle} />
      </div>
      {showLabel && <span style={labelStyle}>{Math.round(clamped)}%</span>}
    </div>
  );
};

export default ProgressBar;
