import { useStore } from '../../store/useStore';
import type { Goal } from '../../types';

interface GoalSelectorProps {
  selectedGoalId: string;
  onSelectGoal: (goalId: string) => void;
}

export function GoalSelector({ selectedGoalId, onSelectGoal }: GoalSelectorProps) {
  const goalsMap = useStore((s) => s.goals);
  const departmentsMap = useStore((s) => s.departments);
  const projectsMap = useStore((s) => s.projects);

  // Build dept groups
  const deptGroups: { label: string; goals: Goal[] }[] = [];
  for (const dept of departmentsMap.values()) {
    const goals = dept.goalIds
      .map((id) => goalsMap.get(id))
      .filter((g): g is Goal => !!g);
    goals.sort((a, b) => a.departmentPriority - b.departmentPriority || a.name.localeCompare(b.name));
    if (goals.length > 0) deptGroups.push({ label: `Dept: ${dept.name}`, goals });
  }
  deptGroups.sort((a, b) => a.label.localeCompare(b.label));

  // Build project groups (active only)
  const projGroups: { label: string; goals: Goal[] }[] = [];
  for (const proj of projectsMap.values()) {
    if (proj.status === 'active') {
      const goals = proj.goalIds
        .map((id) => goalsMap.get(id))
        .filter((g): g is Goal => !!g);
      goals.sort((a, b) => a.name.localeCompare(b.name));
      if (goals.length > 0) projGroups.push({ label: `Project: ${proj.name}`, goals });
    }
  }
  projGroups.sort((a, b) => a.label.localeCompare(b.label));

  const allGroups = [...deptGroups, ...projGroups];

  return (
    <select
      value={selectedGoalId}
      onChange={(e) => onSelectGoal(e.target.value)}
      style={{
        padding: '6px 12px',
        borderRadius: 6,
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-tertiary)',
        color: 'var(--color-text-primary)',
        fontSize: 13,
        cursor: 'pointer',
        outline: 'none',
        maxWidth: 220,
      }}
    >
      {allGroups.map(({ label, goals }) => (
        <optgroup key={label} label={label}>
          {goals.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.name}
            </option>
          ))}
        </optgroup>
      ))}
      {/* Fallback: goals not in any dept/project group */}
      {(() => {
        const grouped = new Set(allGroups.flatMap((g) => g.goals.map((goal) => goal.id)));
        const ungrouped = Array.from(goalsMap.values()).filter((g) => !grouped.has(g.id));
        return ungrouped.length > 0 ? (
          <optgroup label="Other">
            {ungrouped.map((goal) => (
              <option key={goal.id} value={goal.id}>{goal.name}</option>
            ))}
          </optgroup>
        ) : null;
      })()}
    </select>
  );
}
