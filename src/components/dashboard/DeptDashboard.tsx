import React, { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { ProgressBar } from '../shared/ProgressBar';

interface DeptDashboardProps {
  departmentId: string;
  onSelectGoal: (goalId: string) => void;
  onBack: () => void;
}

export const DeptDashboard: React.FC<DeptDashboardProps> = ({
  departmentId,
  onSelectGoal,
  onBack,
}) => {
  const department = useStore((s) => s.departments.get(departmentId));
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const workers = useStore((s) => s.workers);
  const getGoalsForDepartment = useStore((s) => s.getGoalsForDepartment);
  const getTasksForGoal = useStore((s) => s.getTasksForGoal);
  const getMilestonesForGoal = useStore((s) => s.getMilestonesForGoal);

  const deptGoals = useMemo(
    () => getGoalsForDepartment(departmentId),
    [departmentId, getGoalsForDepartment],
  );

  // Sort goals by departmentPriority
  const sortedGoals = useMemo(
    () => [...deptGoals].sort((a, b) => a.departmentPriority - b.departmentPriority),
    [deptGoals],
  );

  // Workers in this department
  const deptWorkers = useMemo(() => {
    return (department?.workerIds ?? [])
      .map((id) => workers.get(id))
      .filter(Boolean)
      .map((w) => {
        const activeTask = w!.activeTaskId ? tasks.get(w!.activeTaskId) : null;
        return {
          id: w!.id,
          name: w!.name,
          isActive: w!.activeTaskId !== null,
          activeTaskName: activeTask?.name ?? null,
          availability: w!.availability,
        };
      });
  }, [department?.workerIds, workers, tasks]);

  const activeWorkerCount = deptWorkers.filter((w) => w.isActive).length;
  const totalWorkerCount = deptWorkers.length;
  const utilization = totalWorkerCount > 0 ? (activeWorkerCount / totalWorkerCount) * 100 : 0;

  // Goal card data
  const goalCards = useMemo(() => {
    return sortedGoals.map((goal) => {
      const goalTasks = getTasksForGoal(goal.id);
      const goalMilestones = getMilestonesForGoal(goal.id);
      const total = goalTasks.length;
      const completed = goalTasks.filter((t) => t.status === 'completed').length;
      const progress = total > 0 ? (completed / total) * 100 : 0;

      const workerIds = new Set<string>();
      for (const t of goalTasks) {
        for (const wId of t.assignedWorkerIds) {
          workerIds.add(wId);
        }
      }

      return {
        id: goal.id,
        name: goal.name,
        priority: goal.departmentPriority,
        progress,
        completed,
        total,
        workerCount: workerIds.size,
        milestoneCount: goalMilestones.length,
      };
    });
  }, [sortedGoals, getTasksForGoal, getMilestonesForGoal]);

  // Project contributions: projects that include this department
  const projectContributions = useMemo(() => {
    const results: { id: string; name: string; progress: number; completed: number; total: number }[] = [];
    for (const [, proj] of projects) {
      if (!proj.contributingDepartmentIds.includes(departmentId)) continue;
      // Gather all tasks from project goals that belong to this department
      const projGoalIds = new Set(proj.goalIds);
      let total = 0;
      let completed = 0;
      for (const goal of deptGoals) {
        if (!projGoalIds.has(goal.id)) continue;
        const goalTasks = getTasksForGoal(goal.id);
        for (const t of goalTasks) {
          if (t.contributingDepartmentId === departmentId) {
            total++;
            if (t.status === 'completed') completed++;
          }
        }
      }
      results.push({
        id: proj.id,
        name: proj.name,
        progress: total > 0 ? (completed / total) * 100 : 0,
        completed,
        total,
      });
    }
    return results;
  }, [projects, departmentId, deptGoals, getTasksForGoal]);

  if (!department) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <span style={{ color: 'var(--color-text-muted)' }}>Department not found.</span>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Back button */}
      <div style={{ marginBottom: 8 }}>
        <button onClick={onBack} style={backButtonStyle}>
          ← Back
        </button>
      </div>

      {/* Header */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={titleStyle}>{department.name}</h1>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
              Head: {department.headName}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Workers: <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{activeWorkerCount}</span>
              <span style={{ color: 'var(--color-text-muted)' }}> / {totalWorkerCount}</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
              Utilization
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              {Math.round(utilization)}%
            </span>
          </div>
          <ProgressBar
            value={utilization}
            size="md"
            color={utilization >= 80 ? 'var(--color-done)' : utilization >= 50 ? 'var(--color-accent)' : 'var(--color-text-muted)'}
          />
        </div>
      </div>

      {/* Main content: two columns */}
      <div style={columnsStyle}>
        {/* Left column: Goals (~60%) */}
        <div style={{ flex: '1 1 60%', minWidth: 0 }}>
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>Goals ({goalCards.length})</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
              {goalCards.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '8px 0' }}>
                  No goals assigned.
                </div>
              )}
              {goalCards.map((goal) => (
                <div key={goal.id} style={goalCardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={priorityNumStyle}>{goal.priority}</div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {goal.name}
                    </span>
                  </div>
                  <ProgressBar value={goal.progress} size="sm" showLabel />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={metaLabelStyle}>
                        {goal.workerCount} worker{goal.workerCount !== 1 ? 's' : ''}
                      </span>
                      <span style={metaLabelStyle}>
                        {goal.milestoneCount} milestone{goal.milestoneCount !== 1 ? 's' : ''}
                      </span>
                      <span style={metaLabelStyle}>
                        {goal.completed}/{goal.total} tasks
                      </span>
                    </div>
                    <button
                      onClick={() => onSelectGoal(goal.id)}
                      style={viewTreeButtonStyle}
                    >
                      View Tree
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Project Contributions */}
          {projectContributions.length > 0 && (
            <div style={cardStyle}>
              <h2 style={sectionTitleStyle}>Project Contributions</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                {projectContributions.map((proj) => (
                  <div key={proj.id} style={projectRowStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {proj.name}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                        {proj.completed}/{proj.total} tasks
                      </span>
                    </div>
                    <ProgressBar value={proj.progress} size="sm" showLabel />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Workers (~40%) */}
        <div style={{ flex: '1 1 40%', minWidth: 0 }}>
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>Workers ({deptWorkers.length})</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
              {deptWorkers.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '8px 0' }}>
                  No workers in this department.
                </div>
              )}
              {deptWorkers.map((w) => (
                <div key={w.id} style={workerRowStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <div style={availabilityDotStyle(w.isActive)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {w.name}
                      </div>
                      <div style={{
                        fontSize: 11,
                        color: w.isActive ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {w.activeTaskName ?? 'Idle'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
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

const columnsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'flex-start',
};

const goalCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-tertiary)',
  borderRadius: 8,
  padding: '14px 16px',
};

const priorityNumStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border)',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--color-accent)',
  flexShrink: 0,
};

const metaLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--color-text-muted)',
};

const viewTreeButtonStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--color-accent)',
  color: 'var(--color-accent)',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  padding: '4px 12px',
  borderRadius: 6,
};

const workerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 10px',
  borderRadius: 8,
  backgroundColor: 'var(--color-bg-tertiary)',
};

const availabilityDotStyle = (isActive: boolean): React.CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  backgroundColor: isActive ? 'var(--color-done)' : 'var(--color-text-muted)',
  flexShrink: 0,
});

const projectRowStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-tertiary)',
  borderRadius: 8,
  padding: '12px 14px',
};

export default DeptDashboard;
