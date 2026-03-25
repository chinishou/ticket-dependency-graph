import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { Goal } from '../../types';

export interface GoalNodeData {
  type: 'goal';
  goal: Goal;
  completedTasks: number;
  totalTasks: number;
  dimmed?: boolean;
  [key: string]: unknown;
}

const ACCENT = '#a78bfa';
const ACCENT_GLOW = 'rgba(167, 139, 250, 0.35)';

function GoalNodeComponent({ data, selected }: NodeProps & { data: GoalNodeData }) {
  const { goal, completedTasks, totalTasks, dimmed } = data;
  const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const opacity = dimmed ? 0.15 : 1;

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: 'var(--color-border)', width: 6, height: 6 }}
      />
      <div
        style={{
          width: 220,
          padding: '10px 12px',
          borderRadius: 10,
          border: `2px solid ${ACCENT}`,
          backgroundColor: 'var(--color-bg-secondary)',
          boxShadow: selected
            ? `0 0 20px ${ACCENT_GLOW}, 0 0 40px ${ACCENT_GLOW}`
            : `0 0 8px ${ACCENT_GLOW}`,
          opacity,
          cursor: 'pointer',
          transition: 'box-shadow 0.2s, opacity 0.3s',
          pointerEvents: dimmed ? 'none' : 'auto',
        }}
      >
        {/* Priority badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: '#fff',
              backgroundColor: ACCENT,
              padding: '1px 6px',
              borderRadius: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            P{goal.departmentPriority}
          </span>
          <span
            style={{
              fontSize: 9,
              color: 'var(--color-text-muted)',
              marginLeft: 'auto',
            }}
          >
            {completedTasks}/{totalTasks} tasks
          </span>
        </div>

        {/* Goal name */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: 4,
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {goal.name}
        </div>

        {/* Owner */}
        <div
          style={{
            fontSize: 10,
            color: 'var(--color-text-secondary)',
            marginBottom: 6,
          }}
        >
          {goal.owner}
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: '100%',
            height: 3,
            backgroundColor: 'var(--color-bg-tertiary)',
            borderRadius: 2,
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              backgroundColor: pct === 100 ? 'var(--color-done)' : ACCENT,
              borderRadius: 2,
              boxShadow: pct > 0 ? `0 0 4px ${pct === 100 ? 'var(--color-done-glow)' : ACCENT_GLOW}` : undefined,
              transition: 'width 0.3s',
            }}
          />
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: 'var(--color-border)', width: 6, height: 6 }}
      />
    </>
  );
}

export const GoalNode = memo(GoalNodeComponent);
