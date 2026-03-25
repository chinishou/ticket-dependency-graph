import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { MilestoneNodeData } from '../../utils/graphLayout';

function MilestoneNodeComponent({ data, selected }: NodeProps & { data: MilestoneNodeData }) {
  const { milestone, dimmed } = data;
  const isUnlocked = milestone.unlocked;
  const color = isUnlocked ? 'var(--color-done)' : 'var(--color-milestone)';
  const glow = isUnlocked ? 'var(--color-done-glow)' : 'var(--color-milestone-glow)';
  const baseOpacity = isUnlocked ? 1 : 0.8;
  const opacity = dimmed ? 0.15 : baseOpacity;

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ background: 'var(--color-border)', width: 6, height: 6 }} />
      <div
        style={{
          width: 180,
          padding: '8px 12px',
          borderRadius: 10,
          border: `2px solid ${color}`,
          backgroundColor: 'var(--color-bg-secondary)',
          boxShadow: selected
            ? `0 0 24px ${glow}, 0 0 48px ${glow}`
            : `0 0 12px ${glow}`,
          cursor: 'pointer',
          textAlign: 'center',
          opacity,
          transition: 'opacity 0.3s',
          pointerEvents: dimmed ? 'none' : 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 16 }}>{isUnlocked ? '⭐' : '🔒'}</span>
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Milestone
          </span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: color }}>
          {milestone.name}
        </div>
        {milestone.dueDate && !isUnlocked && (
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
            Due: {new Date(milestone.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        )}
        {isUnlocked && milestone.unlockedAt && (
          <div style={{ fontSize: 10, color: 'var(--color-done)', marginTop: 4 }}>
            ✓ Unlocked {new Date(milestone.unlockedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--color-border)', width: 6, height: 6 }} />
    </>
  );
}

export const MilestoneNode = memo(MilestoneNodeComponent);
