import type { Task, Milestone, Goal } from '../types';

/**
 * Backward-propagation priority scoring.
 * Tasks closer to high-priority goals score higher.
 * Tasks on the critical path (blocking the most downstream work) score higher.
 */

interface PriorityInput {
  tasks: Map<string, Task>;
  milestones: Map<string, Milestone>;
  goals: Map<string, Goal>;
}

export interface TaskPriority {
  taskId: string;
  score: number;          // 0-100 composite score
  downstreamCount: number; // how many tasks this transitively unlocks
  criticalPath: boolean;   // on longest dependency chain to a goal milestone
  goalPriority: number;    // from parent goal's departmentPriority (lower = higher priority)
}

export function computeTaskPriorities({ tasks, milestones, goals }: PriorityInput): Map<string, TaskPriority> {
  const result = new Map<string, TaskPriority>();
  const taskArr = Array.from(tasks.values());

  // 1. Compute downstream count for each task (how many tasks it transitively unlocks)
  const downstreamCache = new Map<string, Set<string>>();

  function getDownstream(taskId: string): Set<string> {
    if (downstreamCache.has(taskId)) return downstreamCache.get(taskId)!;
    const visited = new Set<string>();
    const stack = [taskId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      const task = tasks.get(current);
      if (!task) continue;
      for (const childId of task.unlocksTaskIds) {
        if (!visited.has(childId)) {
          visited.add(childId);
          stack.push(childId);
        }
      }
      // Also count tasks unlocked via milestones
      for (const msId of task.unlocksMilestoneIds) {
        const ms = milestones.get(msId);
        if (!ms) continue;
        for (const childId of ms.unlocksTaskIds) {
          if (!visited.has(childId)) {
            visited.add(childId);
            stack.push(childId);
          }
        }
      }
    }
    downstreamCache.set(taskId, visited);
    return visited;
  }

  // 2. Identify critical path tasks — tasks on the longest chain to any goal milestone
  const criticalTasks = new Set<string>();

  // For each goal milestone, trace back to find the longest dependency chain
  for (const ms of milestones.values()) {
    if (ms.parentType !== 'goal') continue;
    // Walk backwards from milestone's required tasks
    const chainLength = new Map<string, number>();

    function traceBack(taskId: string): number {
      if (chainLength.has(taskId)) return chainLength.get(taskId)!;
      const task = tasks.get(taskId);
      if (!task) { chainLength.set(taskId, 0); return 0; }

      let maxDepth = 0;
      for (const depId of task.dependsOnTaskIds) {
        maxDepth = Math.max(maxDepth, traceBack(depId) + 1);
      }
      chainLength.set(taskId, maxDepth);
      return maxDepth;
    }

    for (const reqId of ms.requiredTaskIds) {
      traceBack(reqId);
    }

    // The longest chain forms the critical path
    if (chainLength.size > 0) {
      const maxLen = Math.max(...chainLength.values());
      for (const [tid, len] of chainLength) {
        if (len >= maxLen - 1) criticalTasks.add(tid); // top of chain
      }
    }
  }

  // 3. Compute composite score
  const maxDownstream = Math.max(1, ...taskArr.map(t => getDownstream(t.id).size));

  for (const task of taskArr) {
    const downstream = getDownstream(task.id);
    const goal = goals.get(task.goalId);
    const goalPri = goal?.departmentPriority ?? 99;

    // Downstream component: 0-40 points
    const downstreamScore = (downstream.size / maxDownstream) * 40;

    // Goal priority component: 0-30 points (P1 goal = 30, P4 = 0)
    const goalScore = Math.max(0, 30 - (goalPri - 1) * 10);

    // Critical path bonus: 0 or 20 points
    const criticalBonus = criticalTasks.has(task.id) ? 20 : 0;

    // Status bonus: in-progress tasks get a small boost (already committed)
    const statusBonus = task.status === 'in_progress' ? 10 : 0;

    const score = Math.min(100, Math.round(downstreamScore + goalScore + criticalBonus + statusBonus));

    result.set(task.id, {
      taskId: task.id,
      score,
      downstreamCount: downstream.size,
      criticalPath: criticalTasks.has(task.id),
      goalPriority: goalPri,
    });
  }

  return result;
}

export function getPriorityLabel(score: number): string {
  if (score >= 80) return 'Critical';
  if (score >= 60) return 'High';
  if (score >= 40) return 'Medium';
  if (score >= 20) return 'Low';
  return 'Minimal';
}

export function getPriorityColor(score: number): string {
  if (score >= 80) return '#ef4444';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#3b82f6';
  if (score >= 20) return '#6b7280';
  return '#374151';
}
