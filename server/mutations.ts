import { getEntity, upsertEntity, runTransaction, deleteEntity, db, getMeta } from './db';

// Type-safe entity getters with JSON blob pattern
function getTask(id: string): Record<string, unknown> | null {
  return getEntity('tasks', id) as Record<string, unknown> | null;
}
function getGoal(id: string): Record<string, unknown> | null {
  return getEntity('goals', id) as Record<string, unknown> | null;
}
function getMilestone(id: string): Record<string, unknown> | null {
  return getEntity('milestones', id) as Record<string, unknown> | null;
}

function arrayRemove(arr: string[], val: string): string[] {
  return arr.filter((v: string) => v !== val);
}

function arrayAdd(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr : [...arr, val];
}

// Ensure a Department row exists. Used by SG worker sync to land orphans on a
// synthetic "Unassigned" department or auto-create one per SG department id so
// the worker tree always has a valid parent.
function ensureDepartment(deptId: string, name: string) {
  const existing = getEntity('departments', deptId) as Record<string, unknown> | null;
  if (existing) {
    // Patch missing required arrays without destroying existing local data.
    const patched = {
      ...existing,
      name: existing.name || name,
      workerIds: (existing.workerIds as string[]) || [],
      goalIds: (existing.goalIds as string[]) || [],
      priority: (existing.priority as string) || 'P2',
      headName: (existing.headName as string) || '',
      description: (existing.description as string) || '',
    };
    upsertEntity('departments', deptId, patched);
    return patched;
  }
  const created = {
    id: deptId,
    name,
    description: '',
    headName: '',
    priority: 'P2',
    workerIds: [],
    goalIds: [],
    syncSource: 'sg' as const,
  };
  upsertEntity('departments', deptId, created);
  return created;
}

// Ensure a Company row exists. Bootstrap calls this with the SG site name so the
// app's breadcrumb header shows the actual SG site instead of the mock "Acme VFX".
function ensureCompany(name: string) {
  const allCompanyRows = db
    .prepare(`SELECT id, data FROM entities WHERE table_name = 'companies'`)
    .all() as { id: string; data: string }[];
  if (allCompanyRows.length > 0) {
    const first = allCompanyRows[0];
    const data = JSON.parse(first.data) as Record<string, unknown>;
    const updated = { ...data, name: name || data.name || 'Company' };
    upsertEntity('companies', first.id, updated);
    return updated;
  }
  const created = { id: 'company-sg', name: name || 'Company' };
  upsertEntity('companies', 'company-sg', created);
  return created;
}

// --- Port of Zustand mutation logic to server-side with SQLite transactions ---

export function updateTask(taskId: string, updates: Record<string, unknown>) {
  return runTransaction(() => {
    const existing = getTask(taskId);
    if (!existing) throw new Error(`Task ${taskId} not found`);

    const updated = { ...existing, ...updates };
    upsertEntity('tasks', taskId, updated);

    // Sync reverse links: dependsOnTaskIds
    if (updates.dependsOnTaskIds) {
      const oldDeps = existing.dependsOnTaskIds as string[];
      const newDeps = updates.dependsOnTaskIds as string[];

      for (const oldDepId of oldDeps) {
        const parent = getTask(oldDepId);
        if (parent) {
          upsertEntity('tasks', oldDepId, {
            ...parent,
            unlocksTaskIds: arrayRemove(parent.unlocksTaskIds as string[], taskId),
          });
        }
      }
      for (const newDepId of newDeps) {
        const parent = getTask(newDepId);
        if (parent) {
          upsertEntity('tasks', newDepId, {
            ...parent,
            unlocksTaskIds: arrayAdd(parent.unlocksTaskIds as string[], taskId),
          });
        }
      }
    }

    // Sync reverse links: unlocksTaskIds
    if (updates.unlocksTaskIds) {
      const oldChildren = existing.unlocksTaskIds as string[];
      const newChildren = updates.unlocksTaskIds as string[];

      for (const oldChildId of oldChildren) {
        const child = getTask(oldChildId);
        if (child) {
          upsertEntity('tasks', oldChildId, {
            ...child,
            dependsOnTaskIds: arrayRemove(child.dependsOnTaskIds as string[], taskId),
          });
        }
      }
      for (const newChildId of newChildren) {
        const child = getTask(newChildId);
        if (child) {
          upsertEntity('tasks', newChildId, {
            ...child,
            dependsOnTaskIds: arrayAdd(child.dependsOnTaskIds as string[], taskId),
          });
        }
      }
    }

    return updated;
  });
}

export function updateMilestone(milestoneId: string, updates: Record<string, unknown>) {
  return runTransaction(() => {
    const existing = getMilestone(milestoneId);
    if (!existing) throw new Error(`Milestone ${milestoneId} not found`);

    const updated = { ...existing, ...updates };
    upsertEntity('milestones', milestoneId, updated);

    // Sync: requiredTaskIds ↔ tasks' unlocksMilestoneIds
    if (updates.requiredTaskIds) {
      const oldTaskIds = existing.requiredTaskIds as string[];
      const newTaskIds = updates.requiredTaskIds as string[];

      for (const oldTaskId of oldTaskIds) {
        const task = getTask(oldTaskId);
        if (task) {
          upsertEntity('tasks', oldTaskId, {
            ...task,
            unlocksMilestoneIds: arrayRemove(task.unlocksMilestoneIds as string[], milestoneId),
          });
        }
      }
      for (const newTaskId of newTaskIds) {
        const task = getTask(newTaskId);
        if (task) {
          upsertEntity('tasks', newTaskId, {
            ...task,
            unlocksMilestoneIds: arrayAdd(task.unlocksMilestoneIds as string[], milestoneId),
          });
        }
      }
    }

    // Sync: requiredMilestoneIds ↔ milestones' unlocksMilestoneIds
    if (updates.requiredMilestoneIds) {
      const oldMsIds = existing.requiredMilestoneIds as string[];
      const newMsIds = updates.requiredMilestoneIds as string[];

      for (const oldMsId of oldMsIds) {
        const ms = getMilestone(oldMsId);
        if (ms) {
          upsertEntity('milestones', oldMsId, {
            ...ms,
            unlocksMilestoneIds: arrayRemove(ms.unlocksMilestoneIds as string[], milestoneId),
          });
        }
      }
      for (const newMsId of newMsIds) {
        const ms = getMilestone(newMsId);
        if (ms) {
          upsertEntity('milestones', newMsId, {
            ...ms,
            unlocksMilestoneIds: arrayAdd(ms.unlocksMilestoneIds as string[], milestoneId),
          });
        }
      }
    }

    // Sync: unlocksTaskIds ↔ tasks' dependsOnMilestoneIds
    if (updates.unlocksTaskIds) {
      const oldTaskIds = existing.unlocksTaskIds as string[];
      const newTaskIds = updates.unlocksTaskIds as string[];

      for (const oldTaskId of oldTaskIds) {
        const task = getTask(oldTaskId);
        if (task) {
          upsertEntity('tasks', oldTaskId, {
            ...task,
            dependsOnMilestoneIds: arrayRemove(task.dependsOnMilestoneIds as string[], milestoneId),
          });
        }
      }
      for (const newTaskId of newTaskIds) {
        const task = getTask(newTaskId);
        if (task) {
          upsertEntity('tasks', newTaskId, {
            ...task,
            dependsOnMilestoneIds: arrayAdd(task.dependsOnMilestoneIds as string[], milestoneId),
          });
        }
      }
    }

    return updated;
  });
}

export function updateGoal(goalId: string, updates: Record<string, unknown>) {
  return runTransaction(() => {
    const existing = getGoal(goalId);
    if (!existing) throw new Error(`Goal ${goalId} not found`);

    const updated = { ...existing, ...updates };
    upsertEntity('goals', goalId, updated);

    // Sync: unlocksGoalIds ↔ targets' dependsOnGoalIds
    if (updates.unlocksGoalIds) {
      const oldTargets = existing.unlocksGoalIds as string[];
      const newTargets = updates.unlocksGoalIds as string[];

      for (const oldTargetId of oldTargets) {
        const target = getGoal(oldTargetId);
        if (target) {
          upsertEntity('goals', oldTargetId, {
            ...target,
            dependsOnGoalIds: arrayRemove(target.dependsOnGoalIds as string[], goalId),
          });
        }
      }
      for (const newTargetId of newTargets) {
        const target = getGoal(newTargetId);
        if (target) {
          upsertEntity('goals', newTargetId, {
            ...target,
            dependsOnGoalIds: arrayAdd(target.dependsOnGoalIds as string[], goalId),
          });
        }
      }
    }

    // Sync: dependsOnGoalIds ↔ sources' unlocksGoalIds
    if (updates.dependsOnGoalIds) {
      const oldSources = existing.dependsOnGoalIds as string[];
      const newSources = updates.dependsOnGoalIds as string[];

      for (const oldSourceId of oldSources) {
        const source = getGoal(oldSourceId);
        if (source) {
          upsertEntity('goals', oldSourceId, {
            ...source,
            unlocksGoalIds: arrayRemove(source.unlocksGoalIds as string[], goalId),
          });
        }
      }
      for (const newSourceId of newSources) {
        const source = getGoal(newSourceId);
        if (source) {
          upsertEntity('goals', newSourceId, {
            ...source,
            unlocksGoalIds: arrayAdd(source.unlocksGoalIds as string[], goalId),
          });
        }
      }
    }

    return updated;
  });
}

export function updateDepartment(deptId: string, updates: Record<string, unknown>) {
  return runTransaction(() => {
    const existing = getDepartment(deptId);
    if (!existing) throw new Error(`Department ${deptId} not found`);

    const updated = { ...existing, ...updates };
    upsertEntity('departments', deptId, updated);
    return updated;
  });
}

export function updateProject(projectId: string, updates: Record<string, unknown>) {
  return runTransaction(() => {
    const existing = getProject(projectId);
    if (!existing) throw new Error(`Project ${projectId} not found`);

    const updated = { ...existing, ...updates };
    upsertEntity('projects', projectId, updated);
    return updated;
  });
}

export function updateWorker(workerId: string, updates: Record<string, unknown>) {
  return runTransaction(() => {
    const existing = getEntity('workers', workerId) as Record<string, unknown> | null;
    if (!existing) throw new Error(`Worker ${workerId} not found`);

    const updated = { ...existing, ...updates };
    upsertEntity('workers', workerId, updated);
    return updated;
  });
}

function getDepartment(id: string): Record<string, unknown> | null {
  return getEntity('departments', id) as Record<string, unknown> | null;
}
function getProject(id: string): Record<string, unknown> | null {
  return getEntity('projects', id) as Record<string, unknown> | null;
}

export function addGoal(goal: Record<string, unknown>) {
  return runTransaction(() => {
    const goalId = goal.id as string;

    let finalGoal = { ...goal };
    if (goal.parentType === 'department' && !goal.departmentId) {
      finalGoal = { ...finalGoal, departmentId: goal.parentId as string };
    }
    if (goal.parentType === 'project' && !goal.projectId) {
      finalGoal = { ...finalGoal, projectId: goal.parentId as string };
    }

    upsertEntity('goals', goalId, finalGoal);

    // Add goal to parent's goalIds
    const parentType = finalGoal.parentType as string;
    const parentId = finalGoal.parentId as string;
    if (parentType === 'department') {
      const dept = getDepartment(parentId);
      if (dept) {
        const goalIds = dept.goalIds as string[];
        if (!goalIds.includes(goalId)) {
          upsertEntity('departments', parentId, { ...dept, goalIds: [...goalIds, goalId] });
        }
      }
    } else if (parentType === 'project') {
      const proj = getProject(parentId);
      if (proj) {
        const goalIds = proj.goalIds as string[];
        if (!goalIds.includes(goalId)) {
          upsertEntity('projects', parentId, { ...proj, goalIds: [...goalIds, goalId] });
        }
      }
    }

    return finalGoal;
  });
}

export function removeGoal(goalId: string) {
  return runTransaction(() => {
    const goal = getGoal(goalId);
    if (!goal) return { deleted: false };

    const parentType = goal.parentType as string;
    const parentId = goal.parentId as string;

    // Remove from parent's goalIds
    if (parentType === 'department') {
      const dept = getDepartment(parentId);
      if (dept) {
        upsertEntity('departments', parentId, {
          ...dept,
          goalIds: (dept.goalIds as string[]).filter((id) => id !== goalId),
        });
      }
    } else if (parentType === 'project') {
      const proj = getProject(parentId);
      if (proj) {
        upsertEntity('projects', parentId, {
          ...proj,
          goalIds: (proj.goalIds as string[]).filter((id) => id !== goalId),
        });
      }
    }

    // Also remove from cross-referenced project/dept goalIds
    if (goal.projectId && goal.projectId !== parentId) {
      const proj = getProject(goal.projectId);
      if (proj) {
        upsertEntity('projects', goal.projectId, {
          ...proj,
          goalIds: (proj.goalIds as string[]).filter((id) => id !== goalId),
        });
      }
    }
    if (goal.departmentId && goal.departmentId !== parentId) {
      const dept = getDepartment(goal.departmentId);
      if (dept) {
        upsertEntity('departments', goal.departmentId, {
          ...dept,
          goalIds: (dept.goalIds as string[]).filter((id) => id !== goalId),
        });
      }
    }

    deleteEntity('goals', goalId);
    return { deleted: true };
  });
}

export function addMilestone(milestone: Record<string, unknown>) {
  return runTransaction(() => {
    const msId = milestone.id as string;
    upsertEntity('milestones', msId, milestone);

    // Add milestone to parent goal's milestoneIds
    const parentType = milestone.parentType as string;
    const parentId = milestone.parentId as string;
    if (parentType === 'goal') {
      const goal = getGoal(parentId);
      if (goal) {
        const milestoneIds = goal.milestoneIds as string[];
        if (!milestoneIds.includes(msId)) {
          upsertEntity('goals', parentId, { ...goal, milestoneIds: [...milestoneIds, msId] });
        }
      }
    }
    // If parentType is 'project', add to project's milestoneIds
    if (parentType === 'project') {
      const proj = getProject(parentId);
      if (proj) {
        const milestoneIds = proj.milestoneIds as string[];
        if (!milestoneIds.includes(msId)) {
          upsertEntity('projects', parentId, { ...proj, milestoneIds: [...milestoneIds, msId] });
        }
      }
    }

    return milestone;
  });
}

export function addTaskToGoal(goalId: string, task: Record<string, unknown>) {
  return runTransaction(() => {
    const taskId = task.id as string;
    upsertEntity('tasks', taskId, task);

    const goal = getGoal(goalId);
    if (goal) {
      const taskIds = goal.taskIds as string[];
      if (!taskIds.includes(taskId)) {
        upsertEntity('goals', goalId, {
          ...goal,
          taskIds: [...taskIds, taskId],
        });
      }
    }

    return { task, goal: getGoal(goalId) };
  });
}

export function removeTaskFromGoal(goalId: string, taskId: string) {
  return runTransaction(() => {
    const goal = getGoal(goalId);
    if (goal) {
      upsertEntity('goals', goalId, {
        ...goal,
        taskIds: arrayRemove(goal.taskIds as string[], taskId),
      });
    }

    const task = getTask(taskId);
    if (task) {
      for (const depId of task.dependsOnTaskIds as string[]) {
        const parent = getTask(depId);
        if (parent) {
          upsertEntity('tasks', depId, {
            ...parent,
            unlocksTaskIds: arrayRemove(parent.unlocksTaskIds as string[], taskId),
          });
        }
      }
      for (const childId of task.unlocksTaskIds as string[]) {
        const child = getTask(childId);
        if (child) {
          upsertEntity('tasks', childId, {
            ...child,
            dependsOnTaskIds: arrayRemove(child.dependsOnTaskIds as string[], taskId),
          });
        }
      }
      upsertEntity('tasks', taskId, {
        ...task,
        goalId: '',
        dependsOnTaskIds: [],
        unlocksTaskIds: [],
        unlocksMilestoneIds: [],
        dependsOnMilestoneIds: [],
      });
    }

    return { goalId, taskId };
  });
}

export function removeMilestoneFromGoal(goalId: string, milestoneId: string) {
  return runTransaction(() => {
    // Remove from goal's milestoneIds
    const goal = getGoal(goalId);
    if (goal) {
      upsertEntity('goals', goalId, {
        ...goal,
        milestoneIds: arrayRemove(goal.milestoneIds as string[], milestoneId),
      });
    }

    const ms = getMilestone(milestoneId);
    if (ms) {
      // Unlink tasks that unlock this milestone
      for (const taskId of ms.requiredTaskIds as string[]) {
        const task = getTask(taskId);
        if (task) {
          upsertEntity('tasks', taskId, {
            ...task,
            unlocksMilestoneIds: arrayRemove(task.unlocksMilestoneIds as string[], milestoneId),
          });
        }
      }
      // Unlink milestones that depend on this one
      for (const depMsId of ms.requiredMilestoneIds as string[]) {
        const depMs = getMilestone(depMsId);
        if (depMs) {
          upsertEntity('milestones', depMsId, {
            ...depMs,
            unlocksMilestoneIds: arrayRemove(depMs.unlocksMilestoneIds as string[] ?? [], milestoneId),
          });
        }
      }
      // Clear the milestone itself
      upsertEntity('milestones', milestoneId, {
        ...ms,
        parentId: '',
        requiredTaskIds: [],
        requiredMilestoneIds: [],
      });
    }

    return { goalId, milestoneId };
  });
}

// === SG Sync Mutations ===

export type SgTaskStatus = 'completed' | 'in_progress' | 'available' | 'locked' | 'blocked' | 'paused';

export interface SgTicketPayload {
  id: number;
  title: string;
  description: string;
  project?: { id: number; name: string };
  sgStatus?: string;
  sgEstimate?: number;
  timeLogsSum?: number;
  assignedTo?: { id: number; name: string; type: string }[];
  retired?: boolean;
}

// Code-level defaults for the inbound SG-code → TaskStatus mapping. Kept in
// sync with DEFAULT_SG_STATUS_MAP_INBOUND in server/routes.ts; the defaults
// here exist so this module doesn't have to import from routes (the import
// would be circular: routes.ts already imports mapSgStatusToTaskStatus).
const DEFAULT_INBOUND_MAP: Record<string, SgTaskStatus> = {
  res:  'completed',
  ip:   'in_progress',
  cdrv: 'in_progress',
  kckb: 'in_progress',
  rev:  'in_progress',
  wfb:  'in_progress',
  rdy:  'available',
  tri:  'available',
  bkd:  'blocked',
  hld:  'paused',
  opn:  'locked',
  omt:  'locked',
};

// Read on every call so admin edits take effect without a restart. User
// overrides merge on top of defaults; codes still missing fall through to
// keyword matching below, and finally default to 'available' so freshly
// imported tickets with no dependencies don't surface as locked.
function loadInboundStatusMap(): Record<string, SgTaskStatus> {
  const raw = getMeta('sg_status_map_inbound');
  if (!raw) return { ...DEFAULT_INBOUND_MAP };
  try {
    const parsed = JSON.parse(raw) as Record<string, SgTaskStatus>;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_INBOUND_MAP };
    return { ...DEFAULT_INBOUND_MAP, ...parsed };
  } catch {
    return { ...DEFAULT_INBOUND_MAP };
  }
}

export function mapSgStatusToTaskStatus(sgStatus: string): SgTaskStatus {
  const code = sgStatus?.trim() || '';
  if (code) {
    const map = loadInboundStatusMap();
    const mapped = map[code];
    if (mapped) return mapped;
  }
  const s = code.toLowerCase();
  if (['resolved', 'closed', 'final', 'done', 'complete'].some(v => s.includes(v))) return 'completed';
  if (['in progress', 'in_progress', 'ip', 'working'].some(v => s.includes(v))) return 'in_progress';
  if (['wait', 'ready', 'open', 'new', 'rev'].some(v => s.includes(v))) return 'available';
  if (['block', 'hold'].some(v => s.includes(v))) return 'blocked';
  if (['pause', 'stop'].some(v => s.includes(v))) return 'paused';
  return 'available';
}

export function upsertTaskFromSg(payload: SgTicketPayload, goalId = '') {
  return runTransaction(() => {
    const taskId = `sg-${payload.id}`;
    const existing = getTask(taskId);

    const sgAssignees = payload.assignedTo || [];
    const newWorkerIds = sgAssignees.map(a => `sg-${a.id}`);
    const prevWorkerIds = (existing?.assignedWorkerIds as string[]) || [];

    // Preserve goalId when a re-sync has no placement info — only clear it if explicitly unplaced
    const resolvedGoalId = goalId || (existing as Record<string, unknown>)?.goalId as string || '';
    const isArchived = payload.retired || false;
    const safeName =
      (typeof payload.title === 'string' && payload.title.trim()) ||
      `Ticket ${payload.id}`;

    const updates: Record<string, unknown> = {
      // `id` must be present in the JSON blob — frontend Maps key by entity id
      // and components like TimelineView/getRelatedNodeIds use task.id directly.
      id: taskId,
      name: safeName,
      description: payload.description || '',
      status: mapSgStatusToTaskStatus(payload.sgStatus || ''),
      ticketId: payload.id.toString(),
      ticketUrl: payload.project ? `https://wei-dev.shotgrid.autodesk.com/tickets/${payload.id}` : undefined,
      sgTicketId: payload.id,
      sgProjectId: payload.project?.id,
      sgProjectName: payload.project?.name,
      sgStatus: payload.sgStatus,
      sgEstimate: payload.sgEstimate,
      sgTimeLogged: payload.timeLogsSum,
      sgAssignedTo: sgAssignees,
      assignedWorkerIds: newWorkerIds,
      baseDurationDays: payload.sgEstimate || 1,
      syncSource: 'sg' as const,
      archived: isArchived,
      archivedAt: isArchived
        ? ((existing as Record<string, unknown>)?.archivedAt as string | undefined) || new Date().toISOString()
        : undefined,
      unplaced: !resolvedGoalId,
      goalId: resolvedGoalId,
      // Required Task fields that SG never provides — initialise once on create
      // and preserve any value that the user (or local mutations) put there.
      dependsOnTaskIds:
        (existing?.dependsOnTaskIds as string[] | undefined) ?? [],
      dependsOnMilestoneIds:
        (existing?.dependsOnMilestoneIds as string[] | undefined) ?? [],
      unlocksTaskIds:
        (existing?.unlocksTaskIds as string[] | undefined) ?? [],
      unlocksMilestoneIds:
        (existing?.unlocksMilestoneIds as string[] | undefined) ?? [],
      contributingDepartmentId:
        (existing?.contributingDepartmentId as string | undefined) ?? '',
      parallelizationFactor:
        (existing?.parallelizationFactor as number | undefined) ?? 0.5,
      // Multi-association: auto-add SG project, preserve any user-added ones
      relatedProjectIds: (() => {
        const existingProjects = ((existing as Record<string, unknown>)?.relatedProjectIds as string[] | undefined) ?? [];
        const sgProject = payload.project ? `sg-${payload.project.id}` : null;
        const base = existingProjects.filter(id => id !== sgProject);
        return sgProject ? [...base, sgProject] : base;
      })(),
      relatedDepartmentIds:
        ((existing as Record<string, unknown>)?.relatedDepartmentIds as string[] | undefined) ?? [],
    };

    const updated = { ...(existing || {}), ...updates };
    upsertEntity('tasks', taskId, updated);

    // Bidirectional assignment sync — only for non-archived tasks
    if (!isArchived) {
      const wasArchived = !!(existing as Record<string, unknown>)?.archived;
      // On revival (archived→active) treat all new workers as freshly added
      const added = wasArchived
        ? newWorkerIds
        : newWorkerIds.filter(id => !prevWorkerIds.includes(id));
      const removed = wasArchived
        ? []
        : prevWorkerIds.filter(id => !newWorkerIds.includes(id));

      for (const workerId of added) {
        const worker = getEntity('workers', workerId) as Record<string, unknown> | null;
        if (worker) {
          upsertEntity('workers', workerId, {
            ...worker,
            assignedTaskIds: arrayAdd((worker.assignedTaskIds as string[]) || [], taskId),
          });
        }
      }

      for (const workerId of removed) {
        const worker = getEntity('workers', workerId) as Record<string, unknown> | null;
        if (worker) {
          upsertEntity('workers', workerId, {
            ...worker,
            activeTaskIds: arrayRemove((worker.activeTaskIds as string[]) || [], taskId),
            assignedTaskIds: arrayRemove((worker.assignedTaskIds as string[]) || [], taskId),
          });
        }
      }
    } else {
      // On archive, remove from all currently assigned workers
      for (const workerId of prevWorkerIds) {
        const worker = getEntity('workers', workerId) as Record<string, unknown> | null;
        if (worker) {
          upsertEntity('workers', workerId, {
            ...worker,
            activeTaskIds: arrayRemove((worker.activeTaskIds as string[]) || [], taskId),
            assignedTaskIds: arrayRemove((worker.assignedTaskIds as string[]) || [], taskId),
          });
        }
      }
    }

    return updated;
  });
}

export function archiveTaskFromSg(sgTicketId: number) {
  return runTransaction(() => {
    const taskId = `sg-${sgTicketId}`;
    const existing = getTask(taskId);
    if (!existing) return null;

    // Remove from all assigned workers before archiving
    const prevWorkerIds = (existing.assignedWorkerIds as string[]) || [];
    for (const workerId of prevWorkerIds) {
      const worker = getEntity('workers', workerId) as Record<string, unknown> | null;
      if (worker) {
        upsertEntity('workers', workerId, {
          ...worker,
          activeTaskIds: arrayRemove((worker.activeTaskIds as string[]) || [], taskId),
          assignedTaskIds: arrayRemove((worker.assignedTaskIds as string[]) || [], taskId),
        });
      }
    }

    // Preserve last-known status — archived flag is the source of truth for retirement
    const updated = {
      ...existing,
      archived: true,
      archivedAt: (existing.archivedAt as string | undefined) || new Date().toISOString(),
    };
    upsertEntity('tasks', taskId, updated);
    return updated;
  });
}

export interface SgProjectPayload {
  id: number;
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  durationDays?: number;
}

export function upsertProjectFromSg(payload: SgProjectPayload) {
  return runTransaction(() => {
    const projectId = `sg-${payload.id}`;
    const existing = getProject(projectId);

    // SG is source-of-truth only for these fields; everything else is local-only.
    // Fall back to a synthetic name if SG returned null/empty so the UI never has to
    // deal with `null.localeCompare`/`null.toLowerCase` etc.
    const safeName =
      (typeof payload.name === 'string' && payload.name.trim()) ||
      `Project ${payload.id}`;
    const sgFields: Record<string, unknown> = {
      id: projectId,
      name: safeName,
      description: payload.description || '',
      deadline: payload.endDate || '',
      startDate: payload.startDate,
      endDate: payload.endDate,
      durationDays: payload.durationDays,
      sgProjectId: payload.id,
      syncSource: 'sg' as const,
    };

    const defaults: Record<string, unknown> = {
      strategicPriority: 'P2' as const,
      status: 'active' as const,
      contributingDepartmentIds: [],
      goalIds: [],
      milestoneIds: [],
    };

    // On re-sync, preserve local strategicPriority/status/relationships;
    // only apply defaults when creating for the first time.
    const updated = existing
      ? { ...existing, ...sgFields }
      : { ...defaults, ...sgFields };

    upsertEntity('projects', projectId, updated);
    return updated;
  });
}

export function replaceProjectsFromSg(projects: SgProjectPayload[]) {
  return runTransaction(() => {
    const incomingIds = new Set(projects.map(p => `sg-${p.id}`));
    const allRows = db.prepare(`SELECT id, data FROM entities WHERE table_name = 'projects'`).all() as { id: string; data: string }[];
    for (const row of allRows) {
      const data = JSON.parse(row.data) as Record<string, unknown>;
      if (data.syncSource === 'sg' && !incomingIds.has(row.id)) {
        // Clear sgProjectId/sgProjectName on any tasks referencing this deleted project
        const taskRows = db.prepare(`SELECT id, data FROM entities WHERE table_name = 'tasks'`).all() as { id: string; data: string }[];
        for (const taskRow of taskRows) {
          const task = JSON.parse(taskRow.data) as Record<string, unknown>;
          if (task.sgProjectId !== undefined && `sg-${task.sgProjectId}` === row.id) {
            upsertEntity('tasks', taskRow.id, { ...task, sgProjectId: undefined, sgProjectName: undefined });
          }
        }
        deleteEntity('projects', row.id);
      }
    }
    for (const p of projects) {
      upsertProjectFromSg(p);
    }
  });
}

export interface SgUserPayload {
  id: number;
  name: string;
  permissionGroup?: string;
  departmentId?: number;
  departmentName?: string;
  sgStatus?: string;
}

export function upsertWorkerFromSg(payload: SgUserPayload) {
  return runTransaction(() => {
    const workerId = `sg-${payload.id}`;
    const existing = getEntity('workers', workerId) as Record<string, unknown> | null;

    // Explicit mapping per spec: Artist→worker, Manager→coordinator, Admin→admin
    const sgRole = payload.permissionGroup?.toLowerCase() || '';
    let role: 'worker' | 'coordinator' | 'admin' = 'worker';
    if (sgRole.includes('admin')) role = 'admin';
    else if (sgRole.includes('manager')) role = 'coordinator';

    // Map SG user sg_status to WorkerAvailability
    // Only sync if SG provides a status; otherwise preserve existing on re-sync, default to 'full' on first create
    const sgStatus = payload.sgStatus?.toLowerCase() || '';
    let availability: 'full' | 'partial' | 'unavailable' | undefined = undefined;
    if (sgStatus) {
      if (sgStatus.includes('disab') || sgStatus.includes('inactive') || sgStatus.includes('deleted') || sgStatus.includes('disconnect')) {
        availability = 'unavailable';
      } else if (sgStatus.includes('away') || sgStatus.includes('busy') || sgStatus.includes('out') || sgStatus.includes('PTO') || sgStatus.includes('leave')) {
        availability = 'partial';
      } else if (sgStatus.includes('active') || sgStatus.includes('enable') || sgStatus.includes('work')) {
        availability = 'full';
      }
    }

    const safeName =
      (typeof payload.name === 'string' && payload.name.trim()) ||
      `User ${payload.id}`;

    // Ensure a fallback "Unassigned" department exists for orphans, otherwise the
    // worker tree filters lose the row and `worker.name.split(' ')` etc. crash
    // downstream when a worker has no department.
    const deptIdStr = payload.departmentId?.toString();
    let resolvedDeptId = '';
    let resolvedDeptName = payload.departmentName || '';
    if (deptIdStr) {
      resolvedDeptId = `sg-dept-${deptIdStr}`;
      ensureDepartment(resolvedDeptId, resolvedDeptName || `Department ${deptIdStr}`);
    } else {
      resolvedDeptId = 'sg-dept-unassigned';
      resolvedDeptName = resolvedDeptName || 'Unassigned';
      ensureDepartment(resolvedDeptId, 'Unassigned');
    }

    const updates: Record<string, unknown> = {
      id: workerId,
      name: safeName,
      sgUserId: payload.id,
      permissionGroup: payload.permissionGroup,
      role,
      syncSource: 'sg' as const,
      departmentId: resolvedDeptId,
      departmentName: resolvedDeptName,
      // Preserve existing task lists — only initialise on first create
      activeTaskIds: (existing?.activeTaskIds as string[]) || [],
      assignedTaskIds: (existing?.assignedTaskIds as string[]) || [],
      // Sync availability from SG when provided; preserve existing on re-sync, default to 'full' on first create
      availability: availability ?? ((existing?.availability as string | undefined) || 'full'),
    };

    const updated = { ...(existing || {}), ...updates };
    upsertEntity('workers', workerId, updated);

    // Keep users table in sync so Role Management shows all SG workers.
    // INSERT OR IGNORE preserves any role that was manually set by an admin.
    const userRole = role === 'admin' ? 'worker' : role; // admin is session-only, never stored
    db.prepare('INSERT OR IGNORE INTO users (name, role) VALUES (?, ?)').run(safeName, userRole);

    return updated;
  });
}

export function replaceWorkersFromSg(users: SgUserPayload[]) {
  return runTransaction(() => {
    const incomingIds = new Set(users.map(u => `sg-${u.id}`));
    const allRows = db.prepare(`SELECT id, data FROM entities WHERE table_name = 'workers'`).all() as { id: string; data: string }[];
    for (const row of allRows) {
      const data = JSON.parse(row.data) as Record<string, unknown>;
      if (data.syncSource === 'sg' && !incomingIds.has(row.id)) {
        // Remove this stale worker from any tasks' assignedWorkerIds
        const taskRows = db.prepare(`SELECT id, data FROM entities WHERE table_name = 'tasks'`).all() as { id: string; data: string }[];
        for (const taskRow of taskRows) {
          const task = JSON.parse(taskRow.data) as Record<string, unknown>;
          const assigned = (task.assignedWorkerIds as string[]) || [];
          if (assigned.includes(row.id)) {
            upsertEntity('tasks', taskRow.id, {
              ...task,
              assignedWorkerIds: assigned.filter(id => id !== row.id),
            });
          }
        }
        deleteEntity('workers', row.id);
      }
    }
    for (const u of users) {
      upsertWorkerFromSg(u);
    }
  });
}

export function archiveWorkerFromSg(sgUserId: number) {
  return runTransaction(() => {
    const workerId = `sg-${sgUserId}`;
    const existing = getEntity('workers', workerId) as Record<string, unknown> | null;
    if (!existing) return null;

    // Remove this worker from all tasks' assignedWorkerIds
    const taskRows = db.prepare(`SELECT id, data FROM entities WHERE table_name = 'tasks'`).all() as { id: string; data: string }[];
    for (const taskRow of taskRows) {
      const task = JSON.parse(taskRow.data) as Record<string, unknown>;
      const assigned = (task.assignedWorkerIds as string[]) || [];
      if (assigned.includes(workerId)) {
        upsertEntity('tasks', taskRow.id, {
          ...task,
          assignedWorkerIds: assigned.filter(id => id !== workerId),
        });
      }
    }

    const updated = {
      ...existing,
      archived: true,
      archivedAt: (existing.archivedAt as string | undefined) || new Date().toISOString(),
    };
    upsertEntity('workers', workerId, updated);
    return updated;
  });
}

export function archiveProjectFromSg(sgProjectId: number) {
  return runTransaction(() => {
    const projectId = `sg-${sgProjectId}`;
    const existing = getProject(projectId);
    if (!existing) return null;

    // Mark archived — preserve all goal/task/department associations so
    // the tech tree can still render tasks belonging to this project
    const updated = {
      ...existing,
      archived: true,
      archivedAt: (existing.archivedAt as string | undefined) || new Date().toISOString(),
    };
    upsertEntity('projects', projectId, updated);
    return updated;
  });
}

// Set/refresh the company name from SG bootstrap. Called once at the start of
// `replaceProjectsFromSg`/`replaceWorkersFromSg` so the breadcrumb header shows
// the actual SG site name instead of the mock "Acme VFX".
export function setSgSiteName(name: string) {
  return runTransaction(() => ensureCompany(name));
}

export interface SgDepartmentPayload {
  id: number;
  name: string;
  description?: string;
}

export function upsertDepartmentFromSg(payload: SgDepartmentPayload) {
  return runTransaction(() => {
    const deptId = `sg-dept-${payload.id}`;
    const existing = getEntity('departments', deptId) as Record<string, unknown> | null;
    const safeName = (typeof payload.name === 'string' && payload.name.trim()) || `Department ${payload.id}`;
    const updated = {
      ...(existing || {}),
      id: deptId,
      name: safeName,
      description: payload.description || (existing?.description as string) || '',
      sgDeptId: payload.id,
      syncSource: 'sg' as const,
      // Preserve locally-managed fields
      workerIds: (existing?.workerIds as string[]) || [],
      goalIds: (existing?.goalIds as string[]) || [],
      headName: (existing?.headName as string) || '',
      priority: (existing?.priority as string) || 'P2',
    };
    upsertEntity('departments', deptId, updated);
    return updated;
  });
}

export function replaceDepartmentsFromSg(departments: SgDepartmentPayload[]) {
  return runTransaction(() => {
    const incomingIds = new Set(departments.map(d => `sg-dept-${d.id}`));
    // Archive stale SG departments that no longer exist in SG
    const allRows = db.prepare(`SELECT id, data FROM entities WHERE table_name='departments'`).all() as { id: string; data: string }[];
    for (const row of allRows) {
      const data = JSON.parse(row.data) as Record<string, unknown>;
      if (data.syncSource === 'sg' && data.id !== 'sg-dept-unassigned' && !incomingIds.has(row.id)) {
        deleteEntity('departments', row.id);
      }
    }
    for (const d of departments) {
      upsertDepartmentFromSg(d);
    }
  });
}

// === Per-entity deletion with reference checks ===
//
// Each remove* function refuses deletion if *any* other entity still references
// it, returning the list of blockers so the UI can tell the user what they need
// to detach first. The bulk clear endpoints in routes.ts skip these checks
// (everything is going at once, so cross-references are cleaned implicitly).

export class BlockedByReferencesError extends Error {
  blockers: string[];
  constructor(blockers: string[]) {
    super(`Cannot delete: still referenced by ${blockers.length} entit${blockers.length === 1 ? 'y' : 'ies'}`);
    this.name = 'BlockedByReferencesError';
    this.blockers = blockers;
  }
}

function readAll(table: string): Array<{ id: string; data: Record<string, unknown> }> {
  const rows = db.prepare(`SELECT id, data FROM entities WHERE table_name=?`).all(table) as { id: string; data: string }[];
  return rows.map(r => ({ id: r.id, data: JSON.parse(r.data) as Record<string, unknown> }));
}

function label(table: string, id: string): string {
  const e = getEntity(table, id) as { name?: string } | null;
  return e?.name ? `${e.name}` : id;
}

export function removeWorker(workerId: string) {
  return runTransaction(() => {
    const worker = getEntity('workers', workerId) as Record<string, unknown> | null;
    if (!worker) return { deleted: false };

    const blockers: string[] = [];
    // Block if any task has this worker assigned
    for (const t of readAll('tasks')) {
      const assigned = (t.data.assignedWorkerIds as string[] | undefined) ?? [];
      if (assigned.includes(workerId)) {
        blockers.push(`task "${label('tasks', t.id)}" has this worker assigned`);
      }
    }
    if (blockers.length > 0) throw new BlockedByReferencesError(blockers);

    // Detach from department's workerIds
    const deptId = worker.departmentId as string | undefined;
    if (deptId) {
      const dept = getDepartment(deptId);
      if (dept) {
        upsertEntity('departments', deptId, {
          ...dept,
          workerIds: arrayRemove((dept.workerIds as string[]) || [], workerId),
        });
      }
    }
    deleteEntity('workers', workerId);
    return { deleted: true };
  });
}

export function removeProject(projectId: string) {
  return runTransaction(() => {
    const project = getProject(projectId);
    if (!project) return { deleted: false };

    const blockers: string[] = [];
    for (const g of readAll('goals')) {
      if (g.data.parentType === 'project' && g.data.parentId === projectId) {
        blockers.push(`goal "${label('goals', g.id)}" is parented to this project`);
      } else if (g.data.projectId === projectId) {
        blockers.push(`goal "${label('goals', g.id)}" cross-references this project`);
      }
    }
    for (const t of readAll('tasks')) {
      const related = (t.data.relatedProjectIds as string[] | undefined) ?? [];
      if (related.includes(projectId)) {
        blockers.push(`task "${label('tasks', t.id)}" is related to this project`);
      }
    }
    if (blockers.length > 0) throw new BlockedByReferencesError(blockers);

    deleteEntity('projects', projectId);
    return { deleted: true };
  });
}

export function removeDepartment(deptId: string) {
  return runTransaction(() => {
    const dept = getDepartment(deptId);
    if (!dept) return { deleted: false };

    const blockers: string[] = [];
    for (const w of readAll('workers')) {
      if (w.data.departmentId === deptId) {
        blockers.push(`worker "${label('workers', w.id)}" belongs to this department`);
      }
    }
    for (const g of readAll('goals')) {
      if (g.data.parentType === 'department' && g.data.parentId === deptId) {
        blockers.push(`goal "${label('goals', g.id)}" is parented to this department`);
      } else if (g.data.departmentId === deptId) {
        blockers.push(`goal "${label('goals', g.id)}" cross-references this department`);
      }
    }
    for (const t of readAll('tasks')) {
      if (t.data.contributingDepartmentId === deptId) {
        blockers.push(`task "${label('tasks', t.id)}" contributes to this department`);
      }
      const related = (t.data.relatedDepartmentIds as string[] | undefined) ?? [];
      if (related.includes(deptId)) {
        blockers.push(`task "${label('tasks', t.id)}" is related to this department`);
      }
    }
    for (const p of readAll('projects')) {
      const contrib = (p.data.contributingDepartmentIds as string[] | undefined) ?? [];
      if (contrib.includes(deptId)) {
        blockers.push(`project "${label('projects', p.id)}" lists this department as a contributor`);
      }
    }
    if (blockers.length > 0) throw new BlockedByReferencesError(blockers);

    deleteEntity('departments', deptId);
    return { deleted: true };
  });
}

export function removeTask(taskId: string) {
  return runTransaction(() => {
    const task = getTask(taskId);
    if (!task) return { deleted: false };

    const blockers: string[] = [];
    // Block if any worker has it assigned (active or queued)
    for (const w of readAll('workers')) {
      const assigned = (w.data.assignedTaskIds as string[] | undefined) ?? [];
      const active = (w.data.activeTaskIds as string[] | undefined) ?? [];
      if (assigned.includes(taskId) || active.includes(taskId)) {
        blockers.push(`worker "${label('workers', w.id)}" has this task assigned`);
      }
    }
    // Block if any downstream task/milestone depends on it
    const unlocksTasks = (task.unlocksTaskIds as string[] | undefined) ?? [];
    for (const otherId of unlocksTasks) {
      const other = getTask(otherId);
      if (other) blockers.push(`task "${other.name as string ?? otherId}" depends on this task`);
    }
    const unlocksMs = (task.unlocksMilestoneIds as string[] | undefined) ?? [];
    for (const msId of unlocksMs) {
      const ms = getMilestone(msId);
      if (ms) blockers.push(`milestone "${ms.name as string ?? msId}" requires this task`);
    }
    if (blockers.length > 0) throw new BlockedByReferencesError(blockers);

    // Remove from goal's taskIds
    const goalId = task.goalId as string | undefined;
    if (goalId) {
      const goal = getGoal(goalId);
      if (goal) {
        upsertEntity('goals', goalId, {
          ...goal,
          taskIds: arrayRemove((goal.taskIds as string[]) || [], taskId),
        });
      }
    }
    // Clear reverse deps on upstream tasks
    const dependsOn = (task.dependsOnTaskIds as string[] | undefined) ?? [];
    for (const upId of dependsOn) {
      const up = getTask(upId);
      if (up) {
        upsertEntity('tasks', upId, {
          ...up,
          unlocksTaskIds: arrayRemove((up.unlocksTaskIds as string[]) || [], taskId),
        });
      }
    }
    const dependsOnMs = (task.dependsOnMilestoneIds as string[] | undefined) ?? [];
    for (const msId of dependsOnMs) {
      const ms = getMilestone(msId);
      if (ms) {
        upsertEntity('milestones', msId, {
          ...ms,
          unlocksTaskIds: arrayRemove((ms.unlocksTaskIds as string[]) || [], taskId),
        });
      }
    }
    deleteEntity('tasks', taskId);
    return { deleted: true };
  });
}

export function removeMilestone(milestoneId: string) {
  return runTransaction(() => {
    const ms = getMilestone(milestoneId);
    if (!ms) return { deleted: false };

    const blockers: string[] = [];
    // Block if any task/milestone depends on it
    const unlocksTasks = (ms.unlocksTaskIds as string[] | undefined) ?? [];
    for (const tId of unlocksTasks) {
      const t = getTask(tId);
      if (t) blockers.push(`task "${t.name as string ?? tId}" depends on this milestone`);
    }
    const unlocksMs = (ms.unlocksMilestoneIds as string[] | undefined) ?? [];
    for (const mId of unlocksMs) {
      const m = getMilestone(mId);
      if (m) blockers.push(`milestone "${m.name as string ?? mId}" requires this milestone`);
    }
    if (blockers.length > 0) throw new BlockedByReferencesError(blockers);

    // Remove from parent goal/project milestoneIds
    const parentType = ms.parentType as string;
    const parentId = ms.parentId as string;
    if (parentType === 'goal' && parentId) {
      const goal = getGoal(parentId);
      if (goal) {
        upsertEntity('goals', parentId, {
          ...goal,
          milestoneIds: arrayRemove((goal.milestoneIds as string[]) || [], milestoneId),
        });
      }
    } else if (parentType === 'project' && parentId) {
      const proj = getProject(parentId);
      if (proj) {
        upsertEntity('projects', parentId, {
          ...proj,
          milestoneIds: arrayRemove((proj.milestoneIds as string[]) || [], milestoneId),
        });
      }
    }
    // Clear reverse links on required tasks/milestones
    const reqTasks = (ms.requiredTaskIds as string[] | undefined) ?? [];
    for (const tId of reqTasks) {
      const t = getTask(tId);
      if (t) {
        upsertEntity('tasks', tId, {
          ...t,
          unlocksMilestoneIds: arrayRemove((t.unlocksMilestoneIds as string[]) || [], milestoneId),
        });
      }
    }
    const reqMs = (ms.requiredMilestoneIds as string[] | undefined) ?? [];
    for (const mId of reqMs) {
      const m = getMilestone(mId);
      if (m) {
        upsertEntity('milestones', mId, {
          ...m,
          unlocksMilestoneIds: arrayRemove((m.unlocksMilestoneIds as string[]) || [], milestoneId),
        });
      }
    }
    deleteEntity('milestones', milestoneId);
    return { deleted: true };
  });
}

// === Bulk clear (admin) ===
//
// These wipe a whole table (optionally only SG-synced rows) and tidy up
// dangling refs in cousin tables. They intentionally skip the per-entity
// reference checks above because by definition everything is going.

export function bulkClearTickets(opts: { onlySg?: boolean } = {}): number {
  const onlySg = opts.onlySg ?? false;
  return runTransaction(() => {
    const tasks = readAll('tasks');
    const targets = onlySg ? tasks.filter(t => t.data.syncSource === 'sg') : tasks;
    const targetIds = new Set(targets.map(t => t.id));
    if (targetIds.size === 0) return 0;

    // Strip from workers
    for (const w of readAll('workers')) {
      const active = ((w.data.activeTaskIds as string[]) || []).filter(id => !targetIds.has(id));
      const assigned = ((w.data.assignedTaskIds as string[]) || []).filter(id => !targetIds.has(id));
      if (active.length !== ((w.data.activeTaskIds as string[]) || []).length
        || assigned.length !== ((w.data.assignedTaskIds as string[]) || []).length) {
        upsertEntity('workers', w.id, { ...w.data, activeTaskIds: active, assignedTaskIds: assigned });
      }
    }
    // Strip from goals
    for (const g of readAll('goals')) {
      const taskIds = ((g.data.taskIds as string[]) || []).filter(id => !targetIds.has(id));
      if (taskIds.length !== ((g.data.taskIds as string[]) || []).length) {
        upsertEntity('goals', g.id, { ...g.data, taskIds });
      }
    }
    // Strip task-IDs from milestones' requiredTaskIds
    for (const m of readAll('milestones')) {
      const req = ((m.data.requiredTaskIds as string[]) || []).filter(id => !targetIds.has(id));
      const unl = ((m.data.unlocksTaskIds as string[]) || []).filter(id => !targetIds.has(id));
      if (req.length !== ((m.data.requiredTaskIds as string[]) || []).length
        || unl.length !== ((m.data.unlocksTaskIds as string[]) || []).length) {
        upsertEntity('milestones', m.id, { ...m.data, requiredTaskIds: req, unlocksTaskIds: unl });
      }
    }
    // Drop the tasks
    for (const id of targetIds) deleteEntity('tasks', id);
    return targetIds.size;
  });
}

export function bulkClearWorkers(opts: { onlySg?: boolean } = {}): number {
  const onlySg = opts.onlySg ?? false;
  return runTransaction(() => {
    const workers = readAll('workers');
    const targets = onlySg ? workers.filter(w => w.data.syncSource === 'sg') : workers;
    const targetIds = new Set(targets.map(w => w.id));
    if (targetIds.size === 0) return 0;

    // Strip from tasks
    for (const t of readAll('tasks')) {
      const assigned = ((t.data.assignedWorkerIds as string[]) || []).filter(id => !targetIds.has(id));
      if (assigned.length !== ((t.data.assignedWorkerIds as string[]) || []).length) {
        upsertEntity('tasks', t.id, { ...t.data, assignedWorkerIds: assigned });
      }
    }
    // Strip from departments
    for (const d of readAll('departments')) {
      const workerIds = ((d.data.workerIds as string[]) || []).filter(id => !targetIds.has(id));
      if (workerIds.length !== ((d.data.workerIds as string[]) || []).length) {
        upsertEntity('departments', d.id, { ...d.data, workerIds });
      }
    }
    // Drop the workers
    for (const id of targetIds) deleteEntity('workers', id);
    return targetIds.size;
  });
}
