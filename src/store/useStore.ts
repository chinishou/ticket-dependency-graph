import { create } from 'zustand';
import type { Company, Department, Project, Goal, Task, Milestone, Worker } from '../types';
import {
  company, departments, projects, goals, tasks, milestones, workers,
} from '../data/mockData';

interface AppState {
  company: Company;
  departments: Map<string, Department>;
  projects: Map<string, Project>;
  goals: Map<string, Goal>;
  tasks: Map<string, Task>;
  milestones: Map<string, Milestone>;
  workers: Map<string, Worker>;

  selectedTaskId: string | null;
  selectedMilestoneId: string | null;
  focusedNodeId: string | null;
  setSelectedTask: (id: string | null) => void;
  setSelectedMilestone: (id: string | null) => void;
  setFocusedNode: (id: string | null) => void;

  // Mutations
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  updateMilestone: (milestoneId: string, updates: Partial<Milestone>) => void;
  updateGoal: (goalId: string, updates: Partial<Goal>) => void;
  addTaskToGoal: (goalId: string, task: Task) => void;
  removeTaskFromGoal: (goalId: string, taskId: string) => void;

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

export const useStore = create<AppState>((set, get) => ({
  company,
  departments: toMap(departments),
  projects: toMap(projects),
  goals: toMap(goals),
  tasks: toMap(tasks),
  milestones: toMap(milestones),
  workers: toMap(workers),

  selectedTaskId: null,
  selectedMilestoneId: null,
  focusedNodeId: null,
  setSelectedTask: (id) => set({ selectedTaskId: id, selectedMilestoneId: null }),
  setSelectedMilestone: (id) => set({ selectedMilestoneId: id, selectedTaskId: null }),
  setFocusedNode: (id) => set({ focusedNodeId: id }),

  updateTask: (taskId, updates) => {
    const newTasks = new Map(get().tasks);
    const existing = newTasks.get(taskId);
    if (!existing) return;

    const updatedTask = { ...existing, ...updates };
    newTasks.set(taskId, updatedTask);

    // Sync reverse links: if dependsOnTaskIds changed, update the parent tasks' unlocksTaskIds
    if (updates.dependsOnTaskIds) {
      // Remove this task from old parents' unlocksTaskIds
      for (const oldDepId of existing.dependsOnTaskIds) {
        const parent = newTasks.get(oldDepId);
        if (parent) {
          newTasks.set(oldDepId, {
            ...parent,
            unlocksTaskIds: parent.unlocksTaskIds.filter((id) => id !== taskId),
          });
        }
      }
      // Add this task to new parents' unlocksTaskIds
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
      // Remove this task from old children's dependsOnTaskIds
      for (const oldChildId of existing.unlocksTaskIds) {
        const child = newTasks.get(oldChildId);
        if (child) {
          newTasks.set(oldChildId, {
            ...child,
            dependsOnTaskIds: child.dependsOnTaskIds.filter((id) => id !== taskId),
          });
        }
      }
      // Add this task to new children's dependsOnTaskIds
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
  },

  updateMilestone: (milestoneId, updates) => {
    const newMilestones = new Map(get().milestones);
    const newTasks = new Map(get().tasks);
    const existing = newMilestones.get(milestoneId);
    if (!existing) return;

    const updated = { ...existing, ...updates };
    newMilestones.set(milestoneId, updated);

    // Sync reverse links: requiredTaskIds changed → update tasks' unlocksMilestoneIds
    if (updates.requiredTaskIds) {
      // Remove milestone from old tasks' unlocksMilestoneIds
      for (const oldTaskId of existing.requiredTaskIds) {
        const task = newTasks.get(oldTaskId);
        if (task) {
          newTasks.set(oldTaskId, {
            ...task,
            unlocksMilestoneIds: task.unlocksMilestoneIds.filter((id) => id !== milestoneId),
          });
        }
      }
      // Add milestone to new tasks' unlocksMilestoneIds
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

    // Sync reverse links: requiredMilestoneIds changed → update milestones' unlocksMilestoneIds
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

    // Sync reverse links: unlocksTaskIds changed → update tasks' dependsOnMilestoneIds
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
  },

  updateGoal: (goalId, updates) => {
    const newGoals = new Map(get().goals);
    const existing = newGoals.get(goalId);
    if (!existing) return;

    const updated = { ...existing, ...updates };
    newGoals.set(goalId, updated);

    // Sync reverse links: unlocksGoalIds changed → update targets' dependsOnGoalIds
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

    // Sync reverse links: dependsOnGoalIds changed → update sources' unlocksGoalIds
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
  },

  removeTaskFromGoal: (goalId, taskId) => {
    const newTasks = new Map(get().tasks);
    const newGoals = new Map(get().goals);

    // Remove from goal's taskIds
    const goal = newGoals.get(goalId);
    if (goal) {
      newGoals.set(goalId, { ...goal, taskIds: goal.taskIds.filter((id) => id !== taskId) });
    }

    // Remove all dependency references to this task
    const task = newTasks.get(taskId);
    if (task) {
      // Clear from parents
      for (const depId of task.dependsOnTaskIds) {
        const parent = newTasks.get(depId);
        if (parent) {
          newTasks.set(depId, {
            ...parent,
            unlocksTaskIds: parent.unlocksTaskIds.filter((id) => id !== taskId),
          });
        }
      }
      // Clear from children
      for (const childId of task.unlocksTaskIds) {
        const child = newTasks.get(childId);
        if (child) {
          newTasks.set(childId, {
            ...child,
            dependsOnTaskIds: child.dependsOnTaskIds.filter((id) => id !== taskId),
          });
        }
      }
    }

    // Reset the task's goal and deps (it becomes unplaced)
    if (task) {
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
        if (direction === 'up' || direction === 'down') {
          // Upstream
          if (direction === 'up') {
            for (const depId of task.dependsOnTaskIds) {
              if (!related.has(depId)) { related.add(depId); traverse(depId, 'up'); }
            }
            for (const msId of task.dependsOnMilestoneIds) {
              if (!related.has(msId)) { related.add(msId); traverse(msId, 'up'); }
            }
          }
          // Downstream
          if (direction === 'down') {
            for (const childId of task.unlocksTaskIds) {
              if (!related.has(childId)) { related.add(childId); traverse(childId, 'down'); }
            }
            for (const msId of task.unlocksMilestoneIds) {
              if (!related.has(msId)) { related.add(msId); traverse(msId, 'down'); }
            }
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
