import { create } from 'zustand';
import type { Company, Department, Project, Goal, Task, Milestone, Worker, CalibrationWeights, UserRole, TaskStatus } from '../types';
import { computeTaskPriorities, DEFAULT_WEIGHTS } from '../utils/priorityCalc';
import {
  notifyTaskAssigned,
  notifyTaskStatusChanged,
  notifyTaskCompleted,
  notifyDependencyCompleted,
  notifyMilestoneUnlocked,
  notifyLockAcquired,
  notifyLockReleased,
  notifyPriorityOverridden,
  notifyPriorityOverrideLifted,
  notifyCalibrationChanged,
} from './useNotificationStore';

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

export interface DeleteResult {
  success: boolean;
  error?: string;
  blockers?: string[];
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
  sgBootstrap: () => Promise<boolean>;

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

  // SG Priority auto-sync: when enabled, calculated priority (0-100) maps to SG priority (5-1)
  sgPriorityAutoSync: boolean;
  setSgPriorityAutoSync: (enabled: boolean) => void;

  // SG Status Sync
  // Map from TaskStatus → SG sg_status_list short-code. Populated from the
  // server (which reads from the `meta` table) on init, so the codes always
  // match whatever the live SG site uses. Falls back to hardcoded defaults
  // until the first load completes.
  sgStatusMap: Record<TaskStatus, string>;
  loadSgStatusMap: () => Promise<void>;
  saveSgStatusMap: (map: Record<TaskStatus, string>) => Promise<boolean>;
  mapTaskStatusToSg: (status: TaskStatus) => string;
  syncTaskStatusToSg: (task: Task) => void;
  syncTaskPriorityToSg: (task: Task) => void;

  // Mutations (still sync for local state, fire API in background)
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  updateMilestone: (milestoneId: string, updates: Partial<Milestone>) => void;
  updateGoal: (goalId: string, updates: Partial<Goal>) => void;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  updateDepartment: (deptId: string, updates: Partial<Department>) => void;
  updateWorker: (workerId: string, updates: Partial<Worker>) => void;
  addGoal: (goal: Goal) => void;
  removeGoal: (goalId: string) => void;
  addMilestone: (milestone: Milestone) => void;
  addTaskToGoal: (goalId: string, task: Task) => void;
  removeTaskFromGoal: (goalId: string, taskId: string) => void;
  removeMilestoneFromGoal: (goalId: string, milestoneId: string) => void;
  // Per-entity deletes — return result so UI can show 409 blocker lists
  removeWorker: (workerId: string) => Promise<DeleteResult>;
  removeProject: (projectId: string) => Promise<DeleteResult>;
  removeDepartment: (deptId: string) => Promise<DeleteResult>;
  removeTask: (taskId: string) => Promise<DeleteResult>;
  removeMilestone: (milestoneId: string) => Promise<DeleteResult>;
  // Bulk clears (admin-only)
  bulkClearTickets: (scope?: 'all' | 'sg') => Promise<{ success: boolean; deleted?: number; error?: string }>;
  bulkClearWorkers: (scope?: 'all' | 'sg') => Promise<{ success: boolean; deleted?: number; error?: string }>;

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
  getAllUnplacedTasks: () => Task[];
  getProjectForGoal: (goalId: string) => Project | null;
  getRelatedNodeIds: (nodeId: string) => Set<string>;
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

// Server-first delete: don't mutate local state until we know the server accepted it.
// This is important because the server may refuse with a 409 blockers list, in which
// case any optimistic removal would have to be reverted.
async function serverDelete(type: string, body: Record<string, unknown>, set: (s: Partial<AppState>) => void, getState: () => AppState): Promise<DeleteResult> {
  const enriched = { ...body, userName: getState().userName, role: getState().userRole, userWorkerId: getState().userWorkerId };
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
      return { success: true };
    }
    const data = await res.json().catch(() => ({}));
    return {
      success: false,
      error: (data as { error?: string }).error || `HTTP ${res.status}`,
      blockers: (data as { blockers?: string[] }).blockers,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export const useStore = create<AppState>((set, get) => ({
  // Start empty — fetchState fills from server
  company: { id: '', name: '' },
  departments: new Map(),
  projects: new Map(),
  goals: new Map(),
  tasks: new Map(),
  milestones: new Map(),
  workers: new Map(),

  isLoading: false,
  isConnected: false,
  lastModified: null,

  calibrationWeights: undefined,
  sgPriorityAutoSync: false,

  // Hardcoded fallback — kept in sync with DEFAULT_SG_STATUS_MAP in server/routes.ts.
  // Replaced by the server-stored map after loadSgStatusMap() completes.
  sgStatusMap: {
    completed: 'res',
    in_progress: 'ip',
    available: 'opn',
    blocked: 'hold',
    paused: 'wtg',
    locked: 'opn',
  },

  userName: (() => {
    if (typeof window === 'undefined') return null;
    const v = localStorage.getItem('tech-tree-user');
    // Defensive: localStorage round-trips may have stringified `undefined`/`null`
    return v && v !== 'undefined' && v !== 'null' ? v : null;
  })(),
  setUserName: (name) => {
    if (name) {
      localStorage.setItem('tech-tree-user', name);
      const workers = get().workers;
      // Case-insensitive lookup since SG names may have inconsistent casing.
      const matchedWorker = Array.from(workers.values()).find(
        w => (w.name ?? '').toLowerCase() === name.toLowerCase(),
      );
      if (matchedWorker) {
        localStorage.setItem('tech-tree-worker-id', matchedWorker.id);
        set({ userName: name, userWorkerId: matchedWorker.id, adminPassword: get().adminPassword });
      } else {
        // Don't leave a stale worker id in localStorage when the new name doesn't
        // match — otherwise MyTasksView shows a worker picker on next reload.
        localStorage.removeItem('tech-tree-worker-id');
        set({ userName: name, userWorkerId: null, adminPassword: get().adminPassword });
      }
      fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then(async (res) => {
        if (res.ok) {
          const data = await res.json();
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
      set({ userName: name, userWorkerId: null, adminPassword: null });
    }
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

  userWorkerId: (() => {
    if (typeof window === 'undefined') return null;
    const v = localStorage.getItem('tech-tree-worker-id');
    // Defensive: an earlier bug persisted the literal string `"undefined"` here
    if (!v || v === 'undefined' || v === 'null') {
      localStorage.removeItem('tech-tree-worker-id');
      return null;
    }
    return v;
  })(),
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

  sgBootstrap: async () => {
    try {
      const res = await fetch('/api/sg/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: get().adminPassword }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.entities) {
          set({ ...applyEntities(data.entities), lastModified: data.lastModified });
        }
        return true;
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
        notifyLockAcquired(scope, userName);
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
    const existingLock = get().locks.get(scope);
    try {
      await fetch('/api/locks/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, userName }),
      });
    } catch { /* server unavailable */ }
    const locks = new Map(get().locks);
    locks.delete(scope);
    set({ locks });
    if (existingLock) {
      notifyLockReleased(scope, existingLock.lockedBy);
    }
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
    } catch { /* presence is non-critical */ }
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
    } catch { /* presence is non-critical */ }
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
        const updates: Partial<AppState> = {
          // Pre-reset all collection entities so a full state fetch
          // reflects the server truthfully (absent key = empty collection).
          departments: new Map(),
          projects: new Map(),
          goals: new Map(),
          tasks: new Map(),
          milestones: new Map(),
          workers: new Map(),
          ...applyEntities(data.entities),
          locks: applyLocks(data.locks),
          presence: data.presence || [],
          lastModified: data.lastModified,
          isConnected: true,
          isLoading: false,
        };
        const currentUserName = get().userName;
        if (currentUserName) {
          const workers = new Map(Object.entries(data.entities?.workers || {})) as Map<string, Worker>;
          // Case-insensitive — SG names may not exactly match how the user typed it
          const matchedWorker = Array.from(workers.values()).find(
            w => (w.name ?? '').toLowerCase() === currentUserName.toLowerCase(),
          );
          if (matchedWorker) {
            updates.userWorkerId = matchedWorker.id;
            localStorage.setItem('tech-tree-worker-id', matchedWorker.id);
          } else {
            // No match — clear any stale id so MyTasksView prompts the picker
            // instead of showing data for the wrong worker.
            updates.userWorkerId = null;
            localStorage.removeItem('tech-tree-worker-id');
          }
        }
        set(updates);
        // Refresh the SG status mapping each time we do a full state fetch.
        // Cheap (single small GET) and ensures outbound writes use codes
        // that match the configured SG site even after admin changes them.
        void get().loadSgStatusMap();
      } else {
        set({ isConnected: false, isLoading: false });
      }
    } catch {
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

  // --- SG Status Sync ---

  // Pull the TaskStatus → SG code mapping from /api/sg/status-map.
  // Called from fetchState() on app init so outbound SG writes use codes
  // that actually exist on the configured SG site.
  loadSgStatusMap: async () => {
    try {
      const res = await fetch('/api/sg/status-map');
      if (!res.ok) return;
      const data = await res.json() as { map?: Record<string, string> };
      if (data.map && typeof data.map === 'object') {
        set({ sgStatusMap: { ...get().sgStatusMap, ...data.map } as Record<TaskStatus, string> });
      }
    } catch {
      // Network error — keep hardcoded fallback already in state
    }
  },

  saveSgStatusMap: async (map: Record<TaskStatus, string>): Promise<boolean> => {
    const password = get().adminPassword;
    if (!password) return false;
    try {
      const res = await fetch('/api/sg/status-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: password, map }),
      });
      if (!res.ok) return false;
      const data = await res.json() as { map?: Record<string, string> };
      if (data.map) {
        set({ sgStatusMap: { ...get().sgStatusMap, ...data.map } as Record<TaskStatus, string> });
      }
      return true;
    } catch {
      return false;
    }
  },

  // Map tech-tree TaskStatus to SG sg_status_list value using the loaded map.
  // Falls back to a sensible default for any status not in the map.
  mapTaskStatusToSg: (status: TaskStatus): string => {
    const map = get().sgStatusMap;
    return map[status] || 'opn';
  },

  // Sync task status to SG if the task is SG-synced
  syncTaskStatusToSg: (task: Task) => {
    if ((task as { syncSource?: string }).syncSource !== 'sg' || !task.sgTicketId) return;
    const sgStatus = useStore.getState().mapTaskStatusToSg(task.status);
    // Use raw fetch to avoid going through serverMutation (which would create a loop)
    fetch('/api/sg/update-task-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sg-secret': import.meta.env.VITE_SG_INTERNAL_SECRET || 'sg-internal-dev-secret' },
      body: JSON.stringify({ sgTicketId: task.sgTicketId, status: sgStatus }),
    }).catch(() => {
      // Silently fail - SG sync is best-effort and will be corrected on next SG event
    });
  },

  // Sync computed priority to SG (score 0-100 → SG priority 1-5, inverse scale)
  syncTaskPriorityToSg: (task: Task) => {
    if ((task as { syncSource?: string }).syncSource !== 'sg' || !task.sgTicketId) return;
    const state = get();
    const weights = state.calibrationWeights && 'goal' in state.calibrationWeights
      ? state.calibrationWeights
      : DEFAULT_WEIGHTS;
    const priorities = computeTaskPriorities({
      tasks: state.tasks,
      milestones: state.milestones,
      goals: state.goals,
      departments: state.departments,
      projects: state.projects,
      weights,
    });
    const taskPriority = priorities.get(task.id);
    if (!taskPriority) return;
    // Map 0-100 score → SG priority 1-5 (inverse: higher score = lower number = higher SG priority)
    const sgPriority = Math.max(1, Math.min(5, 5 - Math.floor(taskPriority.score / 25)));
    fetch('/api/sg/update-task-priority', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sg-secret': import.meta.env.VITE_SG_INTERNAL_SECRET || 'sg-internal-dev-secret' },
      body: JSON.stringify({ sgTicketId: task.sgTicketId, priority: sgPriority }),
    }).catch(() => {
      // Silently fail - SG sync is best-effort
    });
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

    if (updates.status && updates.status !== existing.status && !existing.archived) {
      notifyTaskStatusChanged(existing.name, existing.status, updates.status, get().userName, existing.assignedWorkerIds);
      if (updates.status === 'completed') {
        notifyTaskCompleted(existing.name, get().userName, existing.assignedWorkerIds);
        for (const childId of existing.unlocksTaskIds) {
          const child = newTasks.get(childId);
          if (child && child.status === 'locked' && !child.archived) {
            notifyDependencyCompleted(existing.name, child.name, child.assignedWorkerIds);
          }
        }
      }
    }

    if (updates.assignedWorkerIds && updates.assignedWorkerIds !== existing.assignedWorkerIds) {
      const newWorkerIds = updates.assignedWorkerIds.filter(id => !existing.assignedWorkerIds.includes(id));
      if (newWorkerIds.length > 0) {
        const workerNames = newWorkerIds.map(id => get().workers.get(id)?.name ?? id);
        notifyTaskAssigned(existing.name, get().userName, workerNames, newWorkerIds);
      }
    }

    set({ tasks: newTasks });
    serverMutation('updateTask', { entityId: taskId, updates }, set, get);

    // Sync status to SG if this is an SG-synced task and status changed
    if (updates.status && updates.status !== existing.status) {
      const updatedTask = newTasks.get(taskId);
      if (updatedTask) {
        get().syncTaskStatusToSg(updatedTask);
        if (get().sgPriorityAutoSync) {
          get().syncTaskPriorityToSg(updatedTask);
        }
      }
    }
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

    if (updates.unlocked === true && existing.unlocked !== true) {
      const targetWorkerIds = existing.unlocksTaskIds.flatMap(taskId => newTasks.get(taskId)?.assignedWorkerIds ?? []);
      notifyMilestoneUnlocked(existing.name, get().userName ?? 'unknown', targetWorkerIds);
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

  removeGoal: (goalId) => {
    const newGoals = new Map(get().goals);
    const goal = newGoals.get(goalId);
    if (!goal) return;
    newGoals.delete(goalId);

    // Remove from parent's goalIds
    if (goal.parentType === 'department') {
      const newDepts = new Map(get().departments);
      const dept = newDepts.get(goal.parentId);
      if (dept) newDepts.set(goal.parentId, { ...dept, goalIds: dept.goalIds.filter((id) => id !== goalId) });
      set({ goals: newGoals, departments: newDepts });
    } else if (goal.parentType === 'project') {
      const newProjects = new Map(get().projects);
      const proj = newProjects.get(goal.parentId);
      if (proj) newProjects.set(goal.parentId, { ...proj, goalIds: proj.goalIds.filter((id) => id !== goalId) });
      set({ goals: newGoals, projects: newProjects });
    } else {
      set({ goals: newGoals });
    }

    serverMutation('removeGoal', { goalId }, set, get);
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

  removeMilestoneFromGoal: (goalId, milestoneId) => {
    const newMilestones = new Map(get().milestones);
    const newGoals = new Map(get().goals);
    const newTasks = new Map(get().tasks);

    const goal = newGoals.get(goalId);
    if (goal) {
      newGoals.set(goalId, { ...goal, milestoneIds: goal.milestoneIds.filter((id) => id !== milestoneId) });
    }

    const ms = newMilestones.get(milestoneId);
    if (ms) {
      // Unlink tasks that unlock this milestone
      for (const taskId of ms.requiredTaskIds) {
        const task = newTasks.get(taskId);
        if (task) {
          newTasks.set(taskId, {
            ...task,
            unlocksMilestoneIds: task.unlocksMilestoneIds.filter((id) => id !== milestoneId),
          });
        }
      }
      newMilestones.set(milestoneId, {
        ...ms,
        parentId: '',
        requiredTaskIds: [],
        requiredMilestoneIds: [],
      });
    }

    set({ milestones: newMilestones, goals: newGoals, tasks: newTasks, selectedMilestoneId: null });
    serverMutation('removeMilestoneFromGoal', { goalId, milestoneId }, set, get);
  },

  removeWorker: (workerId) => serverDelete('removeWorker', { entityId: workerId }, set, get),
  removeProject: (projectId) => serverDelete('removeProject', { entityId: projectId }, set, get),
  removeDepartment: (deptId) => serverDelete('removeDepartment', { entityId: deptId }, set, get),
  removeTask: (taskId) => serverDelete('removeTask', { entityId: taskId }, set, get),
  removeMilestone: (milestoneId) => serverDelete('removeMilestone', { entityId: milestoneId }, set, get),

  bulkClearTickets: async (scope = 'all') => {
    const pwd = get().adminPassword;
    if (!pwd) return { success: false, error: 'Admin password required' };
    try {
      const res = await fetch('/api/sg/clear-all-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: pwd, scope }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || `HTTP ${res.status}` };
      if (data.entities) {
        set({ ...applyEntities(data.entities), lastModified: data.lastModified });
      }
      return { success: true, deleted: data.deleted };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },

  bulkClearWorkers: async (scope = 'all') => {
    const pwd = get().adminPassword;
    if (!pwd) return { success: false, error: 'Admin password required' };
    try {
      const res = await fetch('/api/sg/clear-all-workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: pwd, scope }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || `HTTP ${res.status}` };
      if (data.entities) {
        set({ ...applyEntities(data.entities), lastModified: data.lastModified });
      }
      return { success: true, deleted: data.deleted };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },

  setCalibrationWeights: (weights) => {
    notifyCalibrationChanged(get().userName ?? 'unknown');
    set({ calibrationWeights: weights });
  },

  setSgPriorityAutoSync: (enabled) => {
    set({ sgPriorityAutoSync: enabled });
  },

  overridePriority: (taskId, score, reason) => {
    const newTasks = new Map(get().tasks);
    const task = newTasks.get(taskId);
    if (!task) return;

    // Clamp score to 0-100 range
    const clampedScore = Math.max(0, Math.min(100, score));

    notifyPriorityOverridden(task.name, get().userName ?? 'unknown', reason, task.assignedWorkerIds);

    newTasks.set(taskId, {
      ...task,
      priorityOverride: {
        score: clampedScore,
        setBy: get().userName ?? 'unknown',
        setAt: new Date().toISOString(),
        reason,
        previousComputedScore: 0,
      },
    });
    set({ tasks: newTasks });
    serverMutation('updateTask', { entityId: taskId, updates: { priorityOverride: newTasks.get(taskId)!.priorityOverride } }, set);
  },

  liftPriorityOverride: (taskId) => {
    const newTasks = new Map(get().tasks);
    const task = newTasks.get(taskId);
    if (!task || !task.priorityOverride) return;

    notifyPriorityOverrideLifted(task.name, get().userName ?? 'unknown', task.assignedWorkerIds);

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
    return goal.taskIds.map((id) => get().tasks.get(id)).filter((t): t is Task => !!t);
    // Note: archived tasks are intentionally kept here so the tech tree can render them (muted)
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
    const fromParent = new Set(dept.goalIds);
    const result: Goal[] = [];
    for (const goal of get().goals.values()) {
      if (fromParent.has(goal.id) || goal.departmentId === deptId) {
        result.push(goal);
      }
    }
    return result;
  },

  getGoalsForProject: (projectId) => {
    const project = get().projects.get(projectId);
    if (!project) return [];
    const fromParent = new Set(project.goalIds);
    const result: Goal[] = [];
    for (const goal of get().goals.values()) {
      if (fromParent.has(goal.id) || goal.projectId === projectId) {
        result.push(goal);
      }
    }
    return result;
  },

  getAllTasks: () => {
    return Array.from(get().tasks.values());
  },

  getUnplacedTasks: (goalId: string) => {
    const goal = get().goals.get(goalId);
    const placedIds = new Set(goal?.taskIds ?? []);
    return Array.from(get().tasks.values()).filter(
      (t) => !t.archived && !placedIds.has(t.id) && (!t.goalId || t.goalId === '' || t.goalId === goalId),
    );
  },

  getAllUnplacedTasks: () => {
    return Array.from(get().tasks.values()).filter(
      (t) => !t.archived && (!t.goalId || t.goalId === ''),
    );
  },

  getProjectForGoal: (goalId: string) => {
    const goal = get().goals.get(goalId);
    if (!goal) return null;
    // Primary parent is a project
    if (goal.parentType === 'project') return get().projects.get(goal.parentId) ?? null;
    // Cross-reference field (goal parented to dept but serves a project)
    if (goal.projectId) {
      const p = get().projects.get(goal.projectId);
      if (p) return p;
    }
    // Fallback: scan project.goalIds (covers legacy data without cross-ref field)
    for (const project of get().projects.values()) {
      if (project.goalIds.includes(goalId)) return project;
    }
    return null;
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
