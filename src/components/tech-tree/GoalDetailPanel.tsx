import { useEffect, useState } from 'react';
import type React from 'react';
import { useStore } from '../../store/useStore';
import { usePermission } from '../../hooks/usePermission';
import { computeGoalStatus, getGoalStatusColor } from '../../types';

interface GoalDetailPanelProps {
  goalId: string;
  onClose: () => void;
  onOpenInDependencyGraph?: (goalId: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  completed:   'Done',
  in_progress: 'In Progress',
  blocked:     'Blocked',
  available:   'Active',
  empty:       'No Tasks',
};

function clampPriority(p: number | undefined | null): number {
  if (p == null || !Number.isFinite(p)) return 3;
  if (p < 1) return 1;
  if (p > 3) return 3;
  return Math.round(p);
}

/**
 * Floating side panel for editing a single goal. Opens on single-click in
 * `GoalMapView`. Mirrors the look-and-feel of TaskDetailPanel — slide-in
 * from the right, click outside / × to dismiss.
 *
 * Permissions:
 *   - workers              → read-only
 *   - coordinator + admin  → can edit name, owner, description, priority
 *   - admin                → can delete (via DeleteEntityButton)
 *
 * Double-clicking the goal node still navigates into the goal's dependency
 * graph; this panel is for property-level editing without leaving the map.
 */
export function GoalDetailPanel({ goalId, onClose, onOpenInDependencyGraph }: GoalDetailPanelProps) {
  const goal = useStore((s) => s.goals.get(goalId));
  const departments = useStore((s) => s.departments);
  const projects = useStore((s) => s.projects);
  const tasksMap = useStore((s) => s.tasks);
  const updateGoal = useStore((s) => s.updateGoal);
  const { canEditTasks } = usePermission();

  // Local drafts so name / description edits debounce until blur, rather
  // than firing a server mutation on every keystroke.
  const [nameDraft, setNameDraft] = useState(goal?.name ?? '');
  const [ownerDraft, setOwnerDraft] = useState(goal?.owner ?? '');
  const [descDraft, setDescDraft] = useState(goal?.description ?? '');

  // Re-sync drafts when the panel switches to a different goal, or when the
  // goal is updated elsewhere (e.g. another tab via polling).
  useEffect(() => {
    setNameDraft(goal?.name ?? '');
    setOwnerDraft(goal?.owner ?? '');
    setDescDraft(goal?.description ?? '');
  }, [goalId, goal?.name, goal?.owner, goal?.description]);

  if (!goal) return null;

  const priority = clampPriority(goal.departmentPriority);
  const status = computeGoalStatus(goal, tasksMap);
  const accent = getGoalStatusColor(status);

  // Parent label (primary parent + secondary cross-ref if any). The
  // `parentType`-vs-`departmentId`/`projectId` split is described in
  // src/types/index.ts; cross-refs have one of those fields set to a value
  // *other* than the primary parentId.
  const primaryParent = goal.parentType === 'department'
    ? departments.get(goal.parentId)
    : projects.get(goal.parentId);
  const secondaryParentId = goal.parentType === 'department'
    ? (goal.projectId && goal.projectId !== goal.parentId ? goal.projectId : null)
    : (goal.departmentId && goal.departmentId !== goal.parentId ? goal.departmentId : null);
  const secondaryParent = secondaryParentId
    ? (goal.parentType === 'department' ? projects.get(secondaryParentId) : departments.get(secondaryParentId))
    : null;

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== goal.name) updateGoal(goalId, { name: trimmed });
    else setNameDraft(goal.name); // revert empty/no-change
  };
  const commitOwner = () => {
    if (ownerDraft !== goal.owner) updateGoal(goalId, { owner: ownerDraft });
  };
  const commitDesc = () => {
    if (descDraft !== goal.description) updateGoal(goalId, { description: descDraft });
  };

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ ...priorityBadgeStyle, backgroundColor: accent }}>P{priority}</span>
          {canEditTasks ? (
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              style={titleInputStyle}
            />
          ) : (
            <span style={titleReadonlyStyle}>{goal.name}</span>
          )}
        </div>
        <button onClick={onClose} style={closeButtonStyle} aria-label="Close">✕</button>
      </div>

      <div style={metaRowStyle}>
        <span style={mutedLabelStyle}>Status</span>
        <span style={{ color: accent, fontWeight: 600 }}>{STATUS_LABEL[status] ?? status}</span>
      </div>

      <div style={metaRowStyle}>
        <span style={mutedLabelStyle}>Parent</span>
        <span>
          {goal.parentType === 'department' ? '🏢 ' : '📁 '}{primaryParent?.name ?? goal.parentId}
          {secondaryParent && (
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>
              · {goal.parentType === 'department' ? '📁' : '🏢'} {secondaryParent.name}
            </span>
          )}
        </span>
      </div>

      <div style={metaRowStyle}>
        <span style={mutedLabelStyle}>Priority</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3].map((p) => {
            const active = priority === p;
            return (
              <button
                key={p}
                onClick={() => canEditTasks && updateGoal(goalId, { departmentPriority: p })}
                disabled={!canEditTasks}
                style={{
                  width: 28, height: 24, borderRadius: 4,
                  fontSize: 11, fontWeight: active ? 700 : 400,
                  cursor: canEditTasks ? 'pointer' : 'default',
                  border: active ? `1px solid ${accent}` : '1px solid var(--color-border)',
                  backgroundColor: active ? `${accent}22` : 'transparent',
                  color: active ? accent : 'var(--color-text-muted)',
                  opacity: canEditTasks ? 1 : 0.6,
                }}
                title={active ? `Currently P${p}` : `Set priority to P${p}`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      <div style={metaRowStyle}>
        <span style={mutedLabelStyle}>Owner</span>
        {canEditTasks ? (
          <input
            type="text"
            value={ownerDraft}
            onChange={(e) => setOwnerDraft(e.target.value)}
            onBlur={commitOwner}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            style={smallInputStyle}
            placeholder="(unassigned)"
          />
        ) : (
          <span>{goal.owner || '(unassigned)'}</span>
        )}
      </div>

      <div style={metaRowStyle}>
        <span style={mutedLabelStyle}>Tasks · Milestones</span>
        <span>{goal.taskIds.length} · {goal.milestoneIds.length}</span>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={mutedLabelStyle}>Description</div>
        {canEditTasks ? (
          <textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={commitDesc}
            rows={4}
            style={textareaStyle}
            placeholder="(no description)"
          />
        ) : (
          <p style={descReadonlyStyle}>{goal.description || '(no description)'}</p>
        )}
      </div>

      {/* Action row. Delete intentionally lives in the toolbar's
          "Remove Goal" button — the existing removeGoal mutation is
          fire-and-forget, not the strict-delete pattern the inline
          DeleteEntityButton expects. */}
      {onOpenInDependencyGraph && (
        <div style={{ marginTop: 18, borderTop: '1px solid var(--color-bg-tertiary)', paddingTop: 12 }}>
          <button
            onClick={() => onOpenInDependencyGraph(goalId)}
            style={openTreeButtonStyle}
          >
            Open Dependency Graph →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles — match TaskDetailPanel's right-side floating-panel look
// ---------------------------------------------------------------------------

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  width: 320,
  maxHeight: 'calc(100% - 24px)',
  overflowY: 'auto',
  backgroundColor: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
  padding: '14px 16px',
  zIndex: 20,
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 12,
};

const titleInputStyle: React.CSSProperties = {
  flex: 1, minWidth: 0,
  padding: '5px 8px',
  borderRadius: 6,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--color-text-primary)',
  fontSize: 14, fontWeight: 600,
  outline: 'none',
};

const titleReadonlyStyle: React.CSSProperties = {
  flex: 1, minWidth: 0,
  color: 'var(--color-text-primary)',
  fontSize: 14, fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const closeButtonStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid var(--color-border)',
  background: 'transparent',
  color: 'var(--color-text-muted)',
  fontSize: 12, cursor: 'pointer',
  flexShrink: 0,
};

const priorityBadgeStyle: React.CSSProperties = {
  fontSize: 9, fontWeight: 700,
  color: '#fff',
  padding: '2px 7px',
  borderRadius: 4,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  flexShrink: 0,
};

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 12,
  color: 'var(--color-text-primary)',
  padding: '6px 0',
  gap: 12,
};

const mutedLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--color-text-muted)',
};

const smallInputStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 5,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg-tertiary)',
  color: 'var(--color-text-primary)',
  fontSize: 12,
  outline: 'none',
  minWidth: 160,
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 4,
  padding: '6px 8px',
  borderRadius: 5,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg-tertiary)',
  color: 'var(--color-text-primary)',
  fontSize: 12,
  outline: 'none',
  resize: 'vertical',
  fontFamily: 'inherit',
};

const descReadonlyStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-text-secondary)',
  marginTop: 4,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
};

const openTreeButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px',
  borderRadius: 6,
  border: '1px solid var(--color-accent)',
  background: 'rgba(56,189,248,0.08)',
  color: 'var(--color-accent)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};
