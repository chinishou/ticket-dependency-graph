import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { getStatusColor, getStatusLabel, getEtaDays } from '../../types';
import { computeTaskPriorities, getPriorityLabel, getPriorityColor } from '../../utils/priorityCalc';

interface FloatingTaskDetailPanelProps {
  onGoToTechTree: (goalId: string, taskId: string) => void;
  onClose: () => void;
}

export function FloatingTaskDetailPanel({ onGoToTechTree, onClose }: FloatingTaskDetailPanelProps) {
  const selectedTaskId = useStore((s) => s.selectedTaskId);
  const tasksMap = useStore((s) => s.tasks);
  const milestonesMap = useStore((s) => s.milestones);
  const workersMap = useStore((s) => s.workers);
  const departmentsMap = useStore((s) => s.departments);
  const goalsMap = useStore((s) => s.goals);
  const getProjectForGoal = useStore((s) => s.getProjectForGoal);

  const priorities = useMemo(
    () => computeTaskPriorities({ tasks: tasksMap, milestones: milestonesMap, goals: goalsMap, departments: departmentsMap }),
    [tasksMap, milestonesMap, goalsMap, departmentsMap],
  );

  if (!selectedTaskId) return null;
  const task = tasksMap.get(selectedTaskId);
  if (!task) return null;

  const statusColor = getStatusColor(task.status);
  const assignedWorkers = task.assignedWorkerIds.map((id) => workersMap.get(id)).filter(Boolean);
  const dept = departmentsMap.get(task.contributingDepartmentId);
  const project = getProjectForGoal(task.goalId);
  const workerCount = assignedWorkers.length;
  const etaDays = getEtaDays(task, workerCount);
  const pri = priorities.get(task.id);
  const goal = goalsMap.get(task.goalId);

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{task.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <div style={{ ...statusDot, backgroundColor: statusColor }} />
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{getStatusLabel(task.status)}</span>
            {task.ticketId && (
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 6 }}>{task.ticketId}</span>
            )}
          </div>
        </div>
        <button onClick={onClose} style={closeButtonStyle}>✕</button>
      </div>

      {task.description && (
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
          {task.description.length > 120 ? task.description.slice(0, 120) + '...' : task.description}
        </div>
      )}

      {project && (
        <div style={metaRowStyle}>
          <span style={{ color: 'var(--color-text-muted)' }}>Project</span>
          <span>{project.name}</span>
        </div>
      )}
      {dept && (
        <div style={metaRowStyle}>
          <span style={{ color: 'var(--color-text-muted)' }}>Department</span>
          <span>{dept.name}</span>
        </div>
      )}
      {goal && (
        <div style={metaRowStyle}>
          <span style={{ color: 'var(--color-text-muted)' }}>Goal</span>
          <span>{goal.name}</span>
        </div>
      )}
      <div style={metaRowStyle}>
        <span style={{ color: 'var(--color-text-muted)' }}>Base Duration</span>
        <span>{task.baseDurationDays} days</span>
      </div>
      {task.status !== 'completed' && (
        <div style={metaRowStyle}>
          <span style={{ color: 'var(--color-text-muted)' }}>Current ETA</span>
          <span>{etaDays} days ({workerCount} worker{workerCount !== 1 ? 's' : ''})</span>
        </div>
      )}

      {pri && task.status !== 'completed' && (
        <div style={metaRowStyle}>
          <span style={{ color: 'var(--color-text-muted)' }}>Priority</span>
          <span style={{
            padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
            backgroundColor: `${getPriorityColor(pri.score)}20`,
            color: getPriorityColor(pri.score),
          }}>
            {getPriorityLabel(pri.score)} ({pri.score})
            {pri.criticalPath && ' \u26A1'}
          </span>
        </div>
      )}

      {assignedWorkers.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={sectionTitleStyle}>Workers ({assignedWorkers.length})</div>
          {assignedWorkers.map((w) => w && (
            <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                backgroundColor: 'var(--color-bg-tertiary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 600,
              }}>
                {w.name.split(' ').map((n) => n[0]).join('')}
              </div>
              <span>{w.name}</span>
              {(w.activeTaskIds ?? []).includes(task.id) && (
                <span style={{ fontSize: 9, color: 'var(--color-in-progress)', marginLeft: 'auto' }}>● Active</span>
              )}
            </div>
          ))}
        </div>
      )}

      {!task.unplaced && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-bg-tertiary)' }}>
          <button
            onClick={() => onGoToTechTree(task.goalId, task.id)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--color-accent)',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              color: 'var(--color-accent)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            View in Tech Tree
          </button>
        </div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  width: 320,
  height: '100%',
  backgroundColor: 'var(--color-bg-secondary)',
  borderLeft: '1px solid var(--color-border)',
  padding: '16px',
  overflowY: 'auto',
  zIndex: 10,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 8,
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--color-text-muted)',
  fontSize: 16,
  cursor: 'pointer',
  padding: '4px 6px',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 4,
};

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 12,
  padding: '5px 0',
  borderBottom: '1px solid var(--color-bg-tertiary)',
};

const statusDot: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  flexShrink: 0,
};