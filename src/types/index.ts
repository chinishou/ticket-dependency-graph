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

export type GoalStatus = 'completed' | 'in_progress' | 'blocked' | 'available' | 'empty';

export function computeGoalStatus(
  goal: { taskIds: string[] },
  tasksMap: Map<string, { status: string; archived?: boolean }>,
): GoalStatus {
  const tasks = goal.taskIds
    .map((id) => tasksMap.get(id))
    .filter((t): t is { status: string; archived?: boolean } => !!t && !t.archived);
  if (tasks.length === 0) return 'empty';
  if (tasks.every((t) => t.status === 'completed')) return 'completed';
  if (tasks.some((t) => t.status === 'in_progress')) return 'in_progress';
  if (tasks.some((t) => t.status === 'blocked')) return 'blocked';
  return 'available';
}

export function getGoalStatusColor(status: GoalStatus): string {
  switch (status) {
    case 'completed':   return 'var(--color-done)';
    case 'in_progress': return 'var(--color-in-progress)';
    case 'blocked':     return 'var(--color-blocked)';
    case 'available':   return 'var(--color-available)';
    case 'empty':       return 'var(--color-border)';
  }
}

export function getGoalStatusGlow(status: GoalStatus): string {
  switch (status) {
    case 'completed':   return 'var(--color-done-glow)';
    case 'in_progress': return 'var(--color-in-progress-glow)';
    case 'blocked':     return 'var(--color-locked-glow)';
    case 'available':   return 'var(--color-available-glow)';
    case 'empty':       return 'transparent';
  }
}

export type MilestoneType = 'capability' | 'efficiency' | 'quality' | 'cost_reduction';

export type ProjectStatus = 'active' | 'completed' | 'on_hold' | 'cancelled';

export type WorkerAvailability = 'full' | 'partial' | 'unavailable';

export type NotificationType =
  | 'task_assigned'
  | 'task_status_changed'
  | 'task_completed'
  | 'dependency_completed'
  | 'milestone_unlocked'
  | 'lock_acquired'
  | 'lock_released'
  | 'priority_overridden'
  | 'priority_override_lifted'
  | 'calibration_changed';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  timestamp: string;
  read: boolean;
  entityId?: string;
  entityType?: 'task' | 'milestone' | 'goal' | 'lock';
  userName?: string;
  targetUserIds?: string[];
}

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
  deadline: string;
  strategicPriority: StrategicPriority;
  status: ProjectStatus;
  contributingDepartmentIds: string[];
  goalIds: string[];
  milestoneIds: string[];
  sgProjectId?: number;
  startDate?: string;
  endDate?: string;
  durationDays?: number;
  syncSource?: 'sg';
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
  departmentId?: string;
  projectId?: string;
}

export interface SgAssignee {
  id: number;
  name: string;
  type: string;
}

export interface SgProject {
  id: number;
  name: string;
  type: string;
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
  sgTicketId?: number;
  sgProjectId?: number;
  sgProjectName?: string;
  sgStatus?: string;
  sgEstimate?: number;
  sgTimeLogged?: number;
  sgAssignedTo?: SgAssignee[];
  archived?: boolean;
  archivedAt?: string;
  syncSource?: 'sg';
  unplaced?: boolean;
  relatedProjectIds?: string[];
  relatedDepartmentIds?: string[];
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
  sgUserId?: number;
  permissionGroup?: string;
  syncSource?: 'sg';
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
