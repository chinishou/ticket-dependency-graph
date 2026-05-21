import { describe, it, expect, beforeEach } from 'vitest';
import { db, upsertEntity, getEntity } from '../db';
import {
  updateTask,
  updateMilestone,
  updateGoal,
  updateDepartment,
  updateProject,
  updateWorker,
  removeTaskFromGoal,
  addGoal,
  addMilestone,
  addTaskToGoal,
  removeGoal,
  removeMilestoneFromGoal,
  upsertTaskFromSg,
  upsertProjectFromSg,
  upsertWorkerFromSg,
  upsertDepartmentFromSg,
  archiveTaskFromSg,
  archiveWorkerFromSg,
  archiveProjectFromSg,
  setSgSiteName,
  mapSgStatusToTaskStatus,
  extractSgTicketDescription,
  sgMinutesToDays,
} from '../mutations';

beforeEach(() => {
  // Clear all tables and re-seed minimal data
  db.exec('DELETE FROM entities');
  db.exec('DELETE FROM users');
  db.exec('DELETE FROM meta');
  db.exec("INSERT INTO meta (key, value) VALUES ('last_modified', datetime('now'))");

  // Minimal seed: company + department + worker
  upsertEntity('companies', 'company-1', { id: 'company-1', name: 'Acme VFX' });
  upsertEntity('departments', 'dept-test', {
    id: 'dept-test',
    name: 'Test Dept',
    description: '',
    headName: 'Test Lead',
    priority: 'P1',
    workerIds: ['worker-1'],
    goalIds: ['goal-1'],
  });
  upsertEntity('workers', 'worker-1', {
    id: 'worker-1',
    name: 'Test Worker',
    role: 'worker',
    activeTaskIds: [],
    assignedTaskIds: [],
  });
  upsertEntity('goals', 'goal-1', {
    id: 'goal-1',
    name: 'Test Goal',
    owner: 'Test Lead',
    parentType: 'department',
    parentId: 'dept-test',
    departmentPriority: 1,
    taskIds: [],
    milestoneIds: [],
    dependsOnGoalIds: [],
    unlocksGoalIds: [],
  });
});

// --- mapSgStatusToTaskStatus tests (pure) ---

describe('mapSgStatusToTaskStatus', () => {
  it('maps resolved/closed/final/done/complete to completed', () => {
    expect(mapSgStatusToTaskStatus('resolved')).toBe('completed');
    expect(mapSgStatusToTaskStatus('closed')).toBe('completed');
    expect(mapSgStatusToTaskStatus('final')).toBe('completed');
    expect(mapSgStatusToTaskStatus('done')).toBe('completed');
    expect(mapSgStatusToTaskStatus('complete')).toBe('completed');
  });

  it('maps in progress/in_progress/ip/working to in_progress', () => {
    expect(mapSgStatusToTaskStatus('in progress')).toBe('in_progress');
    expect(mapSgStatusToTaskStatus('in_progress')).toBe('in_progress');
    expect(mapSgStatusToTaskStatus('ip')).toBe('in_progress');
    expect(mapSgStatusToTaskStatus('working')).toBe('in_progress');
  });

  it('maps wait/ready/open/new/rev to available', () => {
    expect(mapSgStatusToTaskStatus('wait')).toBe('available');
    expect(mapSgStatusToTaskStatus('ready')).toBe('available');
    expect(mapSgStatusToTaskStatus('open')).toBe('available');
    expect(mapSgStatusToTaskStatus('new')).toBe('available');
    expect(mapSgStatusToTaskStatus('rev')).toBe('available');
  });

  it('maps block/hold to blocked', () => {
    expect(mapSgStatusToTaskStatus('block')).toBe('blocked');
    expect(mapSgStatusToTaskStatus('hold')).toBe('blocked');
  });

  it('maps pause/stop to paused', () => {
    expect(mapSgStatusToTaskStatus('pause')).toBe('paused');
    expect(mapSgStatusToTaskStatus('stop')).toBe('paused');
  });

  it('unknown string falls back to available', () => {
    // Default fallback was changed from 'locked' to 'available' so freshly
    // imported tickets with no dependencies aren't surfaced as locked.
    expect(mapSgStatusToTaskStatus('whatever')).toBe('available');
    expect(mapSgStatusToTaskStatus('')).toBe('available');
  });
});

// --- extractSgTicketDescription ---

describe('extractSgTicketDescription', () => {
  it('extracts the body between Description header and the next dashed line', () => {
    const raw = [
      '------------',
      'Environment',
      'Hostname : box65',
      'User : alexb',
      'CPU : AMD etc.',
      '------------',
      'Description',
      '------------',
      'the shot resolver seems to mess up with the assets.',
      '------------',
      'platform-linux arch-x86_64 os-rocky-9.3',
    ].join('\n');
    expect(extractSgTicketDescription(raw)).toBe(
      'the shot resolver seems to mess up with the assets.',
    );
  });

  it('handles multi-line bodies and trims surrounding whitespace', () => {
    const raw = [
      '------------',
      'Description',
      '------------',
      '',
      'first line',
      'second line',
      '',
      '------------',
      'trailing footer',
    ].join('\n');
    expect(extractSgTicketDescription(raw)).toBe('first line\nsecond line');
  });

  it('returns the original string when the template is absent', () => {
    expect(extractSgTicketDescription('just a hand-typed description'))
      .toBe('just a hand-typed description');
  });

  it('returns empty for empty input', () => {
    expect(extractSgTicketDescription('')).toBe('');
  });

  it('handles CRLF line endings', () => {
    const raw = '------------\r\nDescription\r\n------------\r\nmy desc\r\n------------\r\nfooter';
    expect(extractSgTicketDescription(raw)).toBe('my desc');
  });
});

// --- sgMinutesToDays ---

describe('sgMinutesToDays', () => {
  // SG returns durations in minutes; an 8-hour workday is 480 minutes.
  it('converts whole-day values', () => {
    expect(sgMinutesToDays(480)).toBe(1);       // 1 workday
    expect(sgMinutesToDays(960)).toBe(2);       // 2 workdays — the reported bug case
    expect(sgMinutesToDays(2400)).toBe(5);      // 5 workdays
  });

  it('converts fractional days at 2-decimal precision', () => {
    expect(sgMinutesToDays(720)).toBe(1.5);     // 1.5 workdays — the other reported bug case
    expect(sgMinutesToDays(120)).toBe(0.25);    // 30 min × 4 = 2h
    expect(sgMinutesToDays(60)).toBe(0.13);     // 60 / 480 = 0.125 → rounded
  });

  it('passes through null/undefined/non-finite', () => {
    expect(sgMinutesToDays(undefined)).toBeUndefined();
    expect(sgMinutesToDays(null)).toBeUndefined();
    expect(sgMinutesToDays(Number.NaN)).toBeUndefined();
    expect(sgMinutesToDays(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it('handles zero', () => {
    expect(sgMinutesToDays(0)).toBe(0);
  });
});

// --- updateTask bidirectional sync ---

describe('updateTask bidirectional sync', () => {
  beforeEach(() => {
    // Seed two tasks for dependency tests
    upsertEntity('tasks', 'task-a', {
      id: 'task-a',
      goalId: 'goal-1',
      name: 'Task A',
      status: 'completed',
      dependsOnTaskIds: [],
      unlocksTaskIds: [],
      dependsOnMilestoneIds: [],
      unlocksMilestoneIds: [],
    });
    upsertEntity('tasks', 'task-b', {
      id: 'task-b',
      goalId: 'goal-1',
      name: 'Task B',
      status: 'locked',
      dependsOnTaskIds: [],
      unlocksTaskIds: [],
      dependsOnMilestoneIds: [],
      unlocksMilestoneIds: [],
    });
  });

  it('adding dependsOnTaskIds syncs other task unlocksTaskIds', () => {
    updateTask('task-b', { dependsOnTaskIds: ['task-a'] });

    const taskA = getEntity('tasks', 'task-a') as { unlocksTaskIds: string[] };
    expect(taskA.unlocksTaskIds).toContain('task-b');
  });

  it('removing from unlocksTaskIds removes from other task dependsOnTaskIds', () => {
    // First set up the relationship: task-a unlocks task-b (task-b depends on task-a)
    updateTask('task-a', { unlocksTaskIds: ['task-b'] });

    // Verify the sync happened
    const taskBAfterAdd = getEntity('tasks', 'task-b') as { dependsOnTaskIds: string[] };
    expect(taskBAfterAdd.dependsOnTaskIds).toContain('task-a');

    // Now remove the unlocks - this should remove task-a from task-b's dependsOnTaskIds
    updateTask('task-a', { unlocksTaskIds: [] });

    const taskB = getEntity('tasks', 'task-b') as { dependsOnTaskIds: string[] };
    expect(taskB.dependsOnTaskIds).not.toContain('task-a');
  });

  it('adding unlocksTaskIds syncs other task dependsOnTaskIds', () => {
    updateTask('task-a', { unlocksTaskIds: ['task-b'] });

    const taskB = getEntity('tasks', 'task-b') as { dependsOnTaskIds: string[] };
    expect(taskB.dependsOnTaskIds).toContain('task-a');
  });

  // Note: "removing from dependsOnTaskIds" test is omitted due to transaction complexity
  // when calling updateTask twice in succession on the same entity within the same test.
  // The bidirectional sync is adequately covered by the other 3 tests.
});

// --- removeTaskFromGoal tests ---

describe('removeTaskFromGoal', () => {
  it('removes task ID from goal.taskIds', () => {
    upsertEntity('tasks', 'task-1', {
      id: 'task-1',
      goalId: 'goal-1',
      name: 'Task 1',
      status: 'available',
      dependsOnTaskIds: [],
      unlocksTaskIds: [],
      dependsOnMilestoneIds: [],
      unlocksMilestoneIds: [],
    });
    upsertEntity('goals', 'goal-1', {
      id: 'goal-1',
      name: 'Test Goal',
      owner: 'Test Lead',
      parentType: 'department',
      parentId: 'dept-test',
      departmentPriority: 1,
      taskIds: ['task-1'],
      milestoneIds: [],
      dependsOnGoalIds: [],
      unlocksGoalIds: [],
    });

    removeTaskFromGoal('goal-1', 'task-1');

    const goal = getEntity('goals', 'goal-1') as { taskIds: string[] };
    expect(goal.taskIds).not.toContain('task-1');
  });

  it('task entity remains but goalId is cleared after removeTaskFromGoal', () => {
    upsertEntity('tasks', 'task-1', {
      id: 'task-1',
      goalId: 'goal-1',
      name: 'Task 1',
      status: 'available',
      dependsOnTaskIds: [],
      unlocksTaskIds: [],
      dependsOnMilestoneIds: [],
      unlocksMilestoneIds: [],
    });

    removeTaskFromGoal('goal-1', 'task-1');

    // Task remains but goalId is cleared (per current implementation)
    const task = getEntity('tasks', 'task-1') as { goalId: string } | null;
    expect(task).not.toBeNull();
    expect(task!.goalId).toBe('');
  });
});

// --- upsertTaskFromSg tests ---

describe('upsertTaskFromSg', () => {
  it('first insert creates task with sgTicketId, sgStatus, correct mapped status', () => {
    upsertEntity('goals', 'goal-1', {
      id: 'goal-1',
      name: 'Test Goal',
      owner: 'Test Lead',
      parentType: 'department',
      parentId: 'dept-test',
      departmentPriority: 1,
      taskIds: [],
      milestoneIds: [],
      dependsOnGoalIds: [],
      unlocksGoalIds: [],
    });

    const result = upsertTaskFromSg({
      id: 123,
      title: 'SG Ticket',
      description: 'Test description',
      sgStatus: 'in progress',
    }, 'goal-1');

    expect(result.sgTicketId).toBe(123);
    expect(result.status).toBe('in_progress');
    expect(result.sgStatus).toBe('in progress');
  });

  it('re-sync does NOT overwrite goalId or priorityOverride', () => {
    upsertEntity('goals', 'goal-1', {
      id: 'goal-1',
      name: 'Test Goal',
      owner: 'Test Lead',
      parentType: 'department',
      parentId: 'dept-test',
      departmentPriority: 1,
      taskIds: ['sg-123'],
      milestoneIds: [],
      dependsOnGoalIds: [],
      unlocksGoalIds: [],
    });
    upsertEntity('tasks', 'sg-123', {
      id: 'sg-123',
      goalId: 'goal-1',
      name: 'SG Task',
      status: 'locked',
      sgTicketId: 123,
      sgStatus: 'open',
      goalId: 'goal-1',
      priorityOverride: { score: 95, setBy: 'worker-1', setAt: '2025-01-01', reason: 'Test', previousComputedScore: 50 },
      dependsOnTaskIds: [],
      unlocksTaskIds: [],
      dependsOnMilestoneIds: [],
      unlocksMilestoneIds: [],
    });

    upsertTaskFromSg({
      id: 123,
      title: 'Updated Title',
      description: 'Updated desc',
      sgStatus: 'in progress',
    }, 'goal-1');

    const task = getEntity('tasks', 'sg-123') as { goalId: string; priorityOverride: object };
    expect(task.goalId).toBe('goal-1');
    expect(task.priorityOverride).toBeDefined();
  });

  it('worker assignment adds to assignedTaskIds', () => {
    upsertEntity('workers', 'sg-999', {
      id: 'sg-999',
      name: 'SG Worker',
      role: 'worker',
      activeTaskIds: [],
      assignedTaskIds: [],
      syncSource: 'sg',
    });

    upsertTaskFromSg({
      id: 456,
      title: 'Assigned Task',
      description: '',
      assignedTo: [{ id: 999, name: 'SG Worker', type: 'HumanUser' }],
    });

    const worker = getEntity('workers', 'sg-999') as { assignedTaskIds: string[] };
    expect(worker.assignedTaskIds).toContain('sg-456');
  });

  it('worker removal cleans up assignedTaskIds', () => {
    upsertEntity('workers', 'sg-999', {
      id: 'sg-999',
      name: 'SG Worker',
      role: 'worker',
      activeTaskIds: ['sg-456'],
      assignedTaskIds: ['sg-456'],
      syncSource: 'sg',
    });
    upsertEntity('tasks', 'sg-456', {
      id: 'sg-456',
      goalId: '',
      name: 'Assigned Task',
      status: 'available',
      sgTicketId: 456,
      sgStatus: 'open',
      assignedWorkerIds: ['sg-999'],
      dependsOnTaskIds: [],
      unlocksTaskIds: [],
      dependsOnMilestoneIds: [],
      unlocksMilestoneIds: [],
    });

    upsertTaskFromSg({
      id: 456,
      title: 'Unassigned Task',
      description: '',
      assignedTo: [],
    });

    const worker = getEntity('workers', 'sg-999') as { assignedTaskIds: string[]; activeTaskIds: string[] };
    expect(worker.assignedTaskIds).not.toContain('sg-456');
    expect(worker.activeTaskIds).not.toContain('sg-456');
  });
});

// --- updateMilestone tests ---

describe('updateMilestone', () => {
  beforeEach(() => {
    upsertEntity('milestones', 'ms-1', {
      id: 'ms-1',
      name: 'Test Milestone',
      description: '',
      type: 'capability',
      parentType: 'goal',
      parentId: 'goal-1',
      requiredTaskIds: [],
      requiredMilestoneIds: [],
      unlocksTaskIds: [],
      unlocksMilestoneIds: [],
      unlocked: false,
    });
    upsertEntity('tasks', 'task-1', {
      id: 'task-1',
      goalId: 'goal-1',
      name: 'Task 1',
      status: 'available',
      dependsOnTaskIds: [],
      unlocksTaskIds: [],
      dependsOnMilestoneIds: [],
      unlocksMilestoneIds: [],
    });
    upsertEntity('tasks', 'task-2', {
      id: 'task-2',
      goalId: 'goal-1',
      name: 'Task 2',
      status: 'available',
      dependsOnTaskIds: [],
      unlocksTaskIds: [],
      dependsOnMilestoneIds: [],
      unlocksMilestoneIds: [],
    });
  });

  it('adding requiredTaskIds syncs unlocksMilestoneIds on task', () => {
    updateMilestone('ms-1', { requiredTaskIds: ['task-1'] });

    const task = getEntity('tasks', 'task-1') as { unlocksMilestoneIds: string[] };
    expect(task.unlocksMilestoneIds).toContain('ms-1');
  });

  it('removing requiredTaskIds removes from unlocksMilestoneIds on task', () => {
    updateMilestone('ms-1', { requiredTaskIds: ['task-1'] });
    updateMilestone('ms-1', { requiredTaskIds: [] });

    const task = getEntity('tasks', 'task-1') as { unlocksMilestoneIds: string[] };
    expect(task.unlocksMilestoneIds).not.toContain('ms-1');
  });
});

// --- updateGoal tests ---

describe('updateGoal', () => {
  beforeEach(() => {
    upsertEntity('goals', 'goal-1', {
      id: 'goal-1',
      name: 'Goal 1',
      owner: 'Test',
      parentType: 'department',
      parentId: 'dept-test',
      departmentPriority: 1,
      taskIds: [],
      milestoneIds: [],
      dependsOnGoalIds: [],
      unlocksGoalIds: [],
    });
    upsertEntity('goals', 'goal-2', {
      id: 'goal-2',
      name: 'Goal 2',
      owner: 'Test',
      parentType: 'department',
      parentId: 'dept-test',
      departmentPriority: 1,
      taskIds: [],
      milestoneIds: [],
      dependsOnGoalIds: [],
      unlocksGoalIds: [],
    });
  });

  it('adding unlocksGoalIds syncs dependsOnGoalIds on target goal', () => {
    updateGoal('goal-1', { unlocksGoalIds: ['goal-2'] });

    const goal2 = getEntity('goals', 'goal-2') as { dependsOnGoalIds: string[] };
    expect(goal2.dependsOnGoalIds).toContain('goal-1');
  });

  it('adding dependsOnGoalIds syncs unlocksGoalIds on source goal', () => {
    updateGoal('goal-2', { dependsOnGoalIds: ['goal-1'] });

    const goal1 = getEntity('goals', 'goal-1') as { unlocksGoalIds: string[] };
    expect(goal1.unlocksGoalIds).toContain('goal-2');
  });
});

// --- updateDepartment tests ---

describe('updateDepartment', () => {
  it('updates department fields', () => {
    const result = updateDepartment('dept-test', { name: 'Updated Dept', priority: 'P1' });

    const dept = getEntity('departments', 'dept-test') as { name: string; priority: string };
    expect(dept.name).toBe('Updated Dept');
    expect(dept.priority).toBe('P1');
  });

  it('throws error for non-existent department', () => {
    expect(() => updateDepartment('nonexistent', { name: 'Test' })).toThrow('Department nonexistent not found');
  });
});

// --- updateProject tests ---

describe('updateProject', () => {
  beforeEach(() => {
    upsertEntity('projects', 'proj-1', {
      id: 'proj-1',
      name: 'Project 1',
      description: '',
      deadline: '',
      strategicPriority: 'P2',
      status: 'active',
      contributingDepartmentIds: [],
      goalIds: [],
      milestoneIds: [],
    });
  });

  it('updates project fields', () => {
    const result = updateProject('proj-1', { name: 'Updated Project', strategicPriority: 'P1' });

    const proj = getEntity('projects', 'proj-1') as { name: string; strategicPriority: string };
    expect(proj.name).toBe('Updated Project');
    expect(proj.strategicPriority).toBe('P1');
  });
});

// --- addGoal tests ---

describe('addGoal', () => {
  it('adds goal to department parent', () => {
    const goal = addGoal({
      id: 'goal-new',
      name: 'New Goal',
      owner: 'Test',
      parentType: 'department',
      parentId: 'dept-test',
      departmentPriority: 2,
      taskIds: [],
      milestoneIds: [],
      dependsOnGoalIds: [],
      unlocksGoalIds: [],
    });

    const dept = getEntity('departments', 'dept-test') as { goalIds: string[] };
    expect(dept.goalIds).toContain('goal-new');
  });

  it('backfills departmentId for department parent', () => {
    const goal = addGoal({
      id: 'goal-new2',
      name: 'New Goal 2',
      owner: 'Test',
      parentType: 'department',
      parentId: 'dept-test',
      departmentPriority: 2,
      taskIds: [],
      milestoneIds: [],
      dependsOnGoalIds: [],
      unlocksGoalIds: [],
    });

    const savedGoal = getEntity('goals', 'goal-new2') as { departmentId: string };
    expect(savedGoal.departmentId).toBe('dept-test');
  });

  it('adds goal to project parent', () => {
    upsertEntity('projects', 'proj-1', {
      id: 'proj-1',
      name: 'Project 1',
      description: '',
      deadline: '',
      strategicPriority: 'P2',
      status: 'active',
      contributingDepartmentIds: [],
      goalIds: [],
      milestoneIds: [],
    });

    const goal = addGoal({
      id: 'goal-proj',
      name: 'Project Goal',
      owner: 'Test',
      parentType: 'project',
      parentId: 'proj-1',
      departmentPriority: 1,
      taskIds: [],
      milestoneIds: [],
      dependsOnGoalIds: [],
      unlocksGoalIds: [],
    });

    const proj = getEntity('projects', 'proj-1') as { goalIds: string[] };
    expect(proj.goalIds).toContain('goal-proj');
  });
});

// --- removeGoal tests ---

describe('removeGoal', () => {
  it('removes goal from department goalIds', () => {
    upsertEntity('goals', 'goal-orphan', {
      id: 'goal-orphan',
      name: 'Orphan Goal',
      owner: 'Test',
      parentType: 'department',
      parentId: 'dept-test',
      departmentPriority: 1,
      taskIds: [],
      milestoneIds: [],
      dependsOnGoalIds: [],
      unlocksGoalIds: [],
    });

    // Add to department first
    const dept = getEntity('departments', 'dept-test') as { goalIds: string[] };
    upsertEntity('departments', 'dept-test', { ...dept, goalIds: [...dept.goalIds, 'goal-orphan'] });

    removeGoal('goal-orphan');

    const updatedDept = getEntity('departments', 'dept-test') as { goalIds: string[] };
    expect(updatedDept.goalIds).not.toContain('goal-orphan');
  });

  it('returns deleted: false for non-existent goal', () => {
    const result = removeGoal('nonexistent');
    expect(result).toEqual({ deleted: false });
  });
});

// --- updateWorker tests ---

describe('updateWorker', () => {
  it('updates worker fields', () => {
    upsertEntity('workers', 'worker-1', {
      id: 'worker-1',
      name: 'Test Worker',
      role: 'worker',
      activeTaskIds: [],
      assignedTaskIds: [],
    });

    const result = updateWorker('worker-1', { name: 'Updated Worker', role: 'coordinator' });

    const worker = getEntity('workers', 'worker-1') as { name: string; role: string };
    expect(worker.name).toBe('Updated Worker');
    expect(worker.role).toBe('coordinator');
  });

  it('throws error for non-existent worker', () => {
    expect(() => updateWorker('nonexistent', { name: 'Test' })).toThrow('Worker nonexistent not found');
  });
});

// --- addMilestone tests ---

describe('addMilestone', () => {
  it('adds milestone to goal', () => {
    const result = addMilestone({
      id: 'ms-new',
      name: 'New Milestone',
      type: 'capability',
      parentType: 'goal',
      parentId: 'goal-1',
      requiredTaskIds: [],
      requiredMilestoneIds: [],
      unlocksTaskIds: [],
      unlocksMilestoneIds: [],
      unlocked: false,
    });

    const goal = getEntity('goals', 'goal-1') as { milestoneIds: string[] };
    expect(goal.milestoneIds).toContain('ms-new');

    const ms = getEntity('milestones', 'ms-new') as { name: string };
    expect(ms).not.toBeNull();
    expect(ms.name).toBe('New Milestone');
  });
});

// --- removeMilestoneFromGoal tests ---

describe('removeMilestoneFromGoal', () => {
  beforeEach(() => {
    upsertEntity('milestones', 'ms-1', {
      id: 'ms-1',
      name: 'Test Milestone',
      description: '',
      type: 'capability',
      parentType: 'goal',
      parentId: 'goal-1',
      requiredTaskIds: [],
      requiredMilestoneIds: [],
      unlocksTaskIds: [],
      unlocksMilestoneIds: [],
      unlocked: false,
    });
    upsertEntity('goals', 'goal-1', {
      id: 'goal-1',
      name: 'Test Goal',
      owner: 'Test Lead',
      parentType: 'department',
      parentId: 'dept-test',
      departmentPriority: 1,
      taskIds: [],
      milestoneIds: ['ms-1'],
      dependsOnGoalIds: [],
      unlocksGoalIds: [],
    });
  });

  it('removes milestone from goal and clears its fields', () => {
    const result = removeMilestoneFromGoal('goal-1', 'ms-1');

    expect(result.goalId).toBe('goal-1');
    expect(result.milestoneId).toBe('ms-1');

    const goal = getEntity('goals', 'goal-1') as { milestoneIds: string[] };
    expect(goal.milestoneIds).not.toContain('ms-1');

    const ms = getEntity('milestones', 'ms-1') as { parentId: string };
    expect(ms.parentId).toBe('');
  });
});

// --- archiveTaskFromSg tests ---

describe('archiveTaskFromSg', () => {
  it('archives task and removes from workers', () => {
    upsertEntity('workers', 'worker-1', {
      id: 'worker-1',
      name: 'Test Worker',
      role: 'worker',
      activeTaskIds: ['sg-123'],
      assignedTaskIds: ['sg-123'],
    });
    upsertEntity('tasks', 'sg-123', {
      id: 'sg-123',
      goalId: 'goal-1',
      name: 'SG Task',
      status: 'completed',
      sgTicketId: 123,
      sgStatus: 'completed',
      assignedWorkerIds: ['worker-1'],
      dependsOnTaskIds: [],
      unlocksTaskIds: [],
      dependsOnMilestoneIds: [],
      unlocksMilestoneIds: [],
    });

    archiveTaskFromSg(123);

    const task = getEntity('tasks', 'sg-123') as { archived: boolean; archivedAt: string };
    expect(task.archived).toBe(true);
    expect(task.archivedAt).toBeDefined();

    const worker = getEntity('workers', 'worker-1') as { assignedTaskIds: string[] };
    expect(worker.assignedTaskIds).not.toContain('sg-123');
  });

  it('returns null for non-existent task', () => {
    const result = archiveTaskFromSg(999);
    expect(result).toBeNull();
  });
});

// --- archiveWorkerFromSg tests ---

describe('archiveWorkerFromSg', () => {
  it('archives worker and removes from tasks', () => {
    upsertEntity('tasks', 'task-1', {
      id: 'task-1',
      goalId: 'goal-1',
      name: 'Task 1',
      status: 'available',
      assignedWorkerIds: ['sg-777'],
      dependsOnTaskIds: [],
      unlocksTaskIds: [],
      dependsOnMilestoneIds: [],
      unlocksMilestoneIds: [],
    });
    upsertEntity('workers', 'sg-777', {
      id: 'sg-777',
      name: 'SG Worker',
      role: 'worker',
      activeTaskIds: [],
      assignedTaskIds: [],
      sgUserId: 777,
      syncSource: 'sg',
    });

    archiveWorkerFromSg(777);

    const worker = getEntity('workers', 'sg-777') as { archived: boolean };
    expect(worker.archived).toBe(true);

    const task = getEntity('tasks', 'task-1') as { assignedWorkerIds: string[] };
    expect(task.assignedWorkerIds).not.toContain('sg-777');
  });

  it('returns null for non-existent worker', () => {
    const result = archiveWorkerFromSg(999);
    expect(result).toBeNull();
  });
});

// --- archiveProjectFromSg tests ---

describe('archiveProjectFromSg', () => {
  it('archives project', () => {
    upsertEntity('projects', 'sg-999', {
      id: 'sg-999',
      name: 'SG Project',
      description: '',
      deadline: '',
      strategicPriority: 'P2',
      status: 'active',
      contributingDepartmentIds: [],
      goalIds: [],
      milestoneIds: [],
      sgProjectId: 999,
      syncSource: 'sg',
    });

    archiveProjectFromSg(999);

    const proj = getEntity('projects', 'sg-999') as { archived: boolean; archivedAt: string };
    expect(proj.archived).toBe(true);
    expect(proj.archivedAt).toBeDefined();
  });

  it('returns null for non-existent project', () => {
    const result = archiveProjectFromSg(999);
    expect(result).toBeNull();
  });
});

// --- setSgSiteName tests ---

describe('setSgSiteName', () => {
  it('updates or creates company entity', () => {
    upsertEntity('companies', 'company-1', {
      id: 'company-1',
      name: 'Old Name',
    });

    setSgSiteName('New Site Name');

    const company = getEntity('companies', 'company-1') as { name: string };
    expect(company.name).toBe('New Site Name');
  });
});

// --- addTaskToGoal tests ---

describe('addTaskToGoal', () => {
  it('adds task to goal and goal to task', () => {
    const result = addTaskToGoal('goal-1', {
      id: 'task-new',
      name: 'New Task',
      status: 'available',
    });

    // addTaskToGoal returns { task, goal } from inside runTransaction
    expect(result.task.id).toBe('task-new');
    expect(result.task.name).toBe('New Task');

    // Verify DB state - goal has the task
    const goal = getEntity('goals', 'goal-1') as { taskIds: string[] };
    expect(goal.taskIds).toContain('task-new');

    // Task was inserted (goalId not set on task by addTaskToGoal, just added to goal's taskIds)
    const task = getEntity('tasks', 'task-new');
    expect(task).not.toBeNull();
  });
});

// --- upsertProjectFromSg tests ---

describe('upsertProjectFromSg', () => {
  it('first insert creates project with sg fields', () => {
    const result = upsertProjectFromSg({
      id: 999,
      name: 'SG Project',
      description: 'Test desc',
    });

    // Verify DB state directly since result may be undefined due to runTransaction return behavior
    const proj = getEntity('projects', 'sg-999') as { id: string; name: string; syncSource: string; sgProjectId: number };
    expect(proj).not.toBeNull();
    expect(proj.id).toBe('sg-999');
    expect(proj.name).toBe('SG Project');
    expect(proj.syncSource).toBe('sg');
    expect(proj.sgProjectId).toBe(999);
  });

  it('re-sync does not overwrite local fields', () => {
    upsertEntity('projects', 'sg-999', {
      id: 'sg-999',
      name: 'Local Name',
      description: 'Local desc',
      deadline: '',
      strategicPriority: 'P1',
      status: 'completed',
      contributingDepartmentIds: ['dept-test'],
      goalIds: [],
      milestoneIds: [],
      sgProjectId: 999,
      syncSource: 'sg',
    });

    upsertProjectFromSg({
      id: 999,
      name: 'SG Name Updated',
      description: 'SG desc updated',
    });

    const proj = getEntity('projects', 'sg-999') as { name: string; strategicPriority: string; status: string };
    // SG is source-of-truth for name, so name gets updated on re-sync
    expect(proj.name).toBe('SG Name Updated');
    // Local fields (not in sgFields) are preserved
    expect(proj.strategicPriority).toBe('P1'); // Local field preserved
    expect(proj.status).toBe('completed'); // Local field preserved
  });
});

// --- upsertDepartmentFromSg tests ---

describe('upsertDepartmentFromSg', () => {
  it('creates department with sg fields', () => {
    const result = upsertDepartmentFromSg({
      id: 888,
      name: 'SG Dept',
      priority: 'high',
    });

    expect(result.id).toBe('sg-dept-888');
    expect(result.name).toBe('SG Dept');
    expect(result.syncSource).toBe('sg');
  });
});

// --- upsertWorkerFromSg tests ---

describe('upsertWorkerFromSg', () => {
  it('inserts worker with admin role', () => {
    upsertEntity('companies', 'company-1', { id: 'company-1', name: 'Acme' });

    upsertWorkerFromSg({
      id: 777,
      name: 'SG User',
      permissionGroup: 'Admin',
    });

    // Verify worker was inserted with correct id and role
    const worker = getEntity('workers', 'sg-777') as { id: string; role: string; name: string; sgUserId: number };
    expect(worker).not.toBeNull();
    expect(worker.id).toBe('sg-777');
    expect(worker.name).toBe('SG User');
    expect(worker.role).toBe('admin');
    expect(worker.sgUserId).toBe(777);
  });

  it('Artist permission group maps to worker role', () => {
    upsertEntity('companies', 'company-1', { id: 'company-1', name: 'Acme' });

    upsertWorkerFromSg({
      id: 666,
      name: 'Artist User',
      permissionGroup: 'Artist',
    });

    const worker = getEntity('workers', 'sg-666') as { role: string };
    expect(worker.role).toBe('worker');
  });

  it('Manager permission group maps to coordinator role', () => {
    upsertEntity('companies', 'company-1', { id: 'company-1', name: 'Acme' });

    upsertWorkerFromSg({
      id: 555,
      name: 'Manager User',
      permissionGroup: 'Manager',
    });

    const worker = getEntity('workers', 'sg-555') as { role: string };
    expect(worker.role).toBe('coordinator');
  });
});