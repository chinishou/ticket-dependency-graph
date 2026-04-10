import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { TaskNodeData } from '../../utils/graphLayout';
import { getStatusColor, getStatusGlow, getStatusLabel } from '../../types';
import { getPriorityColor, getPriorityLabel } from '../../utils/priorityCalc';

function TaskNodeComponent({ data, selected }: NodeProps & { data: TaskNodeData }) {
  const { task, workerCount, etaDays, priorityScore, dimmed } = data;
  const statusColor = getStatusColor(task.status);
  const statusGlow = getStatusGlow(task.status);
  const statusLabel = getStatusLabel(task.status);
  const isDone = task.status === 'completed';
  const isLocked = task.status === 'locked';
  const isArchived = (task as { archived?: boolean }).archived;
  const isSgBacked = (task as { syncSource?: string }).syncSource === 'sg';
  let baseOpacity = isLocked ? 0.5 : 1;
  if (isArchived) baseOpacity = 0.4;
  const opacity = dimmed ? 0.15 : baseOpacity;

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ background: 'var(--color-border)', width: 6, height: 6 }} />
      <div
        style={{
          width: 200,
          padding: '10px 12px',
          borderRadius: 10,
          border: `2px solid ${statusColor}`,
          backgroundColor: 'var(--color-bg-secondary)',
          boxShadow: selected
            ? `0 0 20px ${statusGlow}, 0 0 40px ${statusGlow}`
            : `0 0 8px ${statusGlow}`,
          opacity,
          cursor: 'pointer',
          transition: 'box-shadow 0.2s, opacity 0.3s',
          pointerEvents: dimmed ? 'none' : 'auto',
        }}
      >
        {/* Status indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: statusColor,
              boxShadow: `0 0 6px ${statusColor}`,
            }}
          />
          <span style={{ fontSize: 9, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {statusLabel}
          </span>
          {task.ticketId && (
            <span style={{ fontSize: 9, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
              {task.ticketId}
            </span>
          )}
          {isSgBacked && (
            <span style={{ fontSize: 9, color: 'var(--color-accent)', marginLeft: 4 }} title="Synced from ShotGrid">SG</span>
          )}
          {isArchived && (
            <span style={{ fontSize: 9, color: 'var(--color-text-muted)', marginLeft: 4 }} title="Archived">📁</span>
          )}
        </div>

        {/* Task name */}
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 6, lineHeight: 1.3 }}>
          {task.name}
        </div>

        {/* Progress bar for in-progress */}
        {task.status === 'in_progress' && (
          <div style={{ width: '100%', height: 2, backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 2, marginBottom: 6 }}>
            <div
              style={{
                width: '40%',
                height: '100%',
                backgroundColor: statusColor,
                borderRadius: 2,
                boxShadow: `0 0 4px ${statusColor}`,
              }}
            />
          </div>
        )}

        {/* Done bar */}
        {isDone && (
          <div style={{ width: '100%', height: 2, backgroundColor: statusColor, borderRadius: 2, marginBottom: 6 }} />
        )}

        {/* Meta info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--color-text-secondary)' }}>
          {workerCount > 0 && (
            <span title="Workers assigned">👥 {workerCount}</span>
          )}
          {!isDone && (
            <span title="Estimated days">{etaDays}d</span>
          )}
          {priorityScore != null && !isDone && (
            <span
              title={`Priority: ${getPriorityLabel(priorityScore)} (${priorityScore})`}
              style={{
                marginLeft: 'auto',
                padding: '1px 6px',
                borderRadius: 8,
                fontSize: 9,
                fontWeight: 600,
                backgroundColor: `${getPriorityColor(priorityScore)}25`,
                color: getPriorityColor(priorityScore),
              }}
            >
              {getPriorityLabel(priorityScore)}
            </span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--color-border)', width: 6, height: 6 }} />
    </>
  );
}

export const TaskNode = memo(TaskNodeComponent);
