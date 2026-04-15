import { describe, it, expect } from 'vitest';
import { computeGoalStatus, getGoalStatusColor, getGoalStatusGlow } from '../index';

describe('computeGoalStatus', () => {
  const makeGoal = (taskIds: string[]): { taskIds: string[] } => ({ taskIds });

  const makeTasksMap = (tasks: { id: string; status: string; archived?: boolean }[]): Map<string, { status: string; archived?: boolean }> => {
    const map = new Map<string, { status: string; archived?: boolean }>();
    for (const t of tasks) map.set(t.id, { status: t.status, archived: t.archived });
    return map;
  };

  it('empty goal (no tasks) → empty', () => {
    const goal = makeGoal([]);
    const tasks = makeTasksMap([]);
    expect(computeGoalStatus(goal, tasks)).toBe('empty');
  });

  it('all tasks locked → available (no tasks blocking progress)', () => {
    const goal = makeGoal(['t1', 't2']);
    const tasks = makeTasksMap([
      { id: 't1', status: 'locked' },
      { id: 't2', status: 'locked' },
    ]);
    expect(computeGoalStatus(goal, tasks)).toBe('available');
  });

  it('at least one in_progress task → in_progress', () => {
    const goal = makeGoal(['t1', 't2']);
    const tasks = makeTasksMap([
      { id: 't1', status: 'completed' },
      { id: 't2', status: 'in_progress' },
    ]);
    expect(computeGoalStatus(goal, tasks)).toBe('in_progress');
  });

  it('all tasks blocked (none in progress) → blocked', () => {
    const goal = makeGoal(['t1', 't2']);
    const tasks = makeTasksMap([
      { id: 't1', status: 'blocked' },
      { id: 't2', status: 'blocked' },
    ]);
    expect(computeGoalStatus(goal, tasks)).toBe('blocked');
  });

  it('all tasks completed → completed', () => {
    const goal = makeGoal(['t1', 't2']);
    const tasks = makeTasksMap([
      { id: 't1', status: 'completed' },
      { id: 't2', status: 'completed' },
    ]);
    expect(computeGoalStatus(goal, tasks)).toBe('completed');
  });

  it('mix of completed + in_progress → in_progress', () => {
    const goal = makeGoal(['t1', 't2', 't3']);
    const tasks = makeTasksMap([
      { id: 't1', status: 'completed' },
      { id: 't2', status: 'in_progress' },
      { id: 't3', status: 'completed' },
    ]);
    expect(computeGoalStatus(goal, tasks)).toBe('in_progress');
  });

  it('archived tasks are excluded', () => {
    const goal = makeGoal(['t1', 't2', 't3']);
    const tasks = makeTasksMap([
      { id: 't1', status: 'completed', archived: true },
      { id: 't2', status: 'locked' },
      { id: 't3', status: 'locked' },
    ]);
    expect(computeGoalStatus(goal, tasks)).toBe('available');
  });

  it('task not in tasksMap is excluded', () => {
    const goal = makeGoal(['t1', 't2']);
    const tasks = makeTasksMap([{ id: 't1', status: 'completed' }]);
    expect(computeGoalStatus(goal, tasks)).toBe('completed');
  });
});

describe('getGoalStatusColor', () => {
  it('completed → var(--color-done)', () => {
    expect(getGoalStatusColor('completed')).toBe('var(--color-done)');
  });

  it('in_progress → var(--color-in-progress)', () => {
    expect(getGoalStatusColor('in_progress')).toBe('var(--color-in-progress)');
  });

  it('blocked → var(--color-blocked)', () => {
    expect(getGoalStatusColor('blocked')).toBe('var(--color-blocked)');
  });

  it('available → var(--color-available)', () => {
    expect(getGoalStatusColor('available')).toBe('var(--color-available)');
  });

  it('empty → var(--color-border)', () => {
    expect(getGoalStatusColor('empty')).toBe('var(--color-border)');
  });
});

describe('getGoalStatusGlow', () => {
  it('completed → var(--color-done-glow)', () => {
    expect(getGoalStatusGlow('completed')).toBe('var(--color-done-glow)');
  });

  it('in_progress → var(--color-in-progress-glow)', () => {
    expect(getGoalStatusGlow('in_progress')).toBe('var(--color-in-progress-glow)');
  });

  it('blocked → var(--color-locked-glow)', () => {
    expect(getGoalStatusGlow('blocked')).toBe('var(--color-locked-glow)');
  });

  it('available → var(--color-available-glow)', () => {
    expect(getGoalStatusGlow('available')).toBe('var(--color-available-glow)');
  });

  it('empty → transparent', () => {
    expect(getGoalStatusGlow('empty')).toBe('transparent');
  });
});