import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import type { Task, Goal } from '../../types';
import { getStatusColor } from '../../types';

interface CrossViewProps {
  onSelectGoal?: (goalId: string) => void;
  onBack?: () => void;
}

interface CellData {
  deptId: string;
  projId: string;
  tasks: Task[];
  goals: Goal[];
  completedCount: number;
  totalCount: number;
  progress: number;
  maxPriority: string;
  maxProjectPriority: string;
}

export function CrossView({ onSelectGoal, onBack }: CrossViewProps) {
  const departmentsMap = useStore((s) => s.departments);
  const projectsMap = useStore((s) => s.projects);
  const tasksMap = useStore((s) => s.tasks);
  const goalsMap = useStore((s) => s.goals);

  const cellData = useMemo(() => {
    const cells = new Map<string, CellData>();

    for (const dept of departmentsMap.values()) {
      for (const proj of projectsMap.values()) {
        if (proj.status !== 'active') continue;

        const key = `${dept.id}|${proj.id}`;
        const deptGoals = dept.goalIds.map((id) => goalsMap.get(id)).filter(Boolean) as Goal[];
        const projGoals = proj.goalIds.map((id) => goalsMap.get(id)).filter(Boolean) as Goal[];
        const crossGoals = [...deptGoals, ...projGoals].filter(
          (g, i, arr) => arr.findIndex((x) => x.id === g.id) === i,
        );

        const tasks: Task[] = [];
        let completedCount = 0;

        for (const goal of crossGoals) {
          for (const taskId of goal.taskIds) {
            const task = tasksMap.get(taskId);
            if (!task || task.archived) continue;

            const projectIds = task.relatedProjectIds ?? [];
            const deptIds = task.relatedDepartmentIds ?? [];
            const goal_ = goalsMap.get(task.goalId);
            const goalProjId = goal_?.projectId;
            const goalDeptId = goal_?.departmentId;

            const isRelated =
              projectIds.includes(proj.id) ||
              deptIds.includes(dept.id) ||
              goalProjId === proj.id ||
              goalDeptId === dept.id;

            if (isRelated) {
              tasks.push(task);
              if (task.status === 'completed') completedCount++;
            }
          }
        }

        if (tasks.length > 0) {
          cells.set(key, {
            deptId: dept.id,
            projId: proj.id,
            tasks,
            goals: crossGoals,
            completedCount,
            totalCount: tasks.length,
            progress: tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0,
            maxPriority: proj.strategicPriority ?? 'P2',
            maxProjectPriority: proj.strategicPriority ?? 'P2',
          });
        }
      }
    }

    return cells;
  }, [departmentsMap, projectsMap, tasksMap, goalsMap]);

  const departments = useMemo(
    () =>
      Array.from(departmentsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    [departmentsMap],
  );

  const projects = useMemo(
    () =>
      Array.from(projectsMap.values())
        .filter((p) => p.status === 'active')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [projectsMap],
  );

  const getCell = (deptId: string, projId: string) => cellData.get(`${deptId}|${projId}`);

  const priorityColor = (p: string) => {
    switch (p) {
      case 'P1': return '#ef4444';
      case 'P2': return '#f59e0b';
      case 'P3': return '#22c55e';
      default: return '#6b7280';
    }
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                padding: '6px 12px', borderRadius: 6, border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)',
                fontSize: 12, cursor: 'pointer',
              }}
            >
              ← Back
            </button>
          )}
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Cross-View Matrix
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
              Department × Project contribution matrix — tasks and progress by intersection
            </div>
          </div>
        </div>

        {/* Matrix table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 800 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, position: 'sticky', left: 0, zIndex: 2, backgroundColor: 'var(--color-bg-secondary)' }}>
                  Dept \ Project
                </th>
                {projects.map((proj) => (
                  <th key={proj.id} style={thStyle}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{proj.name}</div>
                    <div style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 4,
                      backgroundColor: `${priorityColor(proj.strategicPriority ?? 'P2')}20`,
                      color: priorityColor(proj.strategicPriority ?? 'P2'),
                      display: 'inline-block', fontWeight: 600,
                    }}>
                      {proj.strategicPriority ?? 'P2'}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {departments.map((dept) => (
                <tr key={dept.id}>
                  <td style={{ ...thStyle, position: 'sticky', left: 0, zIndex: 1, backgroundColor: 'var(--color-bg-secondary)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{dept.name}</div>
                    <div style={{ fontSize: 9, marginTop: 2 }}>
                      <span style={{
                        padding: '1px 4px', borderRadius: 3,
                        backgroundColor: `${priorityColor(dept.priority ?? 'P2')}20`,
                        color: priorityColor(dept.priority ?? 'P2'),
                        fontWeight: 600,
                      }}>
                        {dept.priority ?? 'P2'}
                      </span>
                    </div>
                  </td>
                  {projects.map((proj) => {
                    const cell = getCell(dept.id, proj.id);
                    return (
                      <td key={proj.id} style={tdStyle}>
                        {cell ? (
                          <div
                            style={{
                              padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                              backgroundColor: 'var(--color-bg-tertiary)',
                              border: '1px solid var(--color-border)',
                              transition: 'all 0.15s',
                              minWidth: 100,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = 'var(--color-accent)';
                              e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = 'var(--color-border)';
                              e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
                            }}
                          >
                            {/* Task count + priority badge */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                                {cell.totalCount} task{cell.totalCount !== 1 ? 's' : ''}
                              </span>
                              {cell.maxProjectPriority !== 'P3' && (
                                <span style={{
                                  fontSize: 9, padding: '1px 4px', borderRadius: 3, fontWeight: 600,
                                  backgroundColor: `${priorityColor(cell.maxProjectPriority)}20`,
                                  color: priorityColor(cell.maxProjectPriority),
                                }}>
                                  {cell.maxProjectPriority}
                                </span>
                              )}
                            </div>

                            {/* Progress bar */}
                            <div style={{ height: 4, borderRadius: 2, backgroundColor: 'var(--color-bg-primary)', marginBottom: 6 }}>
                              <div style={{
                                height: '100%', borderRadius: 2,
                                width: `${cell.progress}%`,
                                backgroundColor: getStatusColor('completed'),
                                transition: 'width 0.3s',
                              }} />
                            </div>

                            {/* Stats */}
                            <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--color-text-muted)' }}>
                              <span>✓ {cell.completedCount}</span>
                              <span>→ {cell.totalCount - cell.completedCount}</span>
                              <span style={{ marginLeft: 'auto', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                                {cell.progress}%
                              </span>
                            </div>

                            {/* Goal links */}
                            {cell.goals.length > 0 && (
                              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                {cell.goals.slice(0, 3).map((g) => (
                                  <span
                                    key={g.id}
                                    onClick={(e) => { e.stopPropagation(); onSelectGoal?.(g.id); }}
                                    style={{
                                      fontSize: 9, padding: '1px 5px', borderRadius: 3,
                                      backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-secondary)',
                                      cursor: 'pointer',
                                    }}
                                    title={`Goal: ${g.name}`}
                                  >
                                    {g.name}
                                  </span>
                                ))}
                                {cell.goals.length > 3 && (
                                  <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>
                                    +{cell.goals.length - 3} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{
                            padding: '8px 10px', textAlign: 'center',
                            color: 'var(--color-text-muted)', fontSize: 11, opacity: 0.5,
                          }}>
                            —
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div style={{ marginTop: 24, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Priority:</span>
          {['P1', 'P2', 'P3'].map((p) => (
            <span key={p} style={{
              fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
              backgroundColor: `${priorityColor(p)}20`, color: priorityColor(p),
            }}>
              {p}
            </span>
          ))}
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 8 }}>Stats:</span>
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>✓ completed</span>
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>→ remaining</span>
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>% progress</span>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-secondary)',
  color: 'var(--color-text-secondary)',
  fontSize: 12,
  fontWeight: 500,
  verticalAlign: 'bottom',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid var(--color-bg-tertiary)',
  verticalAlign: 'top',
};
