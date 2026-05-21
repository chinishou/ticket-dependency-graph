import { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import type { Task, Goal } from '../../types';

interface GlobalUnplacedPanelProps {
  onClose: () => void;
}

export function GlobalUnplacedPanel({ onClose }: GlobalUnplacedPanelProps) {
  const addTaskToGoal = useStore((s) => s.addTaskToGoal);
  const setSelectedTask = useStore((s) => s.setSelectedTask);
  const tasksMap = useStore((s) => s.tasks);
  const goalsMap = useStore((s) => s.goals);
  const departmentsMap = useStore((s) => s.departments);
  const projectsMap = useStore((s) => s.projects);

  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Derive directly from tasksMap so the list stays reactive when tasks are placed/archived.
  const allUnplaced = useMemo(
    () => Array.from(tasksMap.values()).filter((t) => !t.archived && (!t.goalId || t.goalId === '')),
    [tasksMap],
  );

  const filteredTasks = useMemo(() => {
    if (!search.trim()) return allUnplaced;
    const q = search.toLowerCase();
    return allUnplaced.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.ticketId && t.ticketId.toLowerCase().includes(q)),
    );
  }, [allUnplaced, search]);

  const groupedTasks = useMemo(() => {
    const groups = new Map<string, Task[]>();
    for (const task of filteredTasks) {
      const key = task.sgProjectName || (task.sgProjectId ? `sg-${task.sgProjectId}` : 'No Project');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(task);
    }
    return groups;
  }, [filteredTasks]);

  const sortedGroups = useMemo(() => {
    return Array.from(groupedTasks.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [groupedTasks]);

  const groupedGoals = useMemo(() => {
    const deptGroups: { label: string; goals: Goal[] }[] = [];
    const projGroups: { label: string; goals: Goal[] }[] = [];
    for (const dept of departmentsMap.values()) {
      const goals = dept.goalIds.map((id) => goalsMap.get(id)).filter(Boolean) as Goal[];
      if (goals.length > 0) {
        deptGroups.push({ label: `Dept: ${dept.name}`, goals: goals.sort((a, b) => a.name.localeCompare(b.name)) });
      }
    }
    for (const proj of projectsMap.values()) {
      if (proj.status === 'active') {
        const goals = proj.goalIds.map((id) => goalsMap.get(id)).filter(Boolean) as Goal[];
        if (goals.length > 0) {
          projGroups.push({ label: `Project: ${proj.name}`, goals: goals.sort((a, b) => a.name.localeCompare(b.name)) });
        }
      }
    }
    deptGroups.sort((a, b) => a.label.localeCompare(b.label));
    projGroups.sort((a, b) => a.label.localeCompare(b.label));
    return [...deptGroups, ...projGroups];
  }, [goalsMap, departmentsMap, projectsMap]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div style={{
      position: 'absolute',
      top: 44,
      left: 12,
      width: 320,
      height: 'calc(100% - 60px)',
      backgroundColor: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      zIndex: 6,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '10px 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Unplaced Tickets ({allUnplaced.length})</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 8px' }}>
        <input
          type="text"
          placeholder="Search tickets..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '6px 8px', borderRadius: 5,
            border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-primary)', fontSize: 12, outline: 'none',
          }}
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {sortedGroups.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', padding: 16, textAlign: 'center' }}>
            No unplaced tickets
          </div>
        )}

        {sortedGroups.map(([groupName, tasks]) => {
          const isCollapsed = collapsedGroups.has(groupName);
          return (
            <div key={groupName} style={{ marginBottom: 8 }}>
              <div
                onClick={() => toggleGroup(groupName)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 6px', borderRadius: 4,
                  cursor: 'pointer',
                  backgroundColor: 'var(--color-bg-tertiary)',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▼</span>
                <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{groupName}</span>
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>({tasks.length})</span>
              </div>

              {!isCollapsed && tasks.map((task) => (
                <div key={task.id} style={ticketItemStyle}>
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => { setSelectedTask(task.id); }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {task.ticketId && (
                        <span style={{ fontSize: 9, backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)', padding: '1px 4px', borderRadius: 3, flexShrink: 0 }}>
                          {task.ticketId}
                        </span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
                    </div>
                    {/* Related project badges */}
                    {(task.relatedProjectIds?.length ?? 0) > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                        {task.relatedProjectIds!.map((pid) => {
                          const proj = projectsMap.get(pid);
                          return (
                            <span key={pid} style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>
                              📁 {proj?.name ?? pid}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Place in Goal dropdown */}
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        // Clear unplaced — otherwise Timeline / other "placed
                        // tasks only" views will keep skipping this task.
                        addTaskToGoal(e.target.value, { ...task, goalId: e.target.value, unplaced: false });
                      }
                      e.target.value = '';
                    }}
                    style={{
                      fontSize: 10, padding: '2px 4px', borderRadius: 4,
                      border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)',
                      color: 'var(--color-text-secondary)', cursor: 'pointer', flexShrink: 0, maxWidth: 110,
                    }}
                  >
                    <option value="">Place in Goal...</option>
                    {groupedGoals.map(({ label, goals }) => (
                      <optgroup key={label} label={label}>
                        {goals.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ticketItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  padding: '6px 8px',
  borderRadius: 5,
  marginBottom: 2,
  transition: 'background-color 0.15s',
};
