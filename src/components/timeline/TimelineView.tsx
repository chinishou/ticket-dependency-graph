import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { getStatusColor } from '../../types';
import type { Task, Milestone, Goal } from '../../types';

// --- Date math helpers ---

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatShort(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// --- Compute timeline schedule from task data ---

interface ScheduledTask {
  task: Task;
  startDate: Date;
  endDate: Date;
  goalId: string;
}

interface ScheduledMilestone {
  milestone: Milestone;
  date: Date;
  goalId: string;
}

function computeSchedule(
  tasks: Task[],
  milestones: Milestone[],
  goals: Map<string, Goal>,
): { scheduledTasks: ScheduledTask[]; scheduledMilestones: ScheduledMilestone[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build task end-date map for dependency resolution
  const taskEndDates = new Map<string, Date>();
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  // First pass: compute dates for tasks with explicit dates
  for (const task of tasks) {
    if (task.completedAt) {
      taskEndDates.set(task.id, new Date(task.completedAt));
    } else if (task.startedAt) {
      taskEndDates.set(task.id, addDays(new Date(task.startedAt), task.baseDurationDays));
    }
  }

  // Multi-pass: resolve tasks without dates by looking at dependency end dates
  let changed = true;
  let passes = 0;
  while (changed && passes < 10) {
    changed = false;
    passes++;
    for (const task of tasks) {
      if (taskEndDates.has(task.id)) continue;

      // Find the latest dependency end date
      let latestDepEnd: Date | null = null;
      let allDepsResolved = true;
      for (const depId of task.dependsOnTaskIds) {
        const depEnd = taskEndDates.get(depId);
        if (depEnd) {
          if (!latestDepEnd || depEnd > latestDepEnd) latestDepEnd = depEnd;
        } else {
          allDepsResolved = false;
        }
      }

      if (allDepsResolved) {
        const start = latestDepEnd ? addDays(latestDepEnd, 1) : today;
        const end = addDays(start, task.baseDurationDays);
        taskEndDates.set(task.id, end);
        changed = true;
      }
    }
  }

  // Build scheduled tasks
  const scheduledTasks: ScheduledTask[] = [];
  for (const task of tasks) {
    let startDate: Date;
    let endDate: Date;

    if (task.startedAt) {
      startDate = new Date(task.startedAt);
    } else {
      // Compute from deps
      let latestDepEnd: Date | null = null;
      for (const depId of task.dependsOnTaskIds) {
        const depEnd = taskEndDates.get(depId);
        if (depEnd && (!latestDepEnd || depEnd > latestDepEnd)) latestDepEnd = depEnd;
      }
      startDate = latestDepEnd ? addDays(latestDepEnd, 1) : today;
    }

    if (task.completedAt) {
      endDate = new Date(task.completedAt);
    } else {
      endDate = addDays(startDate, task.baseDurationDays);
    }

    // Find which goal this task belongs to
    const goalId = task.goalId;

    scheduledTasks.push({ task, startDate, endDate, goalId });
  }

  // Build scheduled milestones
  const scheduledMilestones: ScheduledMilestone[] = [];
  for (const ms of milestones) {
    let date: Date | null = null;
    if (ms.unlockedAt) {
      date = new Date(ms.unlockedAt);
    } else if (ms.dueDate) {
      date = new Date(ms.dueDate);
    }
    if (!date) continue;

    // Find goalId
    let goalId = '';
    if (ms.parentType === 'goal') {
      goalId = ms.parentId;
    } else {
      // Project milestone — find a matching goal or use project ID
      goalId = `project:${ms.parentId}`;
    }
    scheduledMilestones.push({ milestone: ms, date, goalId });
  }

  return { scheduledTasks, scheduledMilestones };
}

// --- Grouping ---

type GroupBy = 'goal' | 'department';

interface TimelineGroup {
  id: string;
  label: string;
  color: string;
  tasks: ScheduledTask[];
  milestones: ScheduledMilestone[];
}

const GROUP_COLORS = [
  '#6366f1', '#a78bfa', '#38bdf8', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6',
];

// --- Component ---

const ROW_HEIGHT = 32;
const GROUP_HEADER_HEIGHT = 34;
const HEADER_HEIGHT = 50;
const DAY_WIDTH = 14;
const LEFT_PANEL_WIDTH = 200;

interface TimelineViewProps {
  onSelectGoal?: (goalId: string) => void;
}

export function TimelineView({ onSelectGoal }: TimelineViewProps) {
  const tasksMap = useStore((s) => s.tasks);
  const milestonesMap = useStore((s) => s.milestones);
  const goalsMap = useStore((s) => s.goals);
  const departmentsMap = useStore((s) => s.departments);
  const projectsMap = useStore((s) => s.projects);
  const setSelectedTask = useStore((s) => s.setSelectedTask);

  const [groupBy, setGroupBy] = useState<GroupBy>('goal');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);

  const allTasks = useMemo(
    () => Array.from(tasksMap.values()).filter((t) => !t.unplaced && !t.archived),
    [tasksMap],
  );
  const allMilestones = useMemo(() => Array.from(milestonesMap.values()), [milestonesMap]);

  const { scheduledTasks, scheduledMilestones } = useMemo(
    () => computeSchedule(allTasks, allMilestones, goalsMap),
    [allTasks, allMilestones, goalsMap],
  );

  // Compute time range
  const { minDate, maxDate, totalDays } = useMemo(() => {
    let min = new Date();
    let max = new Date();
    for (const st of scheduledTasks) {
      if (st.startDate < min) min = new Date(st.startDate);
      if (st.endDate > max) max = new Date(st.endDate);
    }
    for (const sm of scheduledMilestones) {
      if (sm.date < min) min = new Date(sm.date);
      if (sm.date > max) max = new Date(sm.date);
    }
    // Pad by 2 weeks on each side
    min = addDays(startOfMonth(min), -7);
    max = addDays(max, 21);
    return { minDate: min, maxDate: max, totalDays: daysBetween(min, max) };
  }, [scheduledTasks, scheduledMilestones]);

  // Build month markers
  const months = useMemo(() => {
    const result: { date: Date; x: number; width: number }[] = [];
    let current = startOfMonth(minDate);
    while (current < maxDate) {
      const nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      const x = daysBetween(minDate, current) * DAY_WIDTH;
      const width = daysBetween(current, nextMonth < maxDate ? nextMonth : maxDate) * DAY_WIDTH;
      result.push({ date: new Date(current), x: Math.max(0, x), width });
      current = nextMonth;
    }
    return result;
  }, [minDate, maxDate]);

  // Build groups
  const groups = useMemo((): TimelineGroup[] => {
    if (groupBy === 'goal') {
      const goalGroups = new Map<string, TimelineGroup>();
      for (const st of scheduledTasks) {
        const gid = st.goalId || 'ungrouped';
        if (!goalGroups.has(gid)) {
          const goal = goalsMap.get(gid);
          goalGroups.set(gid, {
            id: gid,
            label: goal?.name || gid,
            color: GROUP_COLORS[goalGroups.size % GROUP_COLORS.length],
            tasks: [],
            milestones: [],
          });
        }
        goalGroups.get(gid)!.tasks.push(st);
      }
      for (const sm of scheduledMilestones) {
        const gid = sm.goalId || 'ungrouped';
        if (!goalGroups.has(gid)) {
          // For project milestones, derive a nicer label
          let label = gid;
          if (gid.startsWith('project:')) {
            const projId = gid.replace('project:', '');
            const projEntity = projectsMap.get(projId);
            label = projEntity?.name || projId;
          }
          goalGroups.set(gid, {
            id: gid,
            label,
            color: GROUP_COLORS[goalGroups.size % GROUP_COLORS.length],
            tasks: [],
            milestones: [],
          });
        }
        goalGroups.get(gid)!.milestones.push(sm);
      }
      // Sort by earliest task start
      return Array.from(goalGroups.values()).sort((a, b) => {
        const aMin = a.tasks[0]?.startDate.getTime() ?? Infinity;
        const bMin = b.tasks[0]?.startDate.getTime() ?? Infinity;
        return aMin - bMin;
      });
    } else {
      const deptGroups = new Map<string, TimelineGroup>();
      for (const st of scheduledTasks) {
        const did = st.task.contributingDepartmentId;
        if (!deptGroups.has(did)) {
          const dept = departmentsMap.get(did);
          deptGroups.set(did, {
            id: did,
            label: dept?.name || did,
            color: GROUP_COLORS[deptGroups.size % GROUP_COLORS.length],
            tasks: [],
            milestones: [],
          });
        }
        deptGroups.get(did)!.tasks.push(st);
      }
      // Put milestones in the first group (they aren't dept-specific)
      for (const sm of scheduledMilestones) {
        const firstGroup = Array.from(deptGroups.values())[0];
        if (firstGroup) firstGroup.milestones.push(sm);
      }
      return Array.from(deptGroups.values());
    }
  }, [groupBy, scheduledTasks, scheduledMilestones, goalsMap, departmentsMap, projectsMap]);

  // Today line position
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayX = daysBetween(minDate, today) * DAY_WIDTH;

  // Compute total canvas height
  const totalHeight = groups.reduce((sum, g) => {
    return sum + GROUP_HEADER_HEIGHT + g.tasks.length * ROW_HEIGHT;
  }, 0);

  const scrollToToday = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = Math.max(0, todayX - 300);
    }
  }, [todayX]);

  // Auto-scroll to today on mount
  useEffect(() => {
    const t = setTimeout(scrollToToday, 100);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line -- only on mount

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid var(--color-border)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Group by:</span>
        {(['goal', 'department'] as const).map((g) => (
          <button
            key={g}
            onClick={() => setGroupBy(g)}
            style={{
              padding: '4px 10px', borderRadius: 4, border: 'none', fontSize: 11, cursor: 'pointer',
              backgroundColor: groupBy === g ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
              color: groupBy === g ? 'var(--color-bg-primary)' : 'var(--color-text-secondary)',
              textTransform: 'capitalize',
            }}
          >
            {g}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={scrollToToday} style={{
          padding: '4px 10px', borderRadius: 4, border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-secondary)',
          fontSize: 11, cursor: 'pointer',
        }}>
          Today
        </button>
      </div>

      {/* Main area: left panel + scrollable timeline */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left label panel */}
        <div style={{
          width: LEFT_PANEL_WIDTH, flexShrink: 0,
          borderRight: '1px solid var(--color-border)',
          overflowY: 'hidden',
        }}>
          {/* Header spacer */}
          <div style={{ height: HEADER_HEIGHT, borderBottom: '1px solid var(--color-border)' }} />

          {/* Group labels — synced with scroll */}
          <div style={{ overflowY: 'hidden' }} id="label-panel">
            {groups.map((group) => (
              <div key={group.id}>
                {/* Group header */}
                <div
                  style={{
                    height: GROUP_HEADER_HEIGHT, display: 'flex', alignItems: 'center',
                    padding: '0 12px', gap: 6,
                    borderBottom: '1px solid var(--color-bg-tertiary)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    cursor: onSelectGoal && groupBy === 'goal' ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (onSelectGoal && groupBy === 'goal' && !group.id.startsWith('project:')) {
                      onSelectGoal(group.id);
                    }
                  }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: 2, backgroundColor: group.color, flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: 12, fontWeight: 600, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {group.label}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 'auto', flexShrink: 0 }}>
                    {group.tasks.length}
                  </span>
                </div>
                {/* Task labels */}
                {group.tasks.map((st) => (
                  <div
                    key={st.task.id}
                    onClick={() => setSelectedTask(st.task.id)}
                    style={{
                      height: ROW_HEIGHT, display: 'flex', alignItems: 'center',
                      padding: '0 12px 0 24px', gap: 6, cursor: 'pointer',
                      borderBottom: '1px solid var(--color-bg-tertiary)',
                      backgroundColor: hoveredTask === st.task.id ? 'var(--color-bg-tertiary)' : 'transparent',
                    }}
                    onMouseEnter={() => setHoveredTask(st.task.id)}
                    onMouseLeave={() => setHoveredTask(null)}
                  >
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      backgroundColor: getStatusColor(st.task.status), flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', color: 'var(--color-text-secondary)',
                    }}>
                      {st.task.name}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Right scrollable timeline */}
        <div
          ref={scrollRef}
          style={{ flex: 1, overflow: 'auto' }}
          onScroll={(e) => {
            // Sync vertical scroll of label panel
            const labelPanel = document.getElementById('label-panel');
            if (labelPanel) labelPanel.scrollTop = e.currentTarget.scrollTop;
          }}
        >
          <div style={{
            position: 'relative',
            width: totalDays * DAY_WIDTH,
            minHeight: totalHeight + HEADER_HEIGHT,
          }}>
            {/* Month headers */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 3, height: HEADER_HEIGHT,
              borderBottom: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-bg-primary)',
            }}>
              {months.map((m, i) => (
                <div key={i} style={{
                  position: 'absolute', left: m.x, width: m.width, height: '100%',
                  borderLeft: '1px solid var(--color-bg-tertiary)',
                  display: 'flex', alignItems: 'center', paddingLeft: 8,
                }}>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 500 }}>
                    {formatMonth(m.date)}
                  </span>
                </div>
              ))}
            </div>

            {/* Grid lines (weeks) */}
            {Array.from({ length: Math.ceil(totalDays / 7) }, (_, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: i * 7 * DAY_WIDTH,
                top: HEADER_HEIGHT,
                width: 1,
                height: totalHeight,
                backgroundColor: 'var(--color-bg-tertiary)',
                opacity: 0.5,
              }} />
            ))}

            {/* Today line */}
            {todayX > 0 && todayX < totalDays * DAY_WIDTH && (
              <>
                <div style={{
                  position: 'absolute', left: todayX, top: 0,
                  width: 2, height: totalHeight + HEADER_HEIGHT,
                  backgroundColor: '#ef4444', zIndex: 2, opacity: 0.7,
                }} />
                <div style={{
                  position: 'absolute', left: todayX - 20, top: 4,
                  fontSize: 9, color: '#ef4444', fontWeight: 600, zIndex: 4,
                  backgroundColor: 'var(--color-bg-primary)', padding: '1px 4px',
                  borderRadius: 3,
                }}>
                  Today
                </div>
              </>
            )}

            {/* Task bars + milestone markers per group */}
            {(() => {
              let yOffset = HEADER_HEIGHT;
              return groups.map((group) => {
                const groupY = yOffset;
                yOffset += GROUP_HEADER_HEIGHT;

                const taskBars = group.tasks.map((st, ti) => {
                  const x = daysBetween(minDate, st.startDate) * DAY_WIDTH;
                  const w = Math.max(daysBetween(st.startDate, st.endDate) * DAY_WIDTH, 8);
                  const y = yOffset + ti * ROW_HEIGHT + 4;
                  const barHeight = ROW_HEIGHT - 8;

                  return (
                    <div
                      key={st.task.id}
                      onClick={() => setSelectedTask(st.task.id)}
                      onMouseEnter={() => setHoveredTask(st.task.id)}
                      onMouseLeave={() => setHoveredTask(null)}
                      title={`${st.task.name}\n${formatShort(st.startDate)} \u2013 ${formatShort(st.endDate)} (${daysBetween(st.startDate, st.endDate)}d)`}
                      style={{
                        position: 'absolute', left: x, top: y,
                        width: w, height: barHeight,
                        backgroundColor: getStatusColor(st.task.status),
                        opacity: hoveredTask === st.task.id ? 1 : 0.75,
                        borderRadius: 4, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', paddingLeft: 6,
                        overflow: 'hidden', whiteSpace: 'nowrap',
                        transition: 'opacity 0.15s',
                        border: hoveredTask === st.task.id ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
                      }}
                    >
                      {w > 60 && (
                        <span style={{ fontSize: 10, color: '#0f172a', fontWeight: 500 }}>
                          {st.task.name}
                        </span>
                      )}
                    </div>
                  );
                });

                yOffset += group.tasks.length * ROW_HEIGHT;

                // Milestone diamonds (placed at group header level)
                const msMarkers = group.milestones.map((sm) => {
                  const x = daysBetween(minDate, sm.date) * DAY_WIDTH;
                  return (
                    <div
                      key={sm.milestone.id}
                      title={`${sm.milestone.unlocked ? '\\u2713 ' : ''}${sm.milestone.name}\n${formatShort(sm.date)}`}
                      style={{
                        position: 'absolute',
                        left: x - 7,
                        top: groupY + GROUP_HEADER_HEIGHT / 2 - 7,
                        width: 14, height: 14,
                        backgroundColor: sm.milestone.unlocked ? '#22c55e' : '#f59e0b',
                        transform: 'rotate(45deg)',
                        borderRadius: 2,
                        zIndex: 1,
                        cursor: 'default',
                        border: '2px solid var(--color-bg-primary)',
                      }}
                    />
                  );
                });

                return (
                  <div key={group.id}>
                    {/* Group header background */}
                    <div style={{
                      position: 'absolute', left: 0, top: groupY,
                      width: '100%', height: GROUP_HEADER_HEIGHT,
                      backgroundColor: 'var(--color-bg-secondary)',
                      borderBottom: '1px solid var(--color-bg-tertiary)',
                    }} />
                    {/* Row backgrounds */}
                    {group.tasks.map((_, ti) => (
                      <div key={ti} style={{
                        position: 'absolute', left: 0,
                        top: groupY + GROUP_HEADER_HEIGHT + ti * ROW_HEIGHT,
                        width: '100%', height: ROW_HEIGHT,
                        borderBottom: '1px solid var(--color-bg-tertiary)',
                        backgroundColor: ti % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                      }} />
                    ))}
                    {msMarkers}
                    {taskBars}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
