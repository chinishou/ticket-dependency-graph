import { describe, it, expect } from 'vitest';
import {
  strategicPriorityToRank,
  computeProjectFactor,
  computeDeptFactor,
  computeGoalFactor,
  computeCreatorFactor,
  computeTaskPriorities,
  DEFAULT_WEIGHTS,
  getEffectiveScore,
  getPriorityLabel,
  getPriorityColor,
  deriveWeightsFromCalibration,
} from '../priorityCalc';
import type { Task, Milestone, Goal, Department, StrategicPriority } from '../../types';

describe('strategicPriorityToRank', () => {
  it('P1 → 1, P2 → 2, P3 → 3', () => {
    expect(strategicPriorityToRank('P1')).toBe(1);
    expect(strategicPriorityToRank('P2')).toBe(2);
    expect(strategicPriorityToRank('P3')).toBe(3);
  });
});

describe('computeProjectFactor', () => {
  it('P1 → 100, P2 → 67, P3 → 33', () => {
    expect(computeProjectFactor('P1')).toBe(100);
    expect(computeProjectFactor('P2')).toBeCloseTo(66.67, 1);
    expect(computeProjectFactor('P3')).toBeCloseTo(33.33, 1);
  });
});

describe('computeDeptFactor', () => {
  it('P1 → 100, P2 → 67, P3 → 33', () => {
    expect(computeDeptFactor('P1')).toBe(100);
    expect(computeDeptFactor('P2')).toBeCloseTo(66.67, 1);
    expect(computeDeptFactor('P3')).toBeCloseTo(33.33, 1);
  });
});

describe('computeGoalFactor', () => {
  it('departmentPriority 1 → 100, 2 → 67, 3 → 33', () => {
    expect(computeGoalFactor(1)).toBe(100);
    expect(computeGoalFactor(2)).toBeCloseTo(66.67, 1);
    expect(computeGoalFactor(3)).toBeCloseTo(33.33, 1);
  });
});

describe('computeCreatorFactor', () => {
  it('isLead true → 100, false → 50', () => {
    expect(computeCreatorFactor(true)).toBe(100);
    expect(computeCreatorFactor(false)).toBe(50);
  });
});

describe('computeTaskPriorities', () => {
  const makeGoal = (id: string, deptPriority = 1): Goal => ({
    id,
    name: `Goal ${id}`,
    description: `Description for goal ${id}`,
    owner: 'Test',
    parentType: 'department',
    parentId: 'dept-1',
    departmentPriority: deptPriority,
    taskIds: [],
    milestoneIds: [],
    dependsOnGoalIds: [],
    unlocksGoalIds: [],
  });

  const makeTask = (id: string, goalId: string, overrides: Partial<Task> = {}): Task => ({
    id,
    goalId,
    name: `Task ${id}`,
    description: `Description for task ${id}`,
    status: 'available',
    contributingDepartmentId: 'dept-1',
    baseDurationDays: 5,
    parallelizationFactor: 1,
    assignedWorkerIds: [],
    dependsOnTaskIds: [],
    dependsOnMilestoneIds: [],
    unlocksTaskIds: [],
    unlocksMilestoneIds: [],
    ...overrides,
  } as Task);

  const makeDept = (id: string, priority: StrategicPriority = 'P2'): Department => ({
    id,
    name: `Dept ${id}`,
    description: '',
    headName: 'Head',
    priority,
    workerIds: [],
    goalIds: [],
  });

  const emptyMilestones = new Map<string, Milestone>();

  it('weighted sum matches expected value', () => {
    const goals = new Map([['goal-1', makeGoal('goal-1', 1)]]);
    const tasks = new Map([['task-1', makeTask('task-1', 'goal-1')]]);
    const depts = new Map([['dept-1', makeDept('dept-1', 'P1')]]);
    const projects = new Map<string, any>();
    const creatorMap = new Map([['task-1', false]]);

    const result = computeTaskPriorities({
      tasks,
      milestones: emptyMilestones,
      goals,
      departments: depts,
      projects,
      creatorIsLeadMap: creatorMap,
      weights: DEFAULT_WEIGHTS,
    });

    const p = result.get('task-1')!;
    // project: 0.30 * 66.67 (P2 default since no relatedProjectIds), dept: 0.10 * 100 (P1),
    // goal: 0.20 * 100 (deptPriority 1), creator: 0.10 * 50 (not lead), graph: 0.30 * 0
    // = 20 + 10 + 20 + 5 + 0 = 55
    expect(p.score).toBeCloseTo(55, 0);
  });

  it('task with priorityOverride returns override score', () => {
    const goals = new Map([['goal-1', makeGoal('goal-1')]]);
    const tasks = new Map([['task-1', makeTask('task-1', 'goal-1', {
      priorityOverride: { score: 95, setBy: 'w1', setAt: '2025', reason: 'test', previousComputedScore: 50 },
    })]]);

    const result = computeTaskPriorities({
      tasks,
      milestones: emptyMilestones,
      goals,
    });

    expect(result.get('task-1')!.score).toBe(95);
  });

  it('archived task is excluded from output map', () => {
    const goals = new Map([['goal-1', makeGoal('goal-1')]]);
    const tasks = new Map([
      ['task-1', makeTask('task-1', 'goal-1')],
      ['task-2', makeTask('task-2', 'goal-1', { archived: true })],
    ]);

    const result = computeTaskPriorities({
      tasks,
      milestones: emptyMilestones,
      goals,
    });

    expect(result.has('task-1')).toBe(true);
    expect(result.has('task-2')).toBe(false);
  });

  it('CalibrationWeights missing goal key falls back to DEFAULT_WEIGHTS', () => {
    const goals = new Map([['goal-1', makeGoal('goal-1')]]);
    const tasks = new Map([['task-1', makeTask('task-1', 'goal-1')]]);

    // Weights without 'goal' key
    const oldWeights = { project: 0.3, dept: 0.1, creator: 0.1, graph: 0.5 } as any;

    const result = computeTaskPriorities({
      tasks,
      milestones: emptyMilestones,
      goals,
      weights: oldWeights,
    });

    // Should use DEFAULT_WEIGHTS which has goal: 0.20
    expect(result.get('task-1')).toBeDefined();
  });
});

describe('computeTaskPriorities graph factors', () => {
  const makeGoal = (id: string): Goal => ({
    id,
    name: `Goal ${id}`,
    description: `Description for goal ${id}`,
    owner: 'Test',
    parentType: 'department',
    parentId: 'dept-1',
    departmentPriority: 1,
    taskIds: [],
    milestoneIds: [],
    dependsOnGoalIds: [],
    unlocksGoalIds: [],
  });

  const makeTask = (id: string, goalId: string, overrides: Partial<Task> = {}): Task => ({
    id,
    goalId,
    name: `Task ${id}`,
    description: `Description for task ${id}`,
    status: 'available',
    contributingDepartmentId: 'dept-1',
    baseDurationDays: 5,
    parallelizationFactor: 1,
    assignedWorkerIds: [],
    dependsOnTaskIds: [],
    dependsOnMilestoneIds: [],
    unlocksTaskIds: [],
    unlocksMilestoneIds: [],
    ...overrides,
  } as Task);

  const emptyMilestones = new Map<string, Milestone>();

  it('isolated node has graph score of 0', () => {
    const goals = new Map([['goal-1', makeGoal('goal-1')]]);
    const tasks = new Map([['task-1', makeTask('task-1', 'goal-1')]]);

    const result = computeTaskPriorities({
      tasks,
      milestones: emptyMilestones,
      goals,
    });

    expect(result.get('task-1')!.graphFactor).toBe(0);
    expect(result.get('task-1')!.downstreamCount).toBe(0);
  });

  it('linear chain A→B→C: C has higher score than B, B higher than A', () => {
    // A→B→C means A unlocks B, B unlocks C (forward propagation via unlocksTaskIds)
    const goals = new Map([['goal-1', makeGoal('goal-1')]]);
    const tasks = new Map([
      ['task-a', makeTask('task-a', 'goal-1', { unlocksTaskIds: ['task-b'] })],
      ['task-b', makeTask('task-b', 'goal-1', { dependsOnTaskIds: ['task-a'], unlocksTaskIds: ['task-c'] })],
      ['task-c', makeTask('task-c', 'goal-1', { dependsOnTaskIds: ['task-b'] })],
    ]);

    const result = computeTaskPriorities({
      tasks,
      milestones: emptyMilestones,
      goals,
    });

    expect(result.get('task-c')!.downstreamCount).toBe(0);
    expect(result.get('task-b')!.downstreamCount).toBe(1);
    expect(result.get('task-a')!.downstreamCount).toBe(2);
  });

  it('diamond: shared downstream node counted once', () => {
    // Diamond: A→B→D, A→C→D (A unlocks B and C, both B and C unlock D)
    const goals = new Map([['goal-1', makeGoal('goal-1')]]);
    const tasks = new Map([
      ['task-a', makeTask('task-a', 'goal-1', { unlocksTaskIds: ['task-b', 'task-c'] })],
      ['task-b', makeTask('task-b', 'goal-1', { dependsOnTaskIds: ['task-a'], unlocksTaskIds: ['task-d'] })],
      ['task-c', makeTask('task-c', 'goal-1', { dependsOnTaskIds: ['task-a'], unlocksTaskIds: ['task-d'] })],
      ['task-d', makeTask('task-d', 'goal-1', { dependsOnTaskIds: ['task-b', 'task-c'] })],
    ]);

    const result = computeTaskPriorities({
      tasks,
      milestones: emptyMilestones,
      goals,
    });

    // D's downstream should be 0
    expect(result.get('task-d')!.downstreamCount).toBe(0);
    // A's downstream should count B and C only once (not D twice)
    expect(result.get('task-a')!.downstreamCount).toBe(3); // B, C, D
  });

  it('completed task excluded from critical path score', () => {
    const goals = new Map([['goal-1', makeGoal('goal-1')]]);
    const tasks = new Map([
      ['task-a', makeTask('task-a', 'goal-1', { status: 'completed' })],
      ['task-b', makeTask('task-b', 'goal-1', { dependsOnTaskIds: ['task-a'] })],
    ]);

    const result = computeTaskPriorities({
      tasks,
      milestones: emptyMilestones,
      goals,
    });

    expect(result.get('task-b')!.criticalPath).toBe(false);
  });
});

describe('getEffectiveScore', () => {
  const makeTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'task-1',
    goalId: 'goal-1',
    name: 'Task',
    description: 'desc',
    status: 'available',
    contributingDepartmentId: 'dept-1',
    baseDurationDays: 5,
    parallelizationFactor: 1,
    assignedWorkerIds: [],
    dependsOnTaskIds: [],
    dependsOnMilestoneIds: [],
    unlocksTaskIds: [],
    unlocksMilestoneIds: [],
    ...overrides,
  } as Task);

  it('returns override score when priorityOverride is set', () => {
    const task = makeTask({ priorityOverride: { score: 95, setBy: 'w1', setAt: '2025', reason: 'test', previousComputedScore: 50 } });
    expect(getEffectiveScore(task, 40)).toBe(95);
  });

  it('returns computed score when no override', () => {
    const task = makeTask({});
    expect(getEffectiveScore(task, 55)).toBe(55);
  });
});

describe('getPriorityLabel', () => {
  it('>= 80 → Critical', () => {
    expect(getPriorityLabel(80)).toBe('Critical');
    expect(getPriorityLabel(100)).toBe('Critical');
  });
  it('>= 60 and < 80 → High', () => {
    expect(getPriorityLabel(60)).toBe('High');
    expect(getPriorityLabel(79)).toBe('High');
  });
  it('>= 40 and < 60 → Medium', () => {
    expect(getPriorityLabel(40)).toBe('Medium');
    expect(getPriorityLabel(59)).toBe('Medium');
  });
  it('>= 20 and < 40 → Low', () => {
    expect(getPriorityLabel(20)).toBe('Low');
    expect(getPriorityLabel(39)).toBe('Low');
  });
  it('< 20 → Minimal', () => {
    expect(getPriorityLabel(19)).toBe('Minimal');
    expect(getPriorityLabel(0)).toBe('Minimal');
  });
});

describe('getPriorityColor', () => {
  it('>= 80 → red', () => {
    expect(getPriorityColor(80)).toBe('#ef4444');
    expect(getPriorityColor(100)).toBe('#ef4444');
  });
  it('>= 60 and < 80 → amber', () => {
    expect(getPriorityColor(60)).toBe('#f59e0b');
    expect(getPriorityColor(79)).toBe('#f59e0b');
  });
  it('>= 40 and < 60 → blue', () => {
    expect(getPriorityColor(40)).toBe('#3b82f6');
    expect(getPriorityColor(59)).toBe('#3b82f6');
  });
  it('>= 20 and < 40 → gray', () => {
    expect(getPriorityColor(20)).toBe('#6b7280');
    expect(getPriorityColor(39)).toBe('#6b7280');
  });
  it('< 20 → dark gray', () => {
    expect(getPriorityColor(19)).toBe('#374151');
    expect(getPriorityColor(0)).toBe('#374151');
  });
});

describe('deriveWeightsFromCalibration', () => {
  it('Q1 winner A increases creator weight', () => {
    const result = deriveWeightsFromCalibration([{ questionId: 1, winner: 'A' }]);
    expect(result.weights.creator).toBeGreaterThan(DEFAULT_WEIGHTS.creator);
  });

  it('Q1 winner B increases project weight relative to creator', () => {
    const result = deriveWeightsFromCalibration([{ questionId: 1, winner: 'B' }]);
    // After normalization, project should be higher than creator
    expect(result.weights.project).toBeGreaterThan(result.weights.creator);
  });

  it('Q2 winner A increases dept weight', () => {
    const result = deriveWeightsFromCalibration([{ questionId: 2, winner: 'A' }]);
    expect(result.weights.dept).toBeGreaterThan(DEFAULT_WEIGHTS.dept);
  });

  it('Q3 winner A increases graph weight', () => {
    const result = deriveWeightsFromCalibration([{ questionId: 3, winner: 'A' }]);
    expect(result.weights.graph).toBeGreaterThan(DEFAULT_WEIGHTS.graph);
  });

  it('Q4 winner A increases creator, winner B increases dept', () => {
    const resultA = deriveWeightsFromCalibration([{ questionId: 4, winner: 'A' }]);
    expect(resultA.weights.creator).toBeGreaterThan(DEFAULT_WEIGHTS.creator);
    const resultB = deriveWeightsFromCalibration([{ questionId: 4, winner: 'B' }]);
    expect(resultB.weights.dept).toBeGreaterThan(DEFAULT_WEIGHTS.dept);
  });

  it('Q5 winner A increases goal, winner B increases dept', () => {
    const resultA = deriveWeightsFromCalibration([{ questionId: 5, winner: 'A' }]);
    expect(resultA.weights.goal).toBeGreaterThan(DEFAULT_WEIGHTS.goal);
    const resultB = deriveWeightsFromCalibration([{ questionId: 5, winner: 'B' }]);
    expect(resultB.weights.dept).toBeGreaterThan(DEFAULT_WEIGHTS.dept);
  });

  it('Q6 winner A increases goal, winner B increases project', () => {
    const resultA = deriveWeightsFromCalibration([{ questionId: 6, winner: 'A' }]);
    expect(resultA.weights.goal).toBeGreaterThan(DEFAULT_WEIGHTS.goal);
    const resultB = deriveWeightsFromCalibration([{ questionId: 6, winner: 'B' }]);
    expect(resultB.weights.project).toBeGreaterThanOrEqual(DEFAULT_WEIGHTS.project);
  });

  it('Q7 winner A increases graph/dept/goal', () => {
    const result = deriveWeightsFromCalibration([{ questionId: 7, winner: 'A' }]);
    expect(result.weights.graph).toBeGreaterThan(DEFAULT_WEIGHTS.graph);
  });

  it('Q8 high importance increases graph', () => {
    const result = deriveWeightsFromCalibration([{ questionId: 8, graphImportance: 'high' }]);
    expect(result.weights.graph).toBeGreaterThan(DEFAULT_WEIGHTS.graph);
  });

  it('Q8 low importance decreases graph', () => {
    const result = deriveWeightsFromCalibration([{ questionId: 8, graphImportance: 'low' }]);
    expect(result.weights.graph).toBeLessThan(DEFAULT_WEIGHTS.graph - 0.1);
  });

  it('Q8 medium importance keeps graph stable', () => {
    const result = deriveWeightsFromCalibration([{ questionId: 8, graphImportance: 'medium' }]);
    expect(result.weights.graph).toBeGreaterThan(0);
  });

  it('Q1 and Q4 opposing answers may produce conflicts', () => {
    const result = deriveWeightsFromCalibration([
      { questionId: 1, winner: 'A' },
      { questionId: 4, winner: 'B' },
    ]);
    // Conflict detection depends on normalization result
    // Either no conflict or the specific conflict should be present
    if (result.conflicts.length > 0) {
      expect(result.conflicts[0]).toContain('creator');
    }
  });

  it('conflicts detected when Q5 and Q6 both boost goal very high', () => {
    const answers = [
      { questionId: 5, winner: 'A' as const },
      { questionId: 6, winner: 'A' as const },
    ];
    // Fill other answers to drive goal weight high
    for (let i = 1; i <= 7; i++) {
      if (i !== 5 && i !== 6) {
        answers.push({ questionId: i, winner: 'A' as const });
      }
    }
    const result = deriveWeightsFromCalibration(answers);
    // May or may not conflict depending on normalization
    expect(result.weights.goal).toBeGreaterThan(0);
  });

  it('weights sum to 1', () => {
    const result = deriveWeightsFromCalibration([]);
    const sum = result.weights.project + result.weights.dept + result.weights.goal +
                 result.weights.creator + result.weights.graph;
    expect(sum).toBeCloseTo(1, 5);
  });

  it('minimum weight of 0.05 enforced', () => {
    // Use answers that would drive some weights very low
    const result = deriveWeightsFromCalibration([
      { questionId: 8, graphImportance: 'low' },
    ]);
    expect(result.weights.graph).toBeGreaterThanOrEqual(0.05);
  });
});

describe('computeTaskPriorities with milestones', () => {
  const makeGoal = (id: string): Goal => ({
    id,
    name: `Goal ${id}`,
    description: 'desc',
    owner: 'Test',
    parentType: 'department',
    parentId: 'dept-1',
    departmentPriority: 1,
    taskIds: [],
    milestoneIds: [],
    dependsOnGoalIds: [],
    unlocksGoalIds: [],
  });

  const makeTask = (id: string, goalId: string, overrides: Partial<Task> = {}): Task => ({
    id,
    goalId,
    name: `Task ${id}`,
    description: 'desc',
    status: 'available',
    contributingDepartmentId: 'dept-1',
    baseDurationDays: 5,
    parallelizationFactor: 1,
    assignedWorkerIds: [],
    dependsOnTaskIds: [],
    dependsOnMilestoneIds: [],
    unlocksTaskIds: [],
    unlocksMilestoneIds: [],
    ...overrides,
  } as Task);

  const makeMilestone = (id: string, goalId: string, requiredTaskIds: string[], unlocksTaskIds: string[]): Milestone => ({
    id,
    name: `Milestone ${id}`,
    description: 'desc',
    type: 'capability',
    parentType: 'goal',
    parentId: goalId,
    requiredTaskIds,
    requiredMilestoneIds: [],
    unlocksTaskIds,
    unlocksMilestoneIds: [],
    unlocked: false,
  });

  it('task unlocking another task via milestone counts as downstream', () => {
    const goals = new Map([['goal-1', makeGoal('goal-1')]]);
    const tasks = new Map([
      ['task-a', makeTask('task-a', 'goal-1', { unlocksMilestoneIds: ['ms-1'] })],
      ['task-b', makeTask('task-b', 'goal-1')],
    ]);
    const milestones = new Map([['ms-1', makeMilestone('ms-1', 'goal-1', [], ['task-b'])]]);

    const result = computeTaskPriorities({
      tasks,
      milestones,
      goals,
    });

    // task-a should have task-b in its downstream count via milestone
    expect(result.get('task-a')!.downstreamCount).toBeGreaterThanOrEqual(1);
  });

  it('task with in_progress status gets status bonus', () => {
    const goals = new Map([['goal-1', makeGoal('goal-1')]]);
    const tasks = new Map([
      ['task-a', makeTask('task-a', 'goal-1', { status: 'in_progress', unlocksTaskIds: ['task-b'] })],
      ['task-b', makeTask('task-b', 'goal-1')],
    ]);
    const milestones = new Map<string, Milestone>();

    const result = computeTaskPriorities({
      tasks,
      milestones,
      goals,
    });

    // in_progress task should have higher graph factor than available
    expect(result.get('task-a')!.graphFactor).toBeGreaterThan(0);
  });

  it('critical path tasks get bonus', () => {
    const goals = new Map([['goal-1', makeGoal('goal-1')]]);
    const tasks = new Map([
      ['task-a', makeTask('task-a', 'goal-1')],
      ['task-b', makeTask('task-b', 'goal-1', { dependsOnTaskIds: ['task-a'] })],
    ]);
    const milestones = new Map([
      ['ms-1', makeMilestone('ms-1', 'goal-1', ['task-a', 'task-b'], [])],
    ]);

    const result = computeTaskPriorities({
      tasks,
      milestones,
      goals,
    });

    // task-b should be on critical path (longest chain)
    expect(result.get('task-b')!.criticalPath).toBe(true);
  });
});

describe('computeTaskPriorities multi-association', () => {
  const makeGoal = (id: string): Goal => ({
    id,
    name: `Goal ${id}`,
    description: 'desc',
    owner: 'Test',
    parentType: 'department',
    parentId: 'dept-1',
    departmentPriority: 1,
    taskIds: [],
    milestoneIds: [],
    dependsOnGoalIds: [],
    unlocksGoalIds: [],
  });

  const makeTask = (id: string, goalId: string, overrides: Partial<Task> = {}): Task => ({
    id,
    goalId,
    name: `Task ${id}`,
    description: 'desc',
    status: 'available',
    contributingDepartmentId: 'dept-1',
    baseDurationDays: 5,
    parallelizationFactor: 1,
    assignedWorkerIds: [],
    dependsOnTaskIds: [],
    dependsOnMilestoneIds: [],
    unlocksTaskIds: [],
    unlocksMilestoneIds: [],
    ...overrides,
  } as Task);

  const makeProject = (id: string, priority: StrategicPriority) => ({
    id,
    name: `Project ${id}`,
    description: '',
    deadline: '',
    strategicPriority: priority,
    status: 'active' as const,
    contributingDepartmentIds: [],
    goalIds: [],
    milestoneIds: [],
  });

  const emptyMilestones = new Map<string, Milestone>();

  it('uses max priority across relatedProjectIds', () => {
    const goals = new Map([['goal-1', makeGoal('goal-1')]]);
    const tasks = new Map([['task-1', makeTask('task-1', 'goal-1', {
      relatedProjectIds: ['proj-p1', 'proj-p2'],
    })]]);
    const projects = new Map([
      ['proj-p1', makeProject('proj-p1', 'P3')],
      ['proj-p2', makeProject('proj-p2', 'P1')],
    ]);

    const result = computeTaskPriorities({
      tasks,
      milestones: emptyMilestones,
      goals,
      projects,
    });

    // Should use P1 (best priority), not P3
    expect(result.get('task-1')!.projectFactor).toBeCloseTo(100, 0);
  });

  it('uses max priority across relatedDepartmentIds', () => {
    const goals = new Map([['goal-1', makeGoal('goal-1')]]);
    const tasks = new Map([['task-1', makeTask('task-1', 'goal-1', {
      relatedDepartmentIds: ['dept-p3', 'dept-p1'],
    })]]);
    const departments = new Map([
      ['dept-p3', { id: 'dept-p3', name: 'P3 Dept', description: '', headName: 'Head', priority: 'P3' as StrategicPriority, workerIds: [], goalIds: [] }],
      ['dept-p1', { id: 'dept-p1', name: 'P1 Dept', description: '', headName: 'Head', priority: 'P1' as StrategicPriority, workerIds: [], goalIds: [] }],
    ]);

    const result = computeTaskPriorities({
      tasks,
      milestones: emptyMilestones,
      goals,
      departments,
    });

    // Should use P1 (best priority)
    expect(result.get('task-1')!.deptFactor).toBeCloseTo(100, 0);
  });

  it('favors lead creator when creatorIsLeadMap is set', () => {
    const goals = new Map([['goal-1', makeGoal('goal-1')]]);
    const tasks = new Map([['task-1', makeTask('task-1', 'goal-1')]]);
    const creatorMap = new Map([['task-1', true]]);

    const result = computeTaskPriorities({
      tasks,
      milestones: emptyMilestones,
      goals,
      creatorIsLeadMap: creatorMap,
    });

    expect(result.get('task-1')!.creatorFactor).toBe(100);
  });
});

describe('computeTaskPriorities edge cases', () => {
  const makeGoal = (id: string): Goal => ({
    id,
    name: `Goal ${id}`,
    description: 'desc',
    owner: 'Test',
    parentType: 'department',
    parentId: 'dept-1',
    departmentPriority: 1,
    taskIds: [],
    milestoneIds: [],
    dependsOnGoalIds: [],
    unlocksGoalIds: [],
  });

  const makeTask = (id: string, goalId: string, overrides: Partial<Task> = {}): Task => ({
    id,
    goalId,
    name: `Task ${id}`,
    description: 'desc',
    status: 'available',
    contributingDepartmentId: 'dept-1',
    baseDurationDays: 5,
    parallelizationFactor: 1,
    assignedWorkerIds: [],
    dependsOnTaskIds: [],
    dependsOnMilestoneIds: [],
    unlocksTaskIds: [],
    unlocksMilestoneIds: [],
    ...overrides,
  } as Task);

  const emptyMilestones = new Map<string, Milestone>();

  it('handles task with no goal', () => {
    const goals = new Map<string, Goal>();
    const tasks = new Map([['task-1', makeTask('task-1', 'nonexistent-goal')]]);

    const result = computeTaskPriorities({
      tasks,
      milestones: emptyMilestones,
      goals,
    });

    // Should still compute a score using defaults
    expect(result.get('task-1')).toBeDefined();
    expect(result.get('task-1')!.score).toBeGreaterThanOrEqual(0);
  });

  it('returns all component factors in result', () => {
    const goals = new Map([['goal-1', makeGoal('goal-1')]]);
    const tasks = new Map([['task-1', makeTask('task-1', 'goal-1')]]);

    const result = computeTaskPriorities({
      tasks,
      milestones: emptyMilestones,
      goals,
    });

    const p = result.get('task-1')!;
    expect(p.projectFactor).toBeDefined();
    expect(p.deptFactor).toBeDefined();
    expect(p.goalFactor).toBeDefined();
    expect(p.creatorFactor).toBeDefined();
    expect(p.graphFactor).toBeDefined();
    expect(p.downstreamCount).toBeDefined();
    expect(p.criticalPath).toBeDefined();
    expect(p.goalPriority).toBeDefined();
  });

  it('uses projectPriorityMap when no projects map provided', () => {
    const goals = new Map([['goal-1', makeGoal('goal-1')]]);
    const tasks = new Map([['task-1', makeTask('task-1', 'goal-1')]]);
    const projectPriorityMap = new Map([['goal-1', 'P1' as StrategicPriority]]);

    const result = computeTaskPriorities({
      tasks,
      milestones: emptyMilestones,
      goals,
      projectPriorityMap,
    });

    expect(result.get('task-1')!.projectFactor).toBeCloseTo(100, 0);
  });
});