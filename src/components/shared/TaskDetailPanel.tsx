import { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { getStatusColor, getStatusLabel, getEtaDays } from '../../types';
import { computeTaskPriorities, getPriorityLabel, getPriorityColor } from '../../utils/priorityCalc';
import { usePermission } from '../../hooks/usePermission';

function CollapsibleDescription({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ margin: '8px 0' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none', border: 'none', color: 'var(--color-text-muted)',
          fontSize: 11, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <span style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
        Description
      </button>
      {open && (
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '6px 0 0 0', lineHeight: 1.5 }}>{text}</p>
      )}
    </div>
  );
}

interface EditableDepListProps {
  title: string;
  items: { id: string; name: string; status?: string; isMilestone?: boolean }[];
  allOptions: { id: string; name: string }[];
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
  onAdd: (id: string) => void;
  onItemClick: (id: string, isMilestone?: boolean) => void;
  readOnly?: boolean;
}

function EditableDepList({ title, items, allOptions, onReorder, onRemove, onAdd, onItemClick, readOnly }: EditableDepListProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const existingIds = new Set(items.map((i) => i.id));
  const filtered = allOptions.filter(
    (o) => !existingIds.has(o.id) && o.name.toLowerCase().includes(search.toLowerCase()),
  );

  const moveItem = (index: number, direction: -1 | 1) => {
    const ids = items.map((i) => i.id);
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= ids.length) return;
    [ids[index], ids[newIndex]] = [ids[newIndex], ids[index]];
    onReorder(ids);
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={sectionTitleStyle}>{title} ({items.length})</div>
        {!readOnly && (
          <button
            onClick={() => { setShowAdd(!showAdd); setSearch(''); }}
            style={{ ...smallButtonStyle, fontSize: 14, lineHeight: 1, padding: '2px 6px' }}
          >
            {showAdd ? '−' : '+'}
          </button>
        )}
      </div>

      {showAdd && (
        <div style={{ marginTop: 6, marginBottom: 6 }}>
          <input
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={searchInputStyle}
            autoFocus
          />
          <div style={{ maxHeight: 120, overflowY: 'auto', marginTop: 4 }}>
            {filtered.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', padding: 4 }}>No matching tasks</div>
            )}
            {filtered.map((opt) => (
              <div
                key={opt.id}
                onClick={() => { onAdd(opt.id); setShowAdd(false); setSearch(''); }}
                style={{ ...linkItemStyle, fontSize: 12 }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>{opt.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.map((item, i) => (
        <div
          key={item.id}
          style={{ ...linkItemStyle, justifyContent: 'space-between' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }} onClick={() => onItemClick(item.id, item.isMilestone)}>
            {item.status && <div style={{ ...statusDot, backgroundColor: getStatusColor(item.status as any) }} />}
            {item.isMilestone && <span style={{ fontSize: 11 }}>⭐</span>}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
          </div>
          {!readOnly && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
              <button onClick={() => moveItem(i, -1)} style={smallButtonStyle} title="Move up">↑</button>
              <button onClick={() => moveItem(i, 1)} style={smallButtonStyle} title="Move down">↓</button>
              <button onClick={() => onRemove(item.id)} style={{ ...smallButtonStyle, color: 'var(--color-blocked)' }} title="Remove">✕</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function TaskDetailPanel({ goalId }: { goalId: string }) {
  const { canEditTasks } = usePermission();
  const selectedTaskId = useStore((s) => s.selectedTaskId);
  const selectedMilestoneId = useStore((s) => s.selectedMilestoneId);
  const tasksMap = useStore((s) => s.tasks);
  const milestonesMap = useStore((s) => s.milestones);
  const workersMap = useStore((s) => s.workers);
  const departmentsMap = useStore((s) => s.departments);
  const setSelectedTask = useStore((s) => s.setSelectedTask);
  const setSelectedMilestone = useStore((s) => s.setSelectedMilestone);
  const focusedNodeId = useStore((s) => s.focusedNodeId);
  const setFocusedNode = useStore((s) => s.setFocusedNode);
  const updateTask = useStore((s) => s.updateTask);
  const updateMilestone = useStore((s) => s.updateMilestone);
  const removeTaskFromGoal = useStore((s) => s.removeTaskFromGoal);
  const removeMilestoneFromGoal = useStore((s) => s.removeMilestoneFromGoal);
  const overridePriority = useStore((s) => s.overridePriority);
  const liftPriorityOverride = useStore((s) => s.liftPriorityOverride);
  const getTasksForGoal = useStore((s) => s.getTasksForGoal);
  const getMilestonesForGoal = useStore((s) => s.getMilestonesForGoal);
  const getProjectForGoal = useStore((s) => s.getProjectForGoal);

  const goalsMap = useStore((s) => s.goals);

  const goalTasks = getTasksForGoal(goalId);
  const goalMilestones = getMilestonesForGoal(goalId);

  const priorities = useMemo(
    () => computeTaskPriorities({ tasks: tasksMap, milestones: milestonesMap, goals: goalsMap, departments: departmentsMap }),
    [tasksMap, milestonesMap, goalsMap, departmentsMap],
  );

  // All tasks and milestones available for linking
  const allTaskOptions = goalTasks.map((t) => ({ id: t.id, name: t.name }));
  const allMilestoneOptions = goalMilestones.map((m) => ({ id: m.id, name: m.name }));

  // === Milestone detail ===
  if (selectedMilestoneId) {
    const ms = milestonesMap.get(selectedMilestoneId);
    if (!ms) return null;

    const requiredTasks = ms.requiredTaskIds
      .map((id) => tasksMap.get(id))
      .filter(Boolean);
    const requiredMilestones = ms.requiredMilestoneIds
      .map((id) => milestonesMap.get(id))
      .filter(Boolean);
    const isFocused = focusedNodeId === selectedMilestoneId;

    return (
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{ms.unlocked ? '⭐' : '🔒'}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{ms.name}</div>
              <div style={{ fontSize: 10, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Milestone</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setFocusedNode(isFocused ? null : selectedMilestoneId)}
              style={{ ...smallButtonStyle, fontSize: 13, padding: '4px 8px', backgroundColor: isFocused ? 'var(--color-accent)' : undefined, color: isFocused ? 'var(--color-bg-primary)' : undefined }}
              title="Focus mode"
            >
              ◎
            </button>
            <button onClick={() => setSelectedMilestone(null)} style={closeButtonStyle}>✕</button>
          </div>
        </div>

        <CollapsibleDescription text={ms.description} />

        {ms.dueDate && (
          <div style={metaRowStyle}>
            <span style={{ color: 'var(--color-text-muted)' }}>Due Date</span>
            <span>{new Date(ms.dueDate).toLocaleDateString()}</span>
          </div>
        )}

        {/* Required Tasks */}
        <EditableDepList
          title="Required Tasks"
          items={requiredTasks.map((t) => t ? { id: t.id, name: t.name, status: t.status } : null).filter(Boolean) as { id: string; name: string; status: string }[]}
          allOptions={allTaskOptions.filter((o) => !ms.requiredTaskIds.includes(o.id))}
          onReorder={(ids) => updateMilestone(selectedMilestoneId, { requiredTaskIds: ids })}
          onRemove={(id) => updateMilestone(selectedMilestoneId, { requiredTaskIds: ms.requiredTaskIds.filter((d) => d !== id) })}
          onAdd={(id) => updateMilestone(selectedMilestoneId, { requiredTaskIds: [...ms.requiredTaskIds, id] })}
          onItemClick={(id, isMilestone) => { if (isMilestone) setSelectedMilestone(id); else setSelectedTask(id); }}
          readOnly={!canEditTasks}
        />

        {/* Required Milestones */}
        <EditableDepList
          title="Required Milestones"
          items={requiredMilestones.map((m2) => m2 ? { id: m2.id, name: m2.name, isMilestone: true } : null).filter(Boolean) as { id: string; name: string; isMilestone: boolean }[]}
          allOptions={allMilestoneOptions.filter((o) => o.id !== selectedMilestoneId && !ms.requiredMilestoneIds.includes(o.id))}
          onReorder={(ids) => updateMilestone(selectedMilestoneId, { requiredMilestoneIds: ids })}
          onRemove={(id) => updateMilestone(selectedMilestoneId, { requiredMilestoneIds: ms.requiredMilestoneIds.filter((d) => d !== id) })}
          onAdd={(id) => updateMilestone(selectedMilestoneId, { requiredMilestoneIds: [...ms.requiredMilestoneIds, id] })}
          onItemClick={(id) => setSelectedMilestone(id)}
          readOnly={!canEditTasks}
        />

        {canEditTasks && (
          <div style={{ marginTop: 24, borderTop: '1px solid var(--color-bg-tertiary)', paddingTop: 12 }}>
            <button
              onClick={() => removeMilestoneFromGoal(goalId, selectedMilestoneId)}
              style={{
                width: '100%', padding: '8px', borderRadius: 6,
                border: '1px solid var(--color-blocked)', background: 'transparent',
                color: 'var(--color-blocked)', fontSize: 12, cursor: 'pointer',
              }}
            >
              Remove from Goal
            </button>
          </div>
        )}
      </div>
    );
  }

  // === Task detail ===
  if (!selectedTaskId) return null;

  const task = tasksMap.get(selectedTaskId);
  if (!task) return null;

  const statusColor = getStatusColor(task.status);
  const assignedWorkers = task.assignedWorkerIds.map((id) => workersMap.get(id)).filter(Boolean);
  const dept = departmentsMap.get(task.contributingDepartmentId);
  const project = getProjectForGoal(task.goalId);
  const workerCount = assignedWorkers.length;
  const etaDays = getEtaDays(task, workerCount);
  const isFocused = focusedNodeId === selectedTaskId;

  // Build prerequisite items
  const prereqItems = task.dependsOnTaskIds
    .map((id) => {
      const t = tasksMap.get(id);
      return t ? { id: t.id, name: t.name, status: t.status } : null;
    })
    .filter(Boolean) as { id: string; name: string; status: string }[];

  // Build unlock items (tasks + milestones)
  const unlockTaskItems = task.unlocksTaskIds
    .map((id) => {
      const t = tasksMap.get(id);
      return t ? { id: t.id, name: t.name, status: t.status } : null;
    })
    .filter(Boolean) as { id: string; name: string; status: string }[];

  const unlockMilestoneItems = task.unlocksMilestoneIds
    .map((id) => {
      const m = milestonesMap.get(id);
      return m ? { id: m.id, name: m.name, isMilestone: true as const } : null;
    })
    .filter(Boolean) as { id: string; name: string; isMilestone: boolean }[];

  const handleItemClick = (id: string, isMilestone?: boolean) => {
    if (isMilestone) setSelectedMilestone(id);
    else setSelectedTask(id);
  };

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{task.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <div style={{ ...statusDot, backgroundColor: statusColor }} />
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{getStatusLabel(task.status)}</span>
            {task.ticketId && (
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 6 }}>{task.ticketId}</span>
            )}
            {(task as { syncSource?: string }).syncSource === 'sg' && (
              <span style={{ fontSize: 9, backgroundColor: 'var(--color-accent)', color: 'var(--color-bg-primary)', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>SG</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            onClick={() => setFocusedNode(isFocused ? null : selectedTaskId)}
            style={{ ...smallButtonStyle, fontSize: 13, padding: '4px 8px', backgroundColor: isFocused ? 'var(--color-accent)' : undefined, color: isFocused ? 'var(--color-bg-primary)' : undefined }}
            title="Focus mode — show only related nodes"
          >
            ◎
          </button>
          <button onClick={() => { setSelectedTask(null); setFocusedNode(null); }} style={closeButtonStyle}>✕</button>
        </div>
      </div>

      <CollapsibleDescription text={task.description} />

      {/* Meta */}
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
      {(task as { sgStatus?: string }).sgStatus && (
        <div style={metaRowStyle}>
          <span style={{ color: 'var(--color-text-muted)' }}>SG Status</span>
          <span>{(task as { sgStatus?: string }).sgStatus}</span>
        </div>
      )}
      {(task as { sgEstimate?: number }).sgEstimate && (
        <div style={metaRowStyle}>
          <span style={{ color: 'var(--color-text-muted)' }}>SG Estimate</span>
          <span>{(task as { sgEstimate?: number }).sgEstimate} days</span>
        </div>
      )}
      {(task as { sgTimeLogged?: number }).sgTimeLogged !== undefined && (
        <div style={metaRowStyle}>
          <span style={{ color: 'var(--color-text-muted)' }}>Time Logged</span>
          <span>{(task as { sgTimeLogged?: number }).sgTimeLogged}h</span>
        </div>
      )}
      {(task as { sgAssignedTo?: { id: number; name: string }[] }).sgAssignedTo && (task as { sgAssignedTo?: { id: number; name: string }[] }).sgAssignedTo!.length > 0 && (
        <div style={metaRowStyle}>
          <span style={{ color: 'var(--color-text-muted)' }}>Assigned To</span>
          <span>{(task as { sgAssignedTo?: { id: number; name: string }[] }).sgAssignedTo!.map(a => a.name).join(', ')}</span>
        </div>
      )}
      {(task as { archived?: boolean }).archived && (
        <div style={{ ...metaRowStyle, opacity: 0.6 }}>
          <span style={{ color: 'var(--color-text-muted)' }}>Archived</span>
          <span style={{ fontSize: 11 }}>📁 This task is archived</span>
        </div>
      )}
      {task.status !== 'completed' && priorities.get(task.id) && (() => {
        const pri = priorities.get(task.id)!;
        const isOverridden = task.priorityOverride != null;
        return (
          <>
            <div style={metaRowStyle}>
              <span style={{ color: 'var(--color-text-muted)' }}>Priority</span>
              <span style={{
                padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                backgroundColor: `${getPriorityColor(pri.score)}20`,
                color: getPriorityColor(pri.score),
              }}>
                {isOverridden && '\u{1F4CC} '}
                {getPriorityLabel(pri.score)} ({pri.score})
                {pri.criticalPath && ' \u26A1'}
              </span>
            </div>
            {isOverridden && (
              <div style={{ ...metaRowStyle, fontSize: 11 }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Computed</span>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {pri.computedScore} (drift: {pri.score - pri.computedScore > 0 ? '+' : ''}{pri.score - pri.computedScore})
                </span>
              </div>
            )}
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4, display: 'flex', gap: 8 }}>
              <span style={{ color: '#ef4444' }}>Proj:{Math.round(pri.projectFactor * 0.25)}</span>
              <span style={{ color: '#f59e0b' }}>Dept:{Math.round(pri.deptFactor * 0.20)}</span>
              <span style={{ color: '#22c55e' }}>Goal:{Math.round(pri.goalFactor * 0.15)}</span>
              <span style={{ color: '#8b5cf6' }}>Cr:{Math.round(pri.creatorFactor * 0.10)}</span>
              <span style={{ color: '#38bdf8' }}>GF:{Math.round(pri.graphFactor * 0.30)}</span>
            </div>

            {/* Override — direct number input (editor roles only) */}
            {canEditTasks && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                {!isOverridden ? (
                  <>
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>Override:</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      placeholder={String(pri.computedScore)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const val = parseInt((e.target as HTMLInputElement).value);
                          if (!isNaN(val) && val >= 0 && val <= 100) {
                            overridePriority(task.id, val, 'Manual override');
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                      style={{
                        width: 52, fontSize: 11, padding: '3px 6px', borderRadius: 4,
                        border: '1px solid var(--color-border)',
                        backgroundColor: 'var(--color-bg-tertiary)',
                        color: 'var(--color-text-primary)',
                        textAlign: 'center',
                      }}
                    />
                    <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>Enter to set</span>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>Overridden to {pri.score}</span>
                    <button
                      onClick={() => liftPriorityOverride(task.id)}
                      style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 4,
                        border: '1px solid rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.08)',
                        color: '#ef4444', cursor: 'pointer',
                      }}
                    >
                      Lift
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        );
      })()}

      {/* Workers */}
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

      {/* Prerequisites */}
      <EditableDepList
        title="Prerequisites"
        items={prereqItems}
        allOptions={allTaskOptions.filter((o) => o.id !== selectedTaskId)}
        onReorder={(ids) => updateTask(selectedTaskId, { dependsOnTaskIds: ids })}
        onRemove={(id) => updateTask(selectedTaskId, { dependsOnTaskIds: task.dependsOnTaskIds.filter((d) => d !== id) })}
        onAdd={(id) => updateTask(selectedTaskId, { dependsOnTaskIds: [...task.dependsOnTaskIds, id] })}
        onItemClick={handleItemClick}
        readOnly={!canEditTasks}
      />

      {/* Unlocks */}
      <EditableDepList
        title="Unlocks When Complete"
        items={[...unlockTaskItems, ...unlockMilestoneItems]}
        allOptions={[
          ...allTaskOptions.filter((o) => o.id !== selectedTaskId),
          ...allMilestoneOptions,
        ]}
        onReorder={(ids) => {
          const taskIds = ids.filter((id) => tasksMap.has(id));
          const msIds = ids.filter((id) => milestonesMap.has(id));
          updateTask(selectedTaskId, { unlocksTaskIds: taskIds, unlocksMilestoneIds: msIds });
        }}
        onRemove={(id) => {
          if (milestonesMap.has(id)) {
            updateTask(selectedTaskId, { unlocksMilestoneIds: task.unlocksMilestoneIds.filter((d) => d !== id) });
          } else {
            updateTask(selectedTaskId, { unlocksTaskIds: task.unlocksTaskIds.filter((d) => d !== id) });
          }
        }}
        onAdd={(id) => {
          if (milestonesMap.has(id)) {
            updateTask(selectedTaskId, { unlocksMilestoneIds: [...task.unlocksMilestoneIds, id] });
          } else {
            updateTask(selectedTaskId, { unlocksTaskIds: [...task.unlocksTaskIds, id] });
          }
        }}
        onItemClick={handleItemClick}
        readOnly={!canEditTasks}
      />

      {/* Remove from goal (editor roles only) */}
      {canEditTasks && (
        <div style={{ marginTop: 24, borderTop: '1px solid var(--color-bg-tertiary)', paddingTop: 12 }}>
          <button
            onClick={() => removeTaskFromGoal(goalId, selectedTaskId)}
            style={{
              width: '100%', padding: '8px', borderRadius: 6,
              border: '1px solid var(--color-blocked)', background: 'transparent',
              color: 'var(--color-blocked)', fontSize: 12, cursor: 'pointer',
            }}
          >
            Remove from Goal
          </button>
        </div>
      )}
    </div>
  );
}

// Styles
const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  width: 340,
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

const linkItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 6px',
  marginTop: 3,
  borderRadius: 5,
  fontSize: 12,
  cursor: 'pointer',
  transition: 'background-color 0.15s',
  backgroundColor: 'transparent',
};

const smallButtonStyle: React.CSSProperties = {
  background: 'var(--color-bg-tertiary)',
  border: 'none',
  color: 'var(--color-text-secondary)',
  fontSize: 11,
  cursor: 'pointer',
  padding: '2px 5px',
  borderRadius: 4,
  lineHeight: 1,
};

const searchInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 5,
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-tertiary)',
  color: 'var(--color-text-primary)',
  fontSize: 12,
  outline: 'none',
};
