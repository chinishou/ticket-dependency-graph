import React, { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { ProgressBar } from '../shared/ProgressBar';
import { StatusBadge } from '../shared/StatusBadge';
import type { Task, TaskStatus, StrategicPriority } from '../../types';
import { getPriorityColor } from '../../types';
import { usePermission } from '../../hooks/usePermission';

interface ProjectDashboardProps {
  projectId: string;
  onSelectGoal: (goalId: string) => void;
  onBack: () => void;
}

export const ProjectDashboard: React.FC<ProjectDashboardProps> = ({
  projectId,
  onSelectGoal: _onSelectGoal,
  onBack,
}) => {
  const project = useStore((s) => s.projects.get(projectId));
  const updateProject = useStore((s) => s.updateProject);
  const { canEditPriorities } = usePermission();
  const departments = useStore((s) => s.departments);
  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const milestones = useStore((s) => s.milestones);
  const getGoalsForProject = useStore((s) => s.getGoalsForProject);
  const getTasksForGoal = useStore((s) => s.getTasksForGoal);

  const projectGoals = useMemo(() => getGoalsForProject(projectId), [projectId, getGoalsForProject]);

  // All tasks across project goals
  const allProjectTasks = useMemo(() => {
    const result: Task[] = [];
    for (const goal of projectGoals) {
      result.push(...getTasksForGoal(goal.id));
    }
    return result;
  }, [projectGoals, getTasksForGoal]);

  // Overall progress
  const totalTasks = allProjectTasks.length;
  const completedTasks = allProjectTasks.filter((t) => t.status === 'completed').length;
  const overallProgress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

  // Department contributions
  const deptContributions = useMemo(() => {
    const deptMap = new Map<string, { tasks: Task[]; workerIds: Set<string> }>();

    for (const deptId of project?.contributingDepartmentIds ?? []) {
      deptMap.set(deptId, { tasks: [], workerIds: new Set() });
    }

    for (const task of allProjectTasks) {
      const deptId = task.contributingDepartmentId;
      if (!deptMap.has(deptId)) {
        deptMap.set(deptId, { tasks: [], workerIds: new Set() });
      }
      const entry = deptMap.get(deptId)!;
      entry.tasks.push(task);
      for (const wId of task.assignedWorkerIds) {
        entry.workerIds.add(wId);
      }
    }

    return Array.from(deptMap.entries()).map(([deptId, data]) => {
      const dept = departments.get(deptId);
      const completed = data.tasks.filter((t) => t.status === 'completed').length;
      const total = data.tasks.length;
      const progress = total > 0 ? (completed / total) * 100 : 0;
      const hasBlocked = data.tasks.some((t) => t.status === 'blocked' || t.status === 'paused');

      return {
        deptId,
        name: dept?.name ?? 'Unknown Department',
        progress,
        completed,
        total,
        workerCount: data.workerIds.size,
        hasBlocked,
      };
    });
  }, [allProjectTasks, departments, project?.contributingDepartmentIds]);

  // Project milestones
  const projectMilestones = useMemo(() => {
    return (project?.milestoneIds ?? [])
      .map((id) => milestones.get(id))
      .filter(Boolean)
      .map((ms) => {
        const reqTasks = ms!.requiredTaskIds.map((id) => tasks.get(id)).filter(Boolean);
        const doneCount = reqTasks.filter((t) => t!.status === 'completed').length;
        const totalReq = reqTasks.length;
        const progress = totalReq > 0 ? (doneCount / totalReq) * 100 : 0;
        return {
          id: ms!.id,
          name: ms!.name,
          unlocked: ms!.unlocked,
          dueDate: ms!.dueDate,
          progress,
          doneCount,
          totalReq,
        };
      });
  }, [project?.milestoneIds, milestones, tasks]);

  // Blocked / paused tasks
  const blockerTasks = useMemo(() => {
    return allProjectTasks
      .filter((t) => t.status === 'blocked' || t.status === 'paused')
      .map((t) => {
        const goal = goals.get(t.goalId);
        return {
          id: t.id,
          name: t.name,
          status: t.status,
          goalName: goal?.name ?? 'Unknown Goal',
        };
      });
  }, [allProjectTasks, goals]);

  if (!project) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <span style={{ color: 'var(--color-text-muted)' }}>Project not found.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <button onClick={onBack} style={backButtonStyle} title="Back">
          ← Back
        </button>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={titleStyle}>{project.name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 3 }}>
                {canEditPriorities ? (['P1', 'P2', 'P3'] as StrategicPriority[]).map((p) => {
                  const color = getPriorityColor(p);
                  const isActive = project.strategicPriority === p;
                  return (
                    <button
                      key={p}
                      onClick={() => updateProject(projectId, { strategicPriority: p })}
                      style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 999, cursor: 'pointer',
                        border: `1px solid ${isActive ? color : 'var(--color-border)'}`,
                        backgroundColor: isActive ? `${color}20` : 'transparent',
                        color: isActive ? color : 'var(--color-text-muted)',
                        fontWeight: isActive ? 700 : 400,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {p}
                    </button>
                  );
                }) : (() => {
                  const color = getPriorityColor(project.strategicPriority);
                  return (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, border: `1px solid ${color}`, backgroundColor: `${color}20`, color, fontWeight: 700 }}>
                      {project.strategicPriority}
                    </span>
                  );
                })()}
              </div>
              <StatusBadge status={project.status as TaskStatus} size="sm" />
              {project.deadline && (
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  Deadline: {new Date(project.deadline).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {Math.round(overallProgress)}%
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {completedTasks}/{totalTasks} tasks
            </div>
          </div>
        </div>
        <ProgressBar value={overallProgress} size="lg" showLabel={false} style={{ marginTop: 16 }} />
      </div>

      {/* Department Contributions */}
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Department Contributions</h2>
        {deptContributions.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '12px 0' }}>
            No department contributions yet.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {deptContributions.map((dept) => (
            <div key={dept.deptId} style={deptRowStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {dept.name}
                  </span>
                  {dept.hasBlocked && (
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--color-blocked)', display: 'inline-block', flexShrink: 0 }} title="Has blocked tasks" />
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {dept.workerCount} worker{dept.workerCount !== 1 ? 's' : ''}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    {dept.completed}/{dept.total}
                  </span>
                </div>
              </div>
              <ProgressBar value={dept.progress} size="sm" showLabel />
            </div>
          ))}
        </div>
      </div>

      {/* Milestones */}
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Project Milestones</h2>
        {projectMilestones.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '12px 0' }}>
            No milestones defined.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {projectMilestones.map((ms) => (
            <div key={ms.id} style={milestoneRowStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={milestoneIconStyle(ms.unlocked)}>
                  {ms.unlocked ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 7l3 3 5-5" stroke="var(--color-done)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="5" stroke="var(--color-text-muted)" strokeWidth="1.5" />
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: ms.unlocked ? 'var(--color-done)' : 'var(--color-text-primary)',
                    }}>
                      {ms.name}
                    </span>
                    {ms.dueDate && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                        {new Date(ms.dueDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <ProgressBar
                      value={ms.progress}
                      size="sm"
                      color={ms.unlocked ? 'var(--color-done)' : 'var(--color-milestone)'}
                    />
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                      {ms.doneCount}/{ms.totalReq}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Blockers & Risks */}
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Blockers &amp; Risks</h2>
        {blockerTasks.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '12px 0' }}>
            No blocked or paused tasks.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {blockerTasks.map((bt) => (
            <div key={bt.id} style={blockerRowStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: bt.status === 'blocked' ? 'var(--color-blocked)' : 'var(--color-text-muted)',
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--color-text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {bt.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {bt.goalName}
                  </div>
                </div>
                <StatusBadge status={bt.status as TaskStatus} size="sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// === Styles ===

const containerStyle: React.CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto',
  padding: '24px',
  overflowY: 'auto',
  height: '100%',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  padding: '20px 24px',
  marginBottom: 16,
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: 'var(--color-text-primary)',
  margin: 0,
  lineHeight: 1.3,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--color-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  margin: 0,
};

const backButtonStyle: React.CSSProperties = {
  background: 'var(--color-bg-tertiary)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-secondary)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  padding: '6px 14px',
  borderRadius: 8,
};

const deptRowStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-tertiary)',
  borderRadius: 8,
  padding: '12px 14px',
};

const milestoneRowStyle: React.CSSProperties = {
  padding: '10px 0',
  borderBottom: '1px solid var(--color-bg-tertiary)',
};

const milestoneIconStyle = (unlocked: boolean): React.CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: unlocked ? 'rgba(34, 197, 94, 0.12)' : 'var(--color-bg-tertiary)',
  flexShrink: 0,
});

const blockerRowStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-tertiary)',
  borderRadius: 8,
  padding: '10px 14px',
};

export default ProjectDashboard;
