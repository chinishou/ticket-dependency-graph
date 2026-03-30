import { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { getStatusColor, getStatusLabel, getEtaDays } from '../../types';
import type { Worker, Task } from '../../types';
import { computeTaskPriorities, getPriorityLabel, getPriorityColor } from '../../utils/priorityCalc';

interface WorkerViewProps {
  onSelectGoal?: (goalId: string) => void;
}

export function WorkerView({ onSelectGoal }: WorkerViewProps) {
  const workersMap = useStore((s) => s.workers);
  const tasksMap = useStore((s) => s.tasks);
  const goalsMap = useStore((s) => s.goals);
  const milestonesMap = useStore((s) => s.milestones);
  const departmentsMap = useStore((s) => s.departments);
  const setSelectedTask = useStore((s) => s.setSelectedTask);

  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [filterDept, setFilterDept] = useState<string>('all');

  const workers = useMemo(() => Array.from(workersMap.values()), [workersMap]);
  const departments = useMemo(() => Array.from(departmentsMap.values()), [departmentsMap]);

  const priorities = useMemo(
    () => computeTaskPriorities({ tasks: tasksMap, milestones: milestonesMap, goals: goalsMap, departments: departmentsMap }),
    [tasksMap, milestonesMap, goalsMap, departmentsMap],
  );

  const filteredWorkers = useMemo(() => {
    if (filterDept === 'all') return workers;
    return workers.filter((w) => w.departmentId === filterDept);
  }, [workers, filterDept]);

  // Group workers by department
  const workersByDept = useMemo(() => {
    const groups = new Map<string, Worker[]>();
    for (const w of filteredWorkers) {
      const existing = groups.get(w.departmentId) || [];
      existing.push(w);
      groups.set(w.departmentId, existing);
    }
    return groups;
  }, [filteredWorkers]);

  const selectedWorker = selectedWorkerId ? workersMap.get(selectedWorkerId) : null;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Left: Worker list */}
      <div style={{
        width: 280, flexShrink: 0, borderRight: '1px solid var(--color-border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Filter toolbar */}
        <div style={{
          padding: '10px 12px', borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Department:</span>
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            style={{
              flex: 1, padding: '4px 8px', borderRadius: 4, fontSize: 11,
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
            }}
          >
            <option value="all">All ({workers.length})</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.workerIds.length})</option>
            ))}
          </select>
        </div>

        {/* Worker list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {Array.from(workersByDept.entries()).map(([deptId, deptWorkers]) => {
            const dept = departmentsMap.get(deptId);
            return (
              <div key={deptId}>
                <div style={{
                  padding: '8px 12px', fontSize: 10, fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderBottom: '1px solid var(--color-bg-tertiary)',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {dept?.name || deptId}
                </div>
                {deptWorkers.map((worker) => (
                  <WorkerListItem
                    key={worker.id}
                    worker={worker}
                    activeTasks={worker.activeTaskIds.map((id) => tasksMap.get(id)).filter(Boolean) as Task[]}
                    isSelected={selectedWorkerId === worker.id}
                    onClick={() => setSelectedWorkerId(worker.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Worker detail */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {selectedWorker ? (
          <WorkerDetail
            worker={selectedWorker}
            tasksMap={tasksMap}
            goalsMap={goalsMap}
            priorities={priorities}
            departmentsMap={departmentsMap}
            onSelectTask={setSelectedTask}
            onSelectGoal={onSelectGoal}
          />
        ) : (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-text-muted)', fontSize: 14,
          }}>
            Select a worker to view details
          </div>
        )}
      </div>
    </div>
  );
}

// --- Worker list item ---

function WorkerListItem({
  worker, activeTasks, isSelected, onClick,
}: {
  worker: Worker;
  activeTasks: Task[];
  isSelected: boolean;
  onClick: () => void;
}) {
  const availColor = worker.availability === 'full' ? '#22c55e'
    : worker.availability === 'partial' ? '#f59e0b' : '#6b7280';

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px', cursor: 'pointer',
        borderBottom: '1px solid var(--color-bg-tertiary)',
        backgroundColor: isSelected ? 'var(--color-bg-tertiary)' : 'transparent',
        transition: 'background-color 0.15s',
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)'; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        {/* Avatar circle */}
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          backgroundColor: 'var(--color-bg-tertiary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)',
          border: `2px solid ${availColor}`,
          flexShrink: 0,
        }}>
          {worker.name.split(' ').map((n) => n[0]).join('')}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {worker.name}
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
            {worker.assignedTaskIds.length} task{worker.assignedTaskIds.length !== 1 ? 's' : ''} assigned
          </div>
        </div>
      </div>
      {activeTasks.length > 0 && (
        <div style={{ marginLeft: 36, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {activeTasks.map((t) => (
            <div key={t.id} style={{
              padding: '3px 8px', borderRadius: 4,
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              fontSize: 10, color: 'var(--color-in-progress)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {t.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Worker detail ---

function WorkerDetail({
  worker, tasksMap, goalsMap, priorities, departmentsMap, onSelectTask, onSelectGoal,
}: {
  worker: Worker;
  tasksMap: Map<string, Task>;
  goalsMap: Map<string, import('../../types').Goal>;
  priorities: Map<string, import('../../utils/priorityCalc').TaskPriority>;
  departmentsMap: Map<string, import('../../types').Department>;
  onSelectTask: (id: string | null) => void;
  onSelectGoal?: (goalId: string) => void;
}) {
  const dept = departmentsMap.get(worker.departmentId);
  const activeTasks = worker.activeTaskIds
    .map((id) => tasksMap.get(id))
    .filter(Boolean) as Task[];

  const activeTaskIdSet = new Set(worker.activeTaskIds);

  // Queue: assigned tasks excluding active ones
  const queueTasks = worker.assignedTaskIds
    .filter((id) => !activeTaskIdSet.has(id))
    .map((id) => tasksMap.get(id))
    .filter(Boolean) as Task[];

  // Sort queue by priority score
  queueTasks.sort((a, b) => (priorities.get(b.id)?.score ?? 0) - (priorities.get(a.id)?.score ?? 0));

  // "This unlocks" — tasks directly unlocked by any active task
  const unlockedTaskIds = new Set<string>();
  for (const at of activeTasks) {
    for (const uid of at.unlocksTaskIds) unlockedTaskIds.add(uid);
  }
  // Remove active tasks themselves from unlocks
  for (const id of activeTaskIdSet) unlockedTaskIds.delete(id);
  const unlockedTasks = Array.from(unlockedTaskIds)
    .map((id) => tasksMap.get(id))
    .filter(Boolean) as Task[];

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
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
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>
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

      {/* Active Tasks */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Active Tasks ({activeTasks.length})
        </div>
        {activeTasks.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeTasks.map((at) => (
              <ActiveTaskCard
                key={at.id}
                task={at}
                goal={goalsMap.get(at.goalId)}
                priority={priorities.get(at.id)}
                workerCount={at.assignedWorkerIds.length}
                onClick={() => onSelectTask(at.id)}
                onGoalClick={onSelectGoal}
              />
            ))}
          </div>
        ) : (
          <div style={{
            padding: 16, borderRadius: 8,
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px dashed var(--color-border)',
            color: 'var(--color-text-muted)', fontSize: 12, textAlign: 'center',
          }}>
            No active tasks
          </div>
        )}
      </div>

      {/* This Unlocks */}
      {activeTasks.length > 0 && unlockedTasks.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            This Unlocks
          </div>
          <div style={{
            borderRadius: 8, border: '1px solid var(--color-border)',
            overflow: 'hidden',
          }}>
            {unlockedTasks.map((t, i) => {
              const pri = priorities.get(t.id);
              return (
                <div
                  key={t.id}
                  onClick={() => onSelectTask(t.id)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 10,
                    borderBottom: i < unlockedTasks.length - 1 ? '1px solid var(--color-bg-tertiary)' : 'none',
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
                      {getStatusLabel(t.status)} &middot; {t.baseDurationDays}d
                    </div>
                  </div>
                  {pri && (
                    <span style={{
                      fontSize: 9, padding: '2px 6px', borderRadius: 4,
                      backgroundColor: `${getPriorityColor(pri.score)}20`,
                      color: getPriorityColor(pri.score),
                      fontWeight: 600,
                    }}>
                      {pri.score}
                    </span>
                  )}
                  <svg width="12" height="12" viewBox="0 0 12 12" style={{ flexShrink: 0, opacity: 0.4 }}>
                    <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  </svg>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Task Queue */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Task Queue ({queueTasks.length})
        </div>
        {queueTasks.length > 0 ? (
          <div style={{
            borderRadius: 8, border: '1px solid var(--color-border)',
            overflow: 'hidden',
          }}>
            {queueTasks.map((task, i) => {
              const goal = goalsMap.get(task.goalId);
              const pri = priorities.get(task.id);
              return (
                <div
                  key={task.id}
                  onClick={() => onSelectTask(task.id)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 10,
                    borderBottom: i < queueTasks.length - 1 ? '1px solid var(--color-bg-tertiary)' : 'none',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
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
                      fontSize: 12, color: 'var(--color-text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {task.name}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                      {goal?.name || 'Unassigned'} &middot; {getStatusLabel(task.status)} &middot; {task.baseDurationDays}d
                    </div>
                  </div>
                  {pri && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span style={{
                        fontSize: 9, padding: '2px 6px', borderRadius: 4,
                        backgroundColor: `${getPriorityColor(pri.score)}20`,
                        color: getPriorityColor(pri.score),
                        fontWeight: 600,
                      }}>
                        {getPriorityLabel(pri.score)}
                      </span>
                      {pri.criticalPath && (
                        <span style={{ fontSize: 8, color: '#ef4444', fontWeight: 600 }}>
                          CRITICAL PATH
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            padding: 16, borderRadius: 8,
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px dashed var(--color-border)',
            color: 'var(--color-text-muted)', fontSize: 12, textAlign: 'center',
          }}>
            No queued tasks
          </div>
        )}
      </div>
    </div>
  );
}

// --- Active task card ---

function ActiveTaskCard({
  task, goal, priority, workerCount, onClick, onGoalClick,
}: {
  task: Task;
  goal?: import('../../types').Goal;
  priority?: import('../../utils/priorityCalc').TaskPriority;
  workerCount: number;
  onClick: () => void;
  onGoalClick?: (goalId: string) => void;
}) {
  const eta = getEtaDays(task, workerCount);
  const pri = priority;

  return (
    <div
      onClick={onClick}
      style={{
        padding: 16, borderRadius: 8, cursor: 'pointer',
        backgroundColor: 'var(--color-bg-secondary)',
        border: `1px solid ${getStatusColor(task.status)}40`,
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = getStatusColor(task.status);
        e.currentTarget.style.boxShadow = `0 0 12px ${getStatusColor(task.status)}30`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = `${getStatusColor(task.status)}40`;
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {task.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {task.ticketId && <span style={{ marginRight: 8 }}>{task.ticketId}</span>}
            {goal && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onGoalClick?.(goal.id);
                }}
                style={{ cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
              >
                {goal.name}
              </span>
            )}
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 12,
          backgroundColor: `${getStatusColor(task.status)}20`,
          color: getStatusColor(task.status),
          fontSize: 10, fontWeight: 600,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            backgroundColor: getStatusColor(task.status),
          }} />
          {getStatusLabel(task.status)}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
        {task.description}
      </div>

      {/* Progress bar for in-progress tasks */}
      {task.status === 'in_progress' && task.startedAt && (
        <div style={{ marginBottom: 12 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', fontSize: 10,
            color: 'var(--color-text-muted)', marginBottom: 4,
          }}>
            <span>Started {new Date(task.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <span>~{eta}d remaining</span>
          </div>
          <div style={{
            height: 4, borderRadius: 2, backgroundColor: 'var(--color-bg-tertiary)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              backgroundColor: getStatusColor(task.status),
              width: `${Math.min(100, Math.max(5, ((Date.now() - new Date(task.startedAt).getTime()) / (eta * 24 * 60 * 60 * 1000)) * 100))}%`,
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
        <div>
          <span style={{ color: 'var(--color-text-muted)' }}>Workers: </span>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{workerCount}</span>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-muted)' }}>Duration: </span>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{task.baseDurationDays}d</span>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-muted)' }}>ETA: </span>
          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{eta}d</span>
        </div>
        {pri && (
          <div>
            <span style={{ color: 'var(--color-text-muted)' }}>Priority: </span>
            <span style={{ color: getPriorityColor(pri.score), fontWeight: 600 }}>
              {getPriorityLabel(pri.score)} ({pri.score})
            </span>
          </div>
        )}
      </div>

    </div>
  );
}
