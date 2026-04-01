import { create } from 'zustand';
import type { Company, Department, Project, Goal, Task, Milestone, Worker, CalibrationWeights, UserRole } from '../types';
import {
  company as mockCompany, departments as mockDepartments, projects as mockProjects,
  goals as mockGoals, tasks as mockTasks, milestones as mockMilestones, workers as mockWorkers,
} from '../data/mockData';

interface LockInfo {
  scope: string;
  lockedBy: string;
  lockedAt: string;
  expiresAt: string;
}

interface PresenceInfo {
  scope: string;
  userName: string;
  lastSeen: string;
}

interface AppState {
  // Data
  company: Company;
  departments: Map<string, Department>;
  projects: Map<string, Project>;
  goals: Map<string, Goal>;
  tasks: Map<string, Task>;
  milestones: Map<string, Milestone>;
  workers: Map<string, Worker>;

  // Connection state
  isLoading: boolean;
  isConnected: boolean;
  lastModified: string | null;

  // User tag & role
  userName: string | null;
  setUserName: (name: string | null) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  userWorkerId: string | null;
  setUserWorkerId: (id: string | null) => void;
  adminPassword: string | null;
  upgradeToAdmin: (password: string) => Promise<boolean>;

  // Locks
  locks: Map<string, LockInfo>;
  acquireLock: (scope: string) => Promise<{ success: boolean; lockedBy?: string }>;
  releaseLock: (scope: string) => Promise<void>;

  // Presence
  presence: PresenceInfo[];
  heartbeatPresence: (scope: string) => Promise<void>;
  leavePresence: (scope: string) => Promise<void>;
  getOtherViewers: (scope: string) => string[];

  // UI state
  selectedTaskId: string | null;
  selectedMilestoneId: string | null;
  focusedNodeId: string | null;
  setSelectedTask: (id: string | null) => void;
  setSelectedMilestone: (id: string | null) => void;
  setFocusedNode: (id: string | null) => void;

  // Priority calibration
  calibrationWeights?: CalibrationWeights;
  setCalibrationWeights: (weights: CalibrationWeights) => void;
  overridePriority: (taskId: string, score: number, reason: string) => void;
  liftPriorityOverride: (taskId: string) => void;

  // Mutations (still sync for local state, fire API in background)
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  updateMilestone: (milestoneId: string, updates: Partial<Milestone>) => void;
  updateGoal: (goalId: string, updates: Partial<Goal>) => void;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  updateDepartment: (deptId: string, updates: Partial<Department>) => void;
  updateWorker: (workerId: string, updates: Partial<Worker>) => void;
  addGoal: (goal: Goal) => void;
  addMilestone: (milestone: Milestone) => void;
  addTaskToGoal: (goalId: string, task: Task) => void;
  removeTaskFromGoal: (goalId: string, taskId: string) => void;

  // Data loading
  fetchState: () => Promise<void>;
  pollForUpdates: () => Promise<void>;

  // Lookups
  getTasksForGoal: (goalId: string) => Task[];
  getMilestonesForGoal: (goalId: string) => Milestone[];
  getWorkersForTask: (taskId: string) => Worker[];
  getGoalsForDepartment: (deptId: string) => Goal[];
  getGoalsForProject: (projectId: string) => Goal[];
  getAllTasks: () => Task[];
  getUnplacedTasks: (goalId: string) => Task[];
  getRelatedNodeIds: (nodeId: string) => Set<string>;
}

function toMap<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function objectToMap<T extends { id: string }>(obj: Record<string, T>): Map<string, T> {
  return new Map(Object.entries(obj));
}

// Apply server response entities to local state
function applyEntities(entities: Record<string, Record<string, unknown>>) {
  const state: Partial<AppState> = {};
  if (entities.companies) {
    const vals = Object.values(entities.companies) as Company[];
    if (vals.length > 0) state.company = vals[0];
  }
  if (entities.departments) state.departments = objectToMap(entities.departments as unknown as Record<string, Department>);
  if (entities.projects) state.projects = objectToMap(entities.projects as unknown as Record<string, Project>);
  if (entities.goals) state.goals = objectToMap(entities.goals as unknown as Record<string, Goal>);
  if (entities.tasks) state.tasks = objectToMap(entities.tasks as unknown as Record<string, Task>);
  if (entities.milestones) state.milestones = objectToMap(entities.milestones as unknown as Record<string, Milestone>);
  if (entities.workers) state.workers = objectToMap(entities.workers as unknown as Record<string, Worker>);
  return state;
}

function applyLocks(locks: { scope: string; locked_by: string; locked_at: string; expires_at: string }[]): Map<string, LockInfo> {
  const map = new Map<string, LockInfo>();
  for (const l of locks) {
    map.set(l.scope, { scope: l.scope, lockedBy: l.locked_by, lockedAt: l.locked_at, expiresAt: l.expires_at });
  }
  return map;
}

// Fire mutation to server, reconcile state from response
async function serverMutation(type: string, body: Record<string, unknown>, set: (s: Partial<AppState>) => void, getState?: () => AppState) {
  const enriched = getState
    ? { ...body, userName: getState().userName, role: getState().userRole, userWorkerId: getState().userWorkerId }
    : body;
  try {
    const res = await fetch(`/api/mutations/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enriched),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.entities) {
        set({ ...applyEntities(data.entities), lastModified: data.lastModified });
      }
    }
  } catch {
    // Server unavailable — local state is still valid from optimistic update
  }
}

export const useStore = create<AppState>((set, get) => ({
  // Initialize with mock data as fallback (overwritten by fetchState)
  company: mockCompany,
  departments: toMap(mockDepartments),
  projects: toMap(mockProjects),
  goals: toMap(mockGoals),
  tasks: toMap(mockTasks),
  milestones: toMap(mockMilestones),
  workers: toMap(mockWorkers),

  isLoading: false,
  isConnected: false,
  lastModified: null,

  calibrationWeights: undefined,

  userName: typeof window !== 'undefined' ? localStorage.getItem('tech-tree-user') : null,
  setUserName: (name) => {
    if (name) {
      localStorage.setItem('tech-tree-user', name);
      // Create user tag on server
      fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          // Only accept worker/coordinator from DB — admin is session-only via password upgrade
          if (data.role && data.role !== 'admin') {
            localStorage.setItem('tech-tree-role', data.role);
            set({ userRole: data.role });
          }
        }
      }).catch(() => {});
    } else {
      localStorage.removeItem('tech-tree-user');
      localStorage.removeItem('tech-tree-role');
      localStorage.removeItem('tech-tree-worker-id');
    }
    set({ userName: name, adminPassword: name ? get().adminPassword : null });
  },

  userRole: (() => {
    if (typeof window === 'undefined') return 'worker';
    const stored = localStorage.getItem('tech-tree-role') as UserRole | null;
    // Admin is session-only — never restore from localStorage
    if (stored === 'admin') {
      localStorage.removeItem('tech-tree-role');
      return 'worker';
    }
    return stored ?? 'worker';
  })(),
  setUserRole: (role) => {
    // Only persist worker/coordinator — admin is session-only
    if (role !== 'admin') {
      localStorage.setItem('tech-tree-role', role);
    }
    set({ userRole: role });
  },

  userWorkerId: typeof window !== 'undefined' ? localStorage.getItem('tech-tree-worker-id') : null,
  setUserWorkerId: (id) => {
    if (id) {
      localStorage.setItem('tech-tree-worker-id', id);
    } else {
      localStorage.removeItem('tech-tree-worker-id');
    }
    set({ userWorkerId: id });
  },

  adminPassword: null,

  upgradeToAdmin: async (password) => {
    const userName = get().userName;
    if (!userName) return false;
    try {
      const res = await fetch('/api/auth/upgrade-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName, password }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // Admin is session-only — don't persist to localStorage
          set({ userRole: 'admin', adminPassword: password });
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  },

  locks: new Map(),

  acquireLock: async (scope) => {
    const userName = get().userName;
    if (!userName) return { success: false, lockedBy: 'unknown' };
    try {
      const res = await fetch('/api/locks/acquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, userName }),
      });
      const data = await res.json();
      if (data.success) {
        const locks = new Map(get().locks);
        locks.set(scope, { scope, lockedBy: userName, lockedAt: new Date().toISOString(), expiresAt: '' });
        set({ locks });
        return { success: true };
      }
      return { success: false, lockedBy: data.lockedBy };
    } catch {
      return { success: false, lockedBy: 'server unavailable' };
    }
  },

  releaseLock: async (scope) => {
    const userName = get().userName;
    if (!userName) return;
    try {
      await fetch('/api/locks/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, userName }),
      });
    } catch {}
    const locks = new Map(get().locks);
    locks.delete(scope);
    set({ locks });
  },

  presence: [],

  heartbeatPresence: async (scope) => {
    const userName = get().userName;
    if (!userName) return;
    try {
      await fetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, userName }),
      });
    } catch {}
  },

  leavePresence: async (scope) => {
    const userName = get().userName;
    if (!userName) return;
    try {
      await fetch('/api/presence/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, userName }),
      });
    } catch {}
  },

  getOtherViewers: (scope) => {
    const userName = get().userName;
    return get().presence
      .filter((p) => p.scope === scope && p.userName !== userName)
      .map((p) => p.userName);
  },

  selectedTaskId: null,
  selectedMilestoneId: null,
  focusedNodeId: null,
  setSelectedTask: (id) => set({ selectedTaskId: id, selectedMilestoneId: null }),
  setSelectedMilestone: (id) => set({ selectedMilestoneId: id, selectedTaskId: null }),
  setFocusedNode: (id) => set({ focusedNodeId: id }),

  fetchState: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = await res.json();
        set({
          ...applyEntities(data.entities),
          locks: applyLocks(data.locks),
          presence: data.presence || [],
          lastModified: data.lastModified,
          isConnected: true,
          isLoading: false,
        });
      } else {
        set({ isConnected: false, isLoading: false });
      }
    } catch {
      // Server not available — keep mock data
      set({ isConnected: false, isLoading: false });
    }
  },

  pollForUpdates: async () => {
    const lastModified = get().lastModified;
    try {
      const url = lastModified ? `/api/poll?since=${encodeURIComponent(lastModified)}` : '/api/poll';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const newState: Partial<AppState> = {
          locks: applyLocks(data.locks),
          presence: data.presence || [],
          lastModified: data.lastModified,
          isConnected: true,
        };
        if (data.changed && data.entities) {
          // Merge changed entities into existing state
          const existing = get();
          if (data.entities.tasks) {
            const merged = new Map(existing.tasks);
            for (const [id, val] of Object.entries(data.entities.tasks)) {
              merged.set(id, val as Task);
            }
            newState.tasks = merged;
          }
          if (data.entities.goals) {
            const merged = new Map(existing.goals);
            for (const [id, val] of Object.entries(data.entities.goals)) {
              merged.set(id, val as Goal);
            }
            newState.goals = merged;
          }
          if (data.entities.milestones) {
            const merged = new Map(existing.milestones);
            for (const [id, val] of Object.entries(data.entities.milestones)) {
              merged.set(id, val as Milestone);
            }
            newState.milestones = merged;
          }
          if (data.entities.departments) {
            const merged = new Map(existing.departments);
            for (const [id, val] of Object.entries(data.entities.departments)) {
              merged.set(id, val as Department);
            }
            newState.departments = merged;
          }
          if (data.entities.projects) {
            const merged = new Map(existing.projects);
            for (const [id, val] of Object.entries(data.entities.projects)) {
              merged.set(id, val as Project);
            }
            newState.projects = merged;
          }
          if (data.entities.workers) {
            const merged = new Map(existing.workers);
            for (const [id, val] of Object.entries(data.entities.workers)) {
              merged.set(id, val as Worker);
            }
            newState.workers = merged;
          }
        }
        set(newState);
      }
    } catch {
      set({ isConnected: false });
    }
  },

  // --- Mutations: optimistic local update + async server sync ---

  updateTask: (taskId, updates) => {
    const newTasks = new Map(get().tasks);
    const existing = newTasks.get(taskId);
    if (!existing) return;

    const updatedTask = { ...existing, ...updates };
    newTasks.set(taskId, updatedTask);

    if (updates.dependsOnTaskIds) {
      for (const oldDepId of existing.dependsOnTaskIds) {
        const parent = newTasks.get(oldDepId);
        if (parent) {
          newTasks.set(oldDepId, {
            ...parent,
            unlocksTaskIds: parent.unlocksTaskIds.filter((id) => id !== taskId),
          });
        }
      }
      for (const newDepId of updates.dependsOnTaskIds) {
        const parent = newTasks.get(newDepId);
        if (parent && !parent.unlocksTaskIds.includes(taskId)) {
          newTasks.set(newDepId, {
            ...parent,
            unlocksTaskIds: [...parent.unlocksTaskIds, taskId],
          });
        }
      }
    }

    if (updates.unlocksTaskIds) {
      for (const oldChildId of existing.unlocksTaskIds) {
        const child = newTasks.get(oldChildId);
        if (child) {
          newTasks.set(oldChildId, {
            ...child,
            dependsOnTaskIds: child.dependsOnTaskIds.filter((id) => id !== taskId),
          });
        }
      }
      for (const newChildId of updates.unlocksTaskIds) {
        const child = newTasks.get(newChildId);
        if (child && !child.dependsOnTaskIds.includes(taskId)) {
          newTasks.set(newChildId, {
            ...child,
            dependsOnTaskIds: [...child.dependsOnTaskIds, taskId],
          });
        }
      }
    }

    set({ tasks: newTasks });
    serverMutation('updateTask', { entityId: taskId, updates }, set, get);
  },

  updateMilestone: (milestoneId, updates) => {
    const newMilestones = new Map(get().milestones);
    const newTasks = new Map(get().tasks);
    const existing = newMilestones.get(milestoneId);
    if (!existing) return;

    const updated = { ...existing, ...updates };
    newMilestones.set(milestoneId, updated);

    if (updates.requiredTaskIds) {
      for (const oldTaskId of existing.requiredTaskIds) {
        const task = newTasks.get(oldTaskId);
        if (task) {
          newTasks.set(oldTaskId, {
            ...task,
            unlocksMilestoneIds: task.unlocksMilestoneIds.filter((id) => id !== milestoneId),
          });
        }
      }
      for (const newTaskId of updates.requiredTaskIds) {
        const task = newTasks.get(newTaskId);
        if (task && !task.unlocksMilestoneIds.includes(milestoneId)) {
          newTasks.set(newTaskId, {
            ...task,
            unlocksMilestoneIds: [...task.unlocksMilestoneIds, milestoneId],
          });
        }
      }
    }

    if (updates.requiredMilestoneIds) {
      for (const oldMsId of existing.requiredMilestoneIds) {
        const ms = newMilestones.get(oldMsId);
        if (ms) {
          newMilestones.set(oldMsId, {
            ...ms,
            unlocksMilestoneIds: ms.unlocksMilestoneIds.filter((id) => id !== milestoneId),
          });
        }
      }
      for (const newMsId of updates.requiredMilestoneIds) {
        const ms = newMilestones.get(newMsId);
        if (ms && !ms.unlocksMilestoneIds.includes(milestoneId)) {
          newMilestones.set(newMsId, {
            ...ms,
            unlocksMilestoneIds: [...ms.unlocksMilestoneIds, milestoneId],
          });
        }
      }
    }

    if (updates.unlocksTaskIds) {
      for (const oldTaskId of existing.unlocksTaskIds) {
        const task = newTasks.get(oldTaskId);
        if (task) {
          newTasks.set(oldTaskId, {
            ...task,
            dependsOnMilestoneIds: task.dependsOnMilestoneIds.filter((id) => id !== milestoneId),
          });
        }
      }
      for (const newTaskId of updates.unlocksTaskIds) {
        const task = newTasks.get(newTaskId);
        if (task && !task.dependsOnMilestoneIds.includes(milestoneId)) {
          newTasks.set(newTaskId, {
            ...task,
            dependsOnMilestoneIds: [...task.dependsOnMilestoneIds, milestoneId],
          });
        }
      }
    }

    set({ milestones: newMilestones, tasks: newTasks });
    serverMutation('updateMilestone', { entityId: milestoneId, updates }, set, get);
  },

  updateGoal: (goalId, updates) => {
    const newGoals = new Map(get().goals);
    const existing = newGoals.get(goalId);
    if (!existing) return;

    const updated = { ...existing, ...updates };
    newGoals.set(goalId, updated);

    if (updates.unlocksGoalIds) {
      for (const oldTargetId of existing.unlocksGoalIds) {
        const target = newGoals.get(oldTargetId);
        if (target) {
          newGoals.set(oldTargetId, {
            ...target,
            dependsOnGoalIds: target.dependsOnGoalIds.filter((id) => id !== goalId),
          });
        }
      }
      for (const newTargetId of updates.unlocksGoalIds) {
        const target = newGoals.get(newTargetId);
        if (target && !target.dependsOnGoalIds.includes(goalId)) {
          newGoals.set(newTargetId, {
            ...target,
            dependsOnGoalIds: [...target.dependsOnGoalIds, goalId],
          });
        }
      }
    }

    if (updates.dependsOnGoalIds) {
      for (const oldSourceId of existing.dependsOnGoalIds) {
        const source = newGoals.get(oldSourceId);
        if (source) {
          newGoals.set(oldSourceId, {
            ...source,
            unlocksGoalIds: source.unlocksGoalIds.filter((id) => id !== goalId),
          });
        }
      }
      for (const newSourceId of updates.dependsOnGoalIds) {
        const source = newGoals.get(newSourceId);
        if (source && !source.unlocksGoalIds.includes(goalId)) {
          newGoals.set(newSourceId, {
            ...source,
            unlocksGoalIds: [...source.unlocksGoalIds, goalId],
          });
        }
      }
    }

    set({ goals: newGoals });
    serverMutation('updateGoal', { entityId: goalId, updates }, set, get);
  },

  updateProject: (projectId, updates) => {
    const newProjects = new Map(get().projects);
    const existing = newProjects.get(projectId);
    if (!existing) return;
    newProjects.set(projectId, { ...existing, ...updates });
    set({ projects: newProjects });
    serverMutation('updateProject', { entityId: projectId, updates }, set, get);
  },

  updateDepartment: (deptId, updates) => {
    const newDepts = new Map(get().departments);
    const existing = newDepts.get(deptId);
    if (!existing) return;
    newDepts.set(deptId, { ...existing, ...updates });
    set({ departments: newDepts });
    serverMutation('updateDepartment', { entityId: deptId, updates }, set, get);
  },

  updateWorker: (workerId, updates) => {
    const newWorkers = new Map(get().workers);
    const existing = newWorkers.get(workerId);
    if (!existing) return;
    newWorkers.set(workerId, { ...existing, ...updates });
    set({ workers: newWorkers });
    serverMutation('updateWorker', { entityId: workerId, updates }, set, get);
  },

  addGoal: (goal) => {
    const newGoals = new Map(get().goals);
    newGoals.set(goal.id, goal);

    // Add to parent's goalIds
    if (goal.parentType === 'department') {
      const newDepts = new Map(get().departments);
      const dept = newDepts.get(goal.parentId);
      if (dept && !dept.goalIds.includes(goal.id)) {
        newDepts.set(goal.parentId, { ...dept, goalIds: [...dept.goalIds, goal.id] });
        set({ goals: newGoals, departments: newDepts });
        serverMutation('addGoal', { goal }, set, get);
        return;
      }
    } else if (goal.parentType === 'project') {
      const newProjects = new Map(get().projects);
      const proj = newProjects.get(goal.parentId);
      if (proj && !proj.goalIds.includes(goal.id)) {
        newProjects.set(goal.parentId, { ...proj, goalIds: [...proj.goalIds, goal.id] });
        set({ goals: newGoals, projects: newProjects });
        serverMutation('addGoal', { goal }, set, get);
        return;
      }
    }
    set({ goals: newGoals });
    serverMutation('addGoal', { goal }, set, get);
  },

  addMilestone: (milestone) => {
    const newMilestones = new Map(get().milestones);
    newMilestones.set(milestone.id, milestone);

    if (milestone.parentType === 'goal') {
      const newGoals = new Map(get().goals);
      const goal = newGoals.get(milestone.parentId);
      if (goal && !goal.milestoneIds.includes(milestone.id)) {
        newGoals.set(milestone.parentId, { ...goal, milestoneIds: [...goal.milestoneIds, milestone.id] });
        set({ milestones: newMilestones, goals: newGoals });
        serverMutation('addMilestone', { milestone }, set, get);
        return;
      }
    }
    set({ milestones: newMilestones });
    serverMutation('addMilestone', { milestone }, set, get);
  },

  addTaskToGoal: (goalId, task) => {
    const newTasks = new Map(get().tasks);
    newTasks.set(task.id, task);

    const newGoals = new Map(get().goals);
    const goal = newGoals.get(goalId);
    if (goal && !goal.taskIds.includes(task.id)) {
      newGoals.set(goalId, { ...goal, taskIds: [...goal.taskIds, task.id] });
    }

    set({ tasks: newTasks, goals: newGoals });
    serverMutation('addTaskToGoal', { goalId, task }, set, get);
  },

  removeTaskFromGoal: (goalId, taskId) => {
    const newTasks = new Map(get().tasks);
    const newGoals = new Map(get().goals);

    const goal = newGoals.get(goalId);
    if (goal) {
      newGoals.set(goalId, { ...goal, taskIds: goal.taskIds.filter((id) => id !== taskId) });
    }

    const task = newTasks.get(taskId);
    if (task) {
      for (const depId of task.dependsOnTaskIds) {
        const parent = newTasks.get(depId);
        if (parent) {
          newTasks.set(depId, {
            ...parent,
            unlocksTaskIds: parent.unlocksTaskIds.filter((id) => id !== taskId),
          });
        }
      }
      for (const childId of task.unlocksTaskIds) {
        const child = newTasks.get(childId);
        if (child) {
          newTasks.set(childId, {
            ...child,
            dependsOnTaskIds: child.dependsOnTaskIds.filter((id) => id !== taskId),
          });
        }
      }
      newTasks.set(taskId, {
        ...task,
        goalId: '',
        dependsOnTaskIds: [],
        unlocksTaskIds: [],
        unlocksMilestoneIds: [],
        dependsOnMilestoneIds: [],
      });
    }

    set({ tasks: newTasks, goals: newGoals, selectedTaskId: null });
    serverMutation('removeTaskFromGoal', { goalId, taskId }, set, get);
  },

  setCalibrationWeights: (weights) => {
    set({ calibrationWeights: weights });
  },

  overridePriority: (taskId, score, reason) => {
    const newTasks = new Map(get().tasks);
    const task = newTasks.get(taskId);
    if (!task) return;

    // We don't know the computed score here — caller should pass it via the score param
    newTasks.set(taskId, {
      ...task,
      priorityOverride: {
        score,
        setBy: get().userName ?? 'unknown',
        setAt: new Date().toISOString(),
        reason,
        previousComputedScore: 0, // caller should provide real value
      },
    });
    set({ tasks: newTasks });
    serverMutation('updateTask', { entityId: taskId, updates: { priorityOverride: newTasks.get(taskId)!.priorityOverride } }, set);
  },

  liftPriorityOverride: (taskId) => {
    const newTasks = new Map(get().tasks);
    const task = newTasks.get(taskId);
    if (!task || !task.priorityOverride) return;

    newTasks.set(taskId, {
      ...task,
      priorityOverride: undefined,
    });
    set({ tasks: newTasks });
    serverMutation('updateTask', { entityId: taskId, updates: { priorityOverride: null } }, set);
  },

  getTasksForGoal: (goalId) => {
    const goal = get().goals.get(goalId);
    if (!goal) return [];
    return goal.taskIds.map((id) => get().tasks.get(id)).filter(Boolean) as Task[];
  },

  getMilestonesForGoal: (goalId) => {
    const goal = get().goals.get(goalId);
    if (!goal) return [];
    return goal.milestoneIds.map((id) => get().milestones.get(id)).filter(Boolean) as Milestone[];
  },

  getWorkersForTask: (taskId) => {
    const task = get().tasks.get(taskId);
    if (!task) return [];
    return task.assignedWorkerIds.map((id) => get().workers.get(id)).filter(Boolean) as Worker[];
  },

  getGoalsForDepartment: (deptId) => {
    const dept = get().departments.get(deptId);
    if (!dept) return [];
    return dept.goalIds.map((id) => get().goals.get(id)).filter(Boolean) as Goal[];
  },

  getGoalsForProject: (projectId) => {
    const project = get().projects.get(projectId);
    if (!project) return [];
    return project.goalIds.map((id) => get().goals.get(id)).filter(Boolean) as Goal[];
  },

  getAllTasks: () => {
    return Array.from(get().tasks.values());
  },

  getUnplacedTasks: (goalId: string) => {
    const goal = get().goals.get(goalId);
    const placedIds = new Set(goal?.taskIds ?? []);
    return Array.from(get().tasks.values()).filter(
      (t) => !placedIds.has(t.id) && (!t.goalId || t.goalId === '' || t.goalId === goalId),
    );
  },

  getRelatedNodeIds: (nodeId: string) => {
    const related = new Set<string>();
    related.add(nodeId);

    const tasksMap = get().tasks;
    const milestonesMap = get().milestones;

    const traverse = (id: string, direction: 'up' | 'down') => {
      const task = tasksMap.get(id);
      const milestone = milestonesMap.get(id);

      if (task) {
        if (direction === 'up') {
          for (const depId of task.dependsOnTaskIds) {
            if (!related.has(depId)) { related.add(depId); traverse(depId, 'up'); }
          }
          for (const msId of task.dependsOnMilestoneIds) {
            if (!related.has(msId)) { related.add(msId); traverse(msId, 'up'); }
          }
        }
        if (direction === 'down') {
          for (const childId of task.unlocksTaskIds) {
            if (!related.has(childId)) { related.add(childId); traverse(childId, 'down'); }
          }
          for (const msId of task.unlocksMilestoneIds) {
            if (!related.has(msId)) { related.add(msId); traverse(msId, 'down'); }
          }
        }
      }

      if (milestone) {
        if (direction === 'up') {
          for (const tId of milestone.requiredTaskIds) {
            if (!related.has(tId)) { related.add(tId); traverse(tId, 'up'); }
          }
          for (const msId of milestone.requiredMilestoneIds) {
            if (!related.has(msId)) { related.add(msId); traverse(msId, 'up'); }
          }
        }
        if (direction === 'down') {
          for (const tId of milestone.unlocksTaskIds) {
            if (!related.has(tId)) { related.add(tId); traverse(tId, 'down'); }
          }
          for (const msId of milestone.unlocksMilestoneIds) {
            if (!related.has(msId)) { related.add(msId); traverse(msId, 'down'); }
          }
        }
      }
    };

    traverse(nodeId, 'up');
    traverse(nodeId, 'down');
    return related;
  },
}));
