import { useStore } from '../../store/useStore';

interface GoalSelectorProps {
  selectedGoalId: string;
  onSelectGoal: (goalId: string) => void;
}

export function GoalSelector({ selectedGoalId, onSelectGoal }: GoalSelectorProps) {
  const goalsMap = useStore((s) => s.goals);
  const allGoals = Array.from(goalsMap.values());

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
      }}
    >
      {allGoals.map((goal) => (
        <option key={goal.id} value={goal.id}>
          {goal.name}
        </option>
      ))}
    </select>
  );
}
