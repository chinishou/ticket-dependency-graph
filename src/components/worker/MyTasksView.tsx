import { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import type { Task } from '../../types';
import { getStatusColor, getStatusLabel, getEtaDays } from '../../types';
import { computeTaskPriorities, getPriorityLabel, getPriorityColor } from '../../utils/priorityCalc';

interface MyTasksViewProps {
  onSelectGoal?: (goalId: string) => void;
  onSelectTask?: (taskId: string) => void;
}

export function MyTasksView({ onSelectGoal, onSelectTask }: MyTasksViewProps) {
  const userWorkerId = useStore((s) => s.userWorkerId);
  const setUserWorkerId = useStore((s) => s.setUserWorkerId);
  const workersMap = useStore((s) => s.workers);
  const tasksMap = useStore((s) => s.tasks);
  const goalsMap = useStore((s) => s.goals);
  const departmentsMap = useStore((s) => s.departments);
  const projectsMap = useStore((s) => s.projects);
  const milestonesMap = useStore((s) => s.milestones);
  const updateTask = useStore((s) => s.updateTask);
  const getProjectForGoal = useStore((s) => s.getProjectForGoal);
  const calibrationWeights = useStore((s) => s.calibrationWeights);

  const [filterProject, setFilterProject] = useState<string>('');
  const [filterDept, setFilterDept] = useState<string>('');

  const priorities = useMemo(
    () => computeTaskPriorities({ tasks: tasksMap, milestones: milestonesMap, goals: goalsMap, departments: departmentsMap, projects: projectsMap, weights: calibrationWeights }),
    [tasksMap, milestonesMap, goalsMap, departmentsMap, projectsMap, calibrationWeights],
  );

  const worker = userWorkerId ? workersMap.get(userWorkerId) : null;
  const dept = worker ? departmentsMap.get(worker.departmentId) : null;

  // Worker picker when not linked (shouldn't normally happen since LoginPage sets workerId)
  if (!worker) {
    return <WorkerPicker workersMap={workersMap} departmentsMap={departmentsMap} onSelect={setUserWorkerId} />;
  }

  const activeTasks = (worker.activeTaskIds ?? [])
    .map((id) => tasksMap.get(id))
    .filter((t): t is Task => !!t && !t.archived);

  const activeTaskIdSet = new Set(worker.activeTaskIds ?? []);

  // Queue: assigned but not active, excluding archived
  const queueTasks = (worker.assignedTaskIds ?? [])
    .filter((id) => !activeTaskIdSet.has(id))
    .map((id) => tasksMap.get(id))
    .filter((t): t is Task => !!t && !t.archived);
  queueTasks.sort((a, b) => (priorities.get(b.id)?.score ?? 0) - (priorities.get(a.id)?.score ?? 0));

  // Up Next: top 5 from queue
  const upNextTasks = queueTasks.slice(0, 5);

  // Unlocked by active tasks (exclude archived)
  const unlockedTaskIds = new Set<string>();
  for (const at of activeTasks) {
    for (const uid of at.unlocksTaskIds) unlockedTaskIds.add(uid);
  }
  for (const id of activeTaskIdSet) unlockedTaskIds.delete(id);
  const unlockedTasks = Array.from(unlockedTaskIds)
    .map((id) => tasksMap.get(id))
    .filter((t): t is Task => !!t && !t.archived);

  const handleStatusChange = (taskId: string, status: 'in_progress' | 'paused' | 'completed') => {
    const updates: Partial<Task> = { status };
    if (status === 'in_progress') updates.startedAt = new Date().toISOString();
    if (status === 'completed') updates.completedAt = new Date().toISOString();
    updateTask(taskId, updates);
  };

  const taskMatchesFilter = (task: Task): boolean => {
    if (!filterProject && !filterDept) return true;
    const projectIds = task.relatedProjectIds ?? [];
    const deptIds = task.relatedDepartmentIds ?? [];
    const goal = goalsMap.get(task.goalId);
    const goalProjectId = goal?.projectId;
    const goalDeptId = goal?.departmentId;
    const matchesProject = !filterProject || projectIds.includes(filterProject) || goalProjectId === filterProject;
    const matchesDept = !filterDept || deptIds.includes(filterDept) || goalDeptId === filterDept;
    return matchesProject && matchesDept;
  };

  const filteredActiveTasks = activeTasks.filter(taskMatchesFilter);
  const filteredUpNextTasks = upNextTasks.filter(taskMatchesFilter);
  const filteredUnlockedTasks = unlockedTasks.filter(taskMatchesFilter);
  const filteredQueueTasks = queueTasks.filter(taskMatchesFilter);

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              backgroundColor: 'var(--color-bg-tertiary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 600, color: 'var(--color-text-secondary)',
              border: `3px solid ${worker.availability === 'full' ? '#22c55e' : worker.availability === 'partial' ? '#f59e0b' : '#6b7280'}`,
            }}>
              {worker.name.split(' ').map((n) => n[0]).join('')}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {worker.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                {dept?.name || worker.departmentId}
                <span style={{
                  marginLeft: 8, padding: '2px 6px', borderRadius: 4, fontSize: 10,
                  backgroundColor: worker.availability === 'full' ? 'rgba(34,197,94,0.15)'
                    : worker.availability === 'partial' ? 'rgba(245,158,11,0.15)' : 'rgba(107,114,128,0.15)',
                  color: worker.availability === 'full' ? '#22c55e'
                    : worker.availability === 'partial' ? '#f59e0b' : '#6b7280',
                }}>
                  {worker.availability}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        {(filterProject || filterDept) && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center', padding: '8px 12px', borderRadius: 8, backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Filtering by:</span>
            {filterProject && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 12, backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                📁 {projectsMap.get(filterProject)?.name ?? filterProject}
                <button onClick={() => setFilterProject('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 10, padding: 0 }}>✕</button>
              </span>
            )}
            {filterDept && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 12, backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                🏢 {departmentsMap.get(filterDept)?.name ?? filterDept}
                <button onClick={() => setFilterDept('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 10, padding: 0 }}>✕</button>
              </span>
            )}
            <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
              {filteredActiveTasks.length} of {activeTasks.length} active tasks
            </span>
          </div>
        )}

        {/* Project/Dept filter dropdowns */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 6, fontSize: 12,
              border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-secondary)', cursor: 'pointer',
            }}
          >
            <option value="">All Projects</option>
            {Array.from(projectsMap.values())
              .filter((p) => p.status === 'active')
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: 6, fontSize: 12,
              border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-secondary)', cursor: 'pointer',
            }}
          >
            <option value="">All Departments</option>
            {Array.from(departmentsMap.values())
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        {/* Active Tasks */}
        <section style={{ marginBottom: 32 }}>
          <SectionTitle>Active Tasks ({filteredActiveTasks.length})</SectionTitle>
          {filteredActiveTasks.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredActiveTasks.map((task) => {
                const goal = goalsMap.get(task.goalId);
                const project = getProjectForGoal(task.goalId);
                const pri = priorities.get(task.id);
                const eta = getEtaDays(task, task.assignedWorkerIds.length);
                return (
                  <div key={task.id} style={{
                    padding: 16, borderRadius: 10,
                    backgroundColor: 'var(--color-bg-secondary)',
                    border: `1px solid ${getStatusColor(task.status)}40`,
                    cursor: onSelectTask ? 'pointer' : 'default',
                  }}
                  onClick={() => onSelectTask?.(task.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{task.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                          {goal?.name || 'Unassigned'}
                          {task.ticketId && <span> &middot; {task.ticketId}</span>}
                        </div>
                        {project && (
                          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 1, opacity: 0.75 }}>
                            {project.name}
                          </div>
                        )}
                      </div>
                      {pri && (
                        <span style={{
                          fontSize: 10, padding: '2px 8px', borderRadius: 6, fontWeight: 600,
                          backgroundColor: `${getPriorityColor(pri.score)}20`,
                          color: getPriorityColor(pri.score),
                        }}>
                          {getPriorityLabel(pri.score)} ({pri.score})
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
                        {task.description.length > 150 ? task.description.slice(0, 150) + '...' : task.description}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11, color: 'var(--color-text-muted)' }}>
                      <span>ETA: {eta}d</span>
                      <span>&middot;</span>
                      <span>{task.assignedWorkerIds.length} worker{task.assignedWorkerIds.length !== 1 ? 's' : ''}</span>
                      {pri?.criticalPath && (
                        <>
                          <span>&middot;</span>
                          <span style={{ color: '#ef4444', fontWeight: 600 }}>CRITICAL PATH</span>
                        </>
                      )}
                    </div>
                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <ActionButton
                        label="Mark Complete"
                        color="#22c55e"
                        onClick={() => handleStatusChange(task.id, 'completed')}
                      />
                      <ActionButton
                        label="Pause"
                        color="#f59e0b"
                        onClick={() => handleStatusChange(task.id, 'paused')}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState text="No active tasks" />
          )}
        </section>

        {/* Up Next */}
        {filteredUpNextTasks.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <SectionTitle>Up Next</SectionTitle>
            <div style={{ borderRadius: 8, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
              {filteredUpNextTasks.map((task, i) => {
                const goal = goalsMap.get(task.goalId);
                const project = getProjectForGoal(task.goalId);
                const pri = priorities.get(task.id);
                const canStart = task.status === 'available' || task.status === 'paused';
                return (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask?.(task.id)}
                    style={{
                      padding: '12px 14px',
                      display: 'flex', alignItems: 'center', gap: 10,
                      borderBottom: i < filteredUpNextTasks.length - 1 ? '1px solid var(--color-bg-tertiary)' : 'none',
                      cursor: onSelectTask ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      backgroundColor: 'var(--color-bg-tertiary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', flexShrink: 0,
                    }}>
                      {i + 1}
                    </div>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      backgroundColor: getStatusColor(task.status), flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, color: 'var(--color-text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {task.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                        {goal?.name || 'Unassigned'} &middot; {getStatusLabel(task.status)} &middot; {task.baseDurationDays}d
                      </div>
                      {project && (
                        <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 1, opacity: 0.75 }}>
                          {project.name}
                        </div>
                      )}
                    </div>
                    {pri && (
                      <span style={{
                        fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                        backgroundColor: `${getPriorityColor(pri.score)}20`,
                        color: getPriorityColor(pri.score),
                      }}>
                        {pri.score}
                      </span>
                    )}
                    {canStart && (
                      <button
                        onClick={() => handleStatusChange(task.id, 'in_progress')}
                        style={{
                          padding: '4px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer',
                          border: '1px solid rgba(56, 189, 248, 0.4)',
                          backgroundColor: 'rgba(56, 189, 248, 0.1)',
                          color: '#38bdf8', fontWeight: 600, flexShrink: 0,
                        }}
                      >
                        Start
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Unlocks */}
        {filteredUnlockedTasks.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <SectionTitle>Your Active Work Unlocks</SectionTitle>
            <div style={{ borderRadius: 8, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
              {filteredUnlockedTasks.map((t, i) => {
                const pri = priorities.get(t.id);
                const goal = goalsMap.get(t.goalId);
                return (
                  <div
                    key={t.id}
                    onClick={() => onSelectTask ? onSelectTask(t.id) : onSelectGoal?.(t.goalId)}
                    style={{
                      padding: '10px 14px', cursor: onSelectTask || onSelectGoal ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', gap: 10,
                      borderBottom: i < filteredUnlockedTasks.length - 1 ? '1px solid var(--color-bg-tertiary)' : 'none',
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      backgroundColor: getStatusColor(t.status), flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, color: 'var(--color-text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {t.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                        {goal?.name || 'Unassigned'} &middot; {getStatusLabel(t.status)} &middot; {t.baseDurationDays}d
                      </div>
                    </div>
                    {pri && (
                      <span style={{
                        fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                        backgroundColor: `${getPriorityColor(pri.score)}20`,
                        color: getPriorityColor(pri.score),
                      }}>
                        {pri.score}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Full Queue (collapsible) */}
        <FullQueue
          tasks={filteredQueueTasks}
          goalsMap={goalsMap}
          priorities={priorities}
          onSelectTask={onSelectTask}
        />
      </div>
    </div>
  );
}

// --- Sub-components ---

function WorkerPicker({
  workersMap,
  departmentsMap,
  onSelect,
}: {
  workersMap: Map<string, import('../../types').Worker>;
  departmentsMap: Map<string, import('../../types').Department>;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const workers = Array.from(workersMap.values());
  const filtered = workers.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Group by department
  const byDept = new Map<string, typeof filtered>();
  for (const w of filtered) {
    const group = byDept.get(w.departmentId) || [];
    group.push(w);
    byDept.set(w.departmentId, group);
  }

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{
        width: 400, padding: 32, borderRadius: 12,
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
          Who are you?
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
          Select your worker profile to see your tasks
        </div>
        <input
          type="text"
          placeholder="Search workers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 6,
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-primary)', fontSize: 13,
            outline: 'none', marginBottom: 12, boxSizing: 'border-box',
          }}
        />
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {Array.from(byDept.entries()).map(([deptId, deptWorkers]) => {
            const dept = departmentsMap.get(deptId);
            return (
              <div key={deptId} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  {dept?.name || deptId}
                </div>
                {deptWorkers.map((w) => (
                  <div
                    key={w.id}
                    onClick={() => onSelect(w.id)}
                    style={{
                      padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 10,
                      transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      backgroundColor: 'var(--color-bg-tertiary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
                    }}>
                      {w.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{w.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                        {(w.activeTaskIds?.length ?? 0)} active &middot; {(w.assignedTaskIds?.length ?? 0)} assigned
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 12 }}>
              No workers found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FullQueue({
  tasks,
  goalsMap,
  priorities,
  onSelectTask,
}: {
  tasks: Task[];
  goalsMap: Map<string, import('../../types').Goal>;
  priorities: Map<string, import('../../utils/priorityCalc').TaskPriority>;
  onSelectTask?: (taskId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (tasks.length === 0) return null;

  return (
    <section>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          marginBottom: 8,
        }}
      >
        <span style={{
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s', display: 'inline-block', fontSize: 10,
          color: 'var(--color-text-muted)',
        }}>
          ▶
        </span>
        <SectionTitle>Full Queue ({tasks.length})</SectionTitle>
      </div>
      {expanded && (
        <div style={{ borderRadius: 8, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          {tasks.map((task, i) => {
            const goal = goalsMap.get(task.goalId);
            const pri = priorities.get(task.id);
            return (
              <div
                key={task.id}
                onClick={() => onSelectTask?.(task.id)}
                style={{
                  padding: '8px 14px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  borderBottom: i < tasks.length - 1 ? '1px solid var(--color-bg-tertiary)' : 'none',
                  cursor: onSelectTask ? 'pointer' : 'default',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  backgroundColor: 'var(--color-bg-tertiary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 600, color: 'var(--color-text-muted)', flexShrink: 0,
                }}>
                  {i + 1}
                </div>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  backgroundColor: getStatusColor(task.status), flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, color: 'var(--color-text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {task.name}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                    {goal?.name || 'Unassigned'} &middot; {task.baseDurationDays}d
                  </div>
                </div>
                {pri && (
                  <span style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                    backgroundColor: `${getPriorityColor(pri.score)}20`,
                    color: getPriorityColor(pri.score),
                  }}>
                    {pri.score}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: 16, borderRadius: 8,
      backgroundColor: 'var(--color-bg-secondary)',
      border: '1px dashed var(--color-border)',
      color: 'var(--color-text-muted)', fontSize: 12, textAlign: 'center',
    }}>
      {text}
    </div>
  );
}

function ActionButton({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        padding: '6px 14px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
        border: `1px solid ${color}40`,
        backgroundColor: `${color}15`,
        color,
        transition: 'background-color 0.15s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${color}25`}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = `${color}15`}
    >
      {label}
    </button>
  );
}
