import { getEntity, upsertEntity, runTransaction } from './db';

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

function getDepartment(id: string): Record<string, unknown> | null {
  return getEntity('departments', id) as Record<string, unknown> | null;
}
function getProject(id: string): Record<string, unknown> | null {
  return getEntity('projects', id) as Record<string, unknown> | null;
}

export function addGoal(goal: Record<string, unknown>) {
  return runTransaction(() => {
    const goalId = goal.id as string;
    upsertEntity('goals', goalId, goal);

    // Add goal to parent's goalIds
    const parentType = goal.parentType as string;
    const parentId = goal.parentId as string;
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

    return goal;
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
      // Remove from parent tasks' unlocksTaskIds
      for (const depId of task.dependsOnTaskIds as string[]) {
        const parent = getTask(depId);
        if (parent) {
          upsertEntity('tasks', depId, {
            ...parent,
            unlocksTaskIds: arrayRemove(parent.unlocksTaskIds as string[], taskId),
          });
        }
      }
      // Remove from child tasks' dependsOnTaskIds
      for (const childId of task.unlocksTaskIds as string[]) {
        const child = getTask(childId);
        if (child) {
          upsertEntity('tasks', childId, {
            ...child,
            dependsOnTaskIds: arrayRemove(child.dependsOnTaskIds as string[], taskId),
          });
        }
      }
      // Reset the task
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
