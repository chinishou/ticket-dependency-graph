// === Enums ===

export type UserRole = 'admin' | 'coordinator' | 'worker';

export type StrategicPriority = 'P1' | 'P2' | 'P3';

export interface CalibrationWeights {
  project: number;   // default 0.25
  dept: number;      // default 0.20
  goal: number;      // default 0.15
  creator: number;   // default 0.10
  graph: number;     // default 0.30
}

export interface PriorityOverride {
  score: number;                // frozen display score (0-100)
  setBy: string;                // worker ID
  setAt: string;                // ISO timestamp
  reason: string;               // required justification
  previousComputedScore: number; // snapshot at override time
}

export type TaskStatus =
  | 'locked'
  | 'available'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'blocked';

export type MilestoneType = 'capability' | 'efficiency' | 'quality' | 'cost_reduction';

export type ProjectStatus = 'active' | 'completed' | 'on_hold' | 'cancelled';

export type WorkerAvailability = 'full' | 'partial' | 'unavailable';

// === Entities ===

export interface Company {
  id: string;
  name: string;
}

export interface Department {
  id: string;
  name: string;
  description: string;
  headName: string;
  priority: StrategicPriority;
  workerIds: string[];
  goalIds: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  deadline: string; // ISO date
  strategicPriority: StrategicPriority;
  status: ProjectStatus;
  contributingDepartmentIds: string[];
  goalIds: string[];
  milestoneIds: string[];
}

export interface Goal {
  id: string;
  name: string;
  description: string;
  owner: string;
  parentType: 'department' | 'project';
  parentId: string;
  departmentPriority: number;
  taskIds: string[];
  milestoneIds: string[];
  dependsOnGoalIds: string[];
  unlocksGoalIds: string[];
}

export interface Task {
  id: string;
  goalId: string;
  name: string;
  description: string;
  status: TaskStatus;
  ticketId?: string;
  ticketUrl?: string;
  contributingDepartmentId: string;
  baseDurationDays: number;
  dependsOnTaskIds: string[];
  dependsOnMilestoneIds: string[];
  unlocksTaskIds: string[];
  unlocksMilestoneIds: string[];
  assignedWorkerIds: string[];
  parallelizationFactor: number;
  createdBy?: string;
  priorityOverride?: PriorityOverride;
  startedAt?: string;
  completedAt?: string;
  dueDate?: string;
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  type: MilestoneType;
  parentType: 'goal' | 'project';
  parentId: string;
  requiredTaskIds: string[];
  requiredMilestoneIds: string[];
  unlocksTaskIds: string[];
  unlocksMilestoneIds: string[];
  unlocked: boolean;
  unlockedAt?: string;
  dueDate?: string;
}

export interface Worker {
  id: string;
  name: string;
  departmentId: string;
  activeTaskIds: string[];
  assignedTaskIds: string[];
  availability: WorkerAvailability;
  isLead?: boolean;
}

// === Computed helpers ===

export function getEtaDays(task: Task, workerCount: number): number {
  if (workerCount === 0) return task.baseDurationDays;
  const eta = task.baseDurationDays / Math.pow(workerCount, task.parallelizationFactor);
  return Math.max(0.5, Math.round(eta * 10) / 10);
}

export function getStatusColor(status: TaskStatus): string {
  switch (status) {
    case 'completed': return 'var(--color-done)';
    case 'in_progress': return 'var(--color-in-progress)';
    case 'available': return 'var(--color-available)';
    case 'locked': return 'var(--color-locked)';
    case 'blocked': return 'var(--color-blocked)';
    case 'paused': return 'var(--color-locked)';
  }
}

export function getStatusGlow(status: TaskStatus): string {
  switch (status) {
    case 'completed': return 'var(--color-done-glow)';
    case 'in_progress': return 'var(--color-in-progress-glow)';
    case 'available': return 'var(--color-available-glow)';
    case 'locked': return 'var(--color-locked-glow)';
    case 'blocked': return 'var(--color-blocked-glow)';
    case 'paused': return 'var(--color-locked-glow)';
  }
}

export function getPriorityColor(priority: StrategicPriority): string {
  switch (priority) {
    case 'P1': return 'var(--color-p1)';
    case 'P2': return 'var(--color-p2)';
    case 'P3': return 'var(--color-p3)';
  }
}

export function getStatusLabel(status: TaskStatus): string {
  switch (status) {
    case 'completed': return 'Done';
    case 'in_progress': return 'In Progress';
    case 'available': return 'Available';
    case 'locked': return 'Locked';
    case 'blocked': return 'Blocked';
    case 'paused': return 'Paused';
  }
}
