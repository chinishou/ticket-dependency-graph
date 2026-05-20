import type {
  Company, Department, Project, Goal, Task, Milestone, Worker,
} from '../types';

// Minimal demo seed. One of every entity type so a fresh DB has something to
// render. Real data comes from SG sync; everything below is intended to be
// deletable from Settings → SG → Data Cleanup once the user has imported.

// === Company ===
export const company: Company = {
  id: 'company-1',
  name: 'Demo Studio',
};

// === Departments ===
export const departments: Department[] = [
  {
    id: 'dept-pipeline',
    name: 'Pipeline',
    description: 'Demo department',
    headName: 'Demo Lead',
    priority: 'P1',
    workerIds: ['w-demo-1', 'w-demo-2'],
    goalIds: ['goal-demo'],
  },
];

// === Projects ===
export const projects: Project[] = [
  {
    id: 'proj-demo',
    name: 'Demo Project',
    description: 'Sample project for the demo seed',
    deadline: '2026-12-31',
    strategicPriority: 'P1',
    status: 'active',
    contributingDepartmentIds: ['dept-pipeline'],
    goalIds: ['goal-demo'],
    milestoneIds: ['ms-demo'],
  },
];

// === Goals ===
export const goals: Goal[] = [
  {
    id: 'goal-demo',
    name: 'Demo Goal',
    description: 'Sample goal — replace with imported data',
    owner: 'Demo Lead',
    parentType: 'department',
    parentId: 'dept-pipeline',
    departmentId: 'dept-pipeline',
    projectId: 'proj-demo',
    departmentPriority: 1,
    taskIds: ['task-demo-1', 'task-demo-2', 'task-demo-3', 'task-demo-4'],
    milestoneIds: ['ms-demo'],
    dependsOnGoalIds: [],
    unlocksGoalIds: [],
  },
];

// === Tasks ===
// task-1 (done) → task-2 (in progress) → task-3 (locked, blocked by task-2)
// task-4 is independent (available) and unlocks the milestone
export const tasks: Task[] = [
  {
    id: 'task-demo-1',
    goalId: 'goal-demo',
    name: 'Demo Task 1',
    description: 'First demo task — kickoff',
    status: 'completed',
    ticketId: 'DEMO-1',
    contributingDepartmentId: 'dept-pipeline',
    baseDurationDays: 3,
    dependsOnTaskIds: [],
    dependsOnMilestoneIds: [],
    unlocksTaskIds: ['task-demo-2'],
    unlocksMilestoneIds: [],
    assignedWorkerIds: ['w-demo-1'],
    parallelizationFactor: 0.7,
    createdBy: 'w-demo-1',
    startedAt: '2026-01-05',
    completedAt: '2026-01-08',
  },
  {
    id: 'task-demo-2',
    goalId: 'goal-demo',
    name: 'Demo Task 2',
    description: 'Second demo task — depends on task 1',
    status: 'in_progress',
    ticketId: 'DEMO-2',
    contributingDepartmentId: 'dept-pipeline',
    baseDurationDays: 5,
    dependsOnTaskIds: ['task-demo-1'],
    dependsOnMilestoneIds: [],
    unlocksTaskIds: ['task-demo-3'],
    unlocksMilestoneIds: [],
    assignedWorkerIds: ['w-demo-1', 'w-demo-2'],
    parallelizationFactor: 0.7,
    createdBy: 'w-demo-1',
    startedAt: '2026-01-10',
  },
  {
    id: 'task-demo-3',
    goalId: 'goal-demo',
    name: 'Demo Task 3',
    description: 'Third demo task — locked until task 2 completes',
    status: 'locked',
    ticketId: 'DEMO-3',
    contributingDepartmentId: 'dept-pipeline',
    baseDurationDays: 4,
    dependsOnTaskIds: ['task-demo-2'],
    dependsOnMilestoneIds: [],
    unlocksTaskIds: [],
    unlocksMilestoneIds: ['ms-demo'],
    assignedWorkerIds: ['w-demo-2'],
    parallelizationFactor: 0.7,
    createdBy: 'w-demo-2',
  },
  {
    id: 'task-demo-4',
    goalId: 'goal-demo',
    name: 'Demo Task 4',
    description: 'Independent task — available immediately',
    status: 'available',
    ticketId: 'DEMO-4',
    contributingDepartmentId: 'dept-pipeline',
    baseDurationDays: 2,
    dependsOnTaskIds: [],
    dependsOnMilestoneIds: [],
    unlocksTaskIds: [],
    unlocksMilestoneIds: [],
    assignedWorkerIds: [],
    parallelizationFactor: 0.5,
    createdBy: 'w-demo-1',
  },
];

// === Milestones ===
export const milestones: Milestone[] = [
  {
    id: 'ms-demo',
    name: 'Demo Milestone',
    description: 'Reached when task 3 completes',
    type: 'capability',
    parentType: 'goal',
    parentId: 'goal-demo',
    requiredTaskIds: ['task-demo-3'],
    requiredMilestoneIds: [],
    unlocksTaskIds: [],
    unlocksMilestoneIds: [],
    unlocked: false,
    dueDate: '2026-06-30',
  },
];

// === Workers ===
export const workers: Worker[] = [
  {
    id: 'w-demo-1',
    name: 'Demo User One',
    departmentId: 'dept-pipeline',
    activeTaskIds: ['task-demo-2'],
    assignedTaskIds: ['task-demo-2'],
    availability: 'full',
    isLead: true,
  },
  {
    id: 'w-demo-2',
    name: 'Demo User Two',
    departmentId: 'dept-pipeline',
    activeTaskIds: ['task-demo-2'],
    assignedTaskIds: ['task-demo-2', 'task-demo-3'],
    availability: 'full',
    isLead: false,
  },
];
