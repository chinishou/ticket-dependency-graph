import { useState, useCallback } from 'react';
import { AppShell } from './components/layout/AppShell';
import { GoalSelector } from './components/layout/GoalSelector';
import { TechTreeView } from './components/tech-tree/TechTreeView';
import { GoalMapView } from './components/tech-tree/GoalMapView';
import { useStore } from './store/useStore';

type ViewMode = 'goal-map' | 'tech-tree';

function App() {
  const goalsMap = useStore((s) => s.goals);
  const departmentsMap = useStore((s) => s.departments);
  const projectsMap = useStore((s) => s.projects);
  const setSelectedTask = useStore((s) => s.setSelectedTask);
  const setSelectedMilestone = useStore((s) => s.setSelectedMilestone);
  const [selectedGoalId, setSelectedGoalId] = useState('goal-usd-pipeline');
  const [viewMode, setViewMode] = useState<ViewMode>('tech-tree');

  const goal = goalsMap.get(selectedGoalId);
  const parent = goal
    ? goal.parentType === 'department'
      ? departmentsMap.get(goal.parentId)
      : projectsMap.get(goal.parentId)
    : null;

  const handleGoalChange = useCallback((goalId: string) => {
    setSelectedTask(null);
    setSelectedMilestone(null);
    setSelectedGoalId(goalId);
    setViewMode('tech-tree');
  }, [setSelectedTask, setSelectedMilestone]);

  const handleGoalMapSelect = useCallback((goalId: string) => {
    setSelectedTask(null);
    setSelectedMilestone(null);
    setSelectedGoalId(goalId);
    setViewMode('tech-tree');
  }, [setSelectedTask, setSelectedMilestone]);

  const handleGoToGoalMap = useCallback(() => {
    setSelectedTask(null);
    setSelectedMilestone(null);
    setViewMode('goal-map');
  }, [setSelectedTask, setSelectedMilestone]);

  const breadcrumbs = viewMode === 'goal-map'
    ? [
        { label: 'Acme VFX' },
        ...(parent ? [{ label: parent.name }] : []),
        { label: 'Goals' },
      ]
    : [
        { label: 'Acme VFX', href: '#', onClick: handleGoToGoalMap },
        ...(parent ? [{ label: parent.name, href: '#', onClick: handleGoToGoalMap }] : []),
        ...(goal ? [{ label: goal.name }] : []),
      ];

  return (
    <AppShell
      breadcrumbs={breadcrumbs}
      rightContent={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {viewMode === 'tech-tree' && (
            <button
              onClick={handleGoToGoalMap}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-secondary)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ← Goal Map
            </button>
          )}
          {viewMode === 'tech-tree' && (
            <GoalSelector
              selectedGoalId={selectedGoalId}
              onSelectGoal={handleGoalChange}
            />
          )}
        </div>
      }
    >
      {viewMode === 'goal-map' && goal && parent && (
        <GoalMapView
          parentType={goal.parentType}
          parentId={goal.parentId}
          onSelectGoal={handleGoalMapSelect}
        />
      )}
      {viewMode === 'tech-tree' && (
        <TechTreeView goalId={selectedGoalId} />
      )}
    </AppShell>
  );
}

export default App;
