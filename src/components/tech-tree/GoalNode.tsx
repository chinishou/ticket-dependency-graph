import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { Goal } from '../../types';
import {
  computeGoalStatus,
  getGoalStatusColor,
  getGoalStatusGlow,
} from '../../types';

export interface GoalNodeData {
  type: 'goal';
  goal: Goal;
  completedTasks: number;
  totalTasks: number;
  tasksMap: Map<string, { status: string; archived?: boolean }>;
  dimmed?: boolean;
  [key: string]: unknown;
}

const STATUS_LABELS: Record<string, string> = {
  completed:   'Done',
  in_progress: 'In Progress',
  blocked:     'Blocked',
  available:   'Active',
  empty:       'No Tasks',
};

function GoalNodeComponent({ data, selected }: NodeProps & { data: GoalNodeData }) {
  const { goal, completedTasks, totalTasks, tasksMap, dimmed } = data;
  const pct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const opacity = dimmed ? 0.15 : 1;

  const status = computeGoalStatus(goal, tasksMap);
  const accent = getGoalStatusColor(status);
  const glow = getGoalStatusGlow(status);
  const accentGlowAlpha = glow === 'transparent' ? 'rgba(100,116,139,0.2)' : glow;

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
          border: `2px solid ${accent}`,
          backgroundColor: 'var(--color-bg-secondary)',
          boxShadow: selected
            ? `0 0 20px ${accentGlowAlpha}, 0 0 40px ${accentGlowAlpha}`
            : `0 0 8px ${accentGlowAlpha}`,
          opacity,
          cursor: 'pointer',
          transition: 'box-shadow 0.2s, opacity 0.3s',
          pointerEvents: dimmed ? 'none' : 'auto',
        }}
      >
        {/* Priority badge + task count + status pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: '#fff',
              backgroundColor: accent,
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
            {completedTasks}/{totalTasks} tasks{totalTasks > 0 ? ` · ${pct}%` : ''}
          </span>
        </div>

        {/* Goal name */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            marginBottom: 2,
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {goal.name}
        </div>

        {/* Status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
          <span style={{
            display: 'inline-block',
            width: 6, height: 6,
            borderRadius: '50%',
            backgroundColor: accent,
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 10, color: accent, fontWeight: 600 }}>
            {STATUS_LABELS[status] ?? status}
          </span>
          {goal.owner && (
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
              {goal.owner}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: '100%',
            height: 6,
            backgroundColor: 'var(--color-bg-tertiary)',
            borderRadius: 3,
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              backgroundColor: accent,
              borderRadius: 3,
              boxShadow: pct > 0 ? `0 0 4px ${accentGlowAlpha}` : undefined,
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
