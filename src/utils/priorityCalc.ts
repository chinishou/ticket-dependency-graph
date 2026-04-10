import type { Task, Milestone, Goal, Department, StrategicPriority, CalibrationWeights } from '../types';

/**
 * Five-dimension weighted priority scoring.
 *
 * ComputedScore = w_proj × PF + w_dept × DF + w_goal × GoalF + w_creator × CF + w_graph × GF
 *
 * Where:
 *   PF   (ProjectFactor)  = (4 − priorityRank) / 3 × 100   (P1→100, P2→66.7, P3→33.3)
 *   DF   (DeptFactor)     = (4 − deptPriority) / 3 × 100   (P1→100, P2→66.7, P3→33.3)
 *   GoalF(GoalFactor)     = (4 − goalPriority) / 3 × 100   (1→100, 2→66.7, 3→33.3)
 *   CF   (CreatorFactor)  = isLead ? 100 : 50
 *   GF   (GraphFactor)    = backward-propagation score (0-100, deps + critical path + status)
 */

export const DEFAULT_WEIGHTS: CalibrationWeights = {
  project: 0.25,
  dept: 0.20,
  goal: 0.15,
  creator: 0.10,
  graph: 0.30,
};

interface PriorityInput {
  tasks: Map<string, Task>;
  milestones: Map<string, Milestone>;
  goals: Map<string, Goal>;
  departments?: Map<string, Department>;
  projectPriorityMap?: Map<string, StrategicPriority>; // goalId → project strategic priority
  creatorIsLeadMap?: Map<string, boolean>;              // taskId → whether creator is lead
  weights?: CalibrationWeights;
}

export interface TaskPriority {
  taskId: string;
  score: number;            // 0-100 composite score (or overridden)
  computedScore: number;    // 0-100 always-computed score (ignores override)
  projectFactor: number;    // 0-100
  deptFactor: number;       // 0-100
  goalFactor: number;       // 0-100
  creatorFactor: number;    // 0-100
  graphFactor: number;      // 0-100
  downstreamCount: number;
  criticalPath: boolean;
  goalPriority: number;     // from parent goal's departmentPriority
}

// === Factor computations ===

export function strategicPriorityToRank(p: StrategicPriority): number {
  switch (p) {
    case 'P1': return 1;
    case 'P2': return 2;
    case 'P3': return 3;
  }
}

export function computeProjectFactor(priority: StrategicPriority): number {
  const rank = strategicPriorityToRank(priority);
  return ((4 - rank) / 3) * 100;
}

export function computeDeptFactor(deptPriority: StrategicPriority): number {
  const rank = strategicPriorityToRank(deptPriority);
  return ((4 - rank) / 3) * 100;
}

export function computeGoalFactor(goalPriority: number): number {
  // goalPriority: 1 (highest) → 100, 2 → 66.7, 3 (lowest) → 33.3
  return ((4 - goalPriority) / 3) * 100;
}

export function computeCreatorFactor(isLead: boolean): number {
  return isLead ? 100 : 50;
}

// === Graph Factor (backward propagation) ===

function computeGraphFactors(
  tasks: Map<string, Task>,
  milestones: Map<string, Milestone>,
): { graphScores: Map<string, number>; downstreamCounts: Map<string, number>; criticalTasks: Set<string> } {
  const taskArr = Array.from(tasks.values()).filter(t => !(t as { archived?: boolean }).archived);

  // 1. Compute downstream count for each task
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

  // 2. Identify critical path tasks
  const criticalTasks = new Set<string>();

  for (const ms of milestones.values()) {
    if (ms.parentType !== 'goal') continue;
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

    if (chainLength.size > 0) {
      const maxLen = Math.max(...chainLength.values());
      for (const [tid, len] of chainLength) {
        if (len >= maxLen - 1) criticalTasks.add(tid);
      }
    }
  }

  // 3. Compute graph score (0-100) for each task
  const maxDownstream = Math.max(1, ...taskArr.map(t => getDownstream(t.id).size));
  const graphScores = new Map<string, number>();
  const downstreamCounts = new Map<string, number>();

  for (const task of taskArr) {
    const downstream = getDownstream(task.id);

    // Downstream component: 0-60 points (expanded from 40 since goal priority is now separate)
    const downstreamScore = (downstream.size / maxDownstream) * 60;

    // Critical path bonus: 0 or 25 points
    const criticalBonus = criticalTasks.has(task.id) ? 25 : 0;

    // Status bonus: in-progress tasks get a small boost
    const statusBonus = task.status === 'in_progress' ? 15 : 0;

    const score = Math.min(100, Math.round(downstreamScore + criticalBonus + statusBonus));
    graphScores.set(task.id, score);
    downstreamCounts.set(task.id, downstream.size);
  }

  return { graphScores, downstreamCounts, criticalTasks };
}

// === Composite score ===

export function computeTaskPriorities({
  tasks,
  milestones,
  goals,
  departments,
  projectPriorityMap,
  creatorIsLeadMap,
  weights,
}: PriorityInput): Map<string, TaskPriority> {
  const w = weights && 'goal' in weights ? weights : DEFAULT_WEIGHTS;
  const { graphScores, downstreamCounts, criticalTasks } = computeGraphFactors(tasks, milestones);

  const result = new Map<string, TaskPriority>();

  for (const task of tasks.values()) {
    if ((task as { archived?: boolean }).archived) continue;

    const goal = goals.get(task.goalId);

    // Project factor: look up project priority for this task's goal
    const projPriority = projectPriorityMap?.get(task.goalId) ?? 'P2';
    const projectFactor = computeProjectFactor(projPriority);

    // Department factor: use department's priority (not goal's departmentPriority)
    const dept = departments?.get(task.contributingDepartmentId);
    const deptPriority = dept?.priority ?? 'P2';
    const deptFactor = computeDeptFactor(deptPriority);

    // Goal factor: from goal's departmentPriority (1-3)
    const goalPri = goal?.departmentPriority ?? 3;
    const goalFactor = computeGoalFactor(goalPri);

    // Creator factor
    const isLead = creatorIsLeadMap?.get(task.id) ?? false;
    const creatorFactor = computeCreatorFactor(isLead);

    // Graph factor
    const graphFactor = graphScores.get(task.id) ?? 0;

    // Weighted composite
    const computedScore = Math.min(100, Math.round(
      w.project * projectFactor +
      w.dept * deptFactor +
      w.goal * goalFactor +
      w.creator * creatorFactor +
      w.graph * graphFactor
    ));

    // Effective score respects override
    const effectiveScore = task.priorityOverride != null
      ? task.priorityOverride.score
      : computedScore;

    result.set(task.id, {
      taskId: task.id,
      score: effectiveScore,
      computedScore,
      projectFactor,
      deptFactor,
      goalFactor,
      creatorFactor,
      graphFactor,
      downstreamCount: downstreamCounts.get(task.id) ?? 0,
      criticalPath: criticalTasks.has(task.id),
      goalPriority: goalPri,
    });
  }

  return result;
}

// === Effective score helper ===

export function getEffectiveScore(task: Task, computedScore: number): number {
  return task.priorityOverride != null ? task.priorityOverride.score : computedScore;
}

// === Labels & colors for computed score (0-100) ===

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

// === Calibration: derive weights from admin answers ===

export interface CalibrationAnswer {
  questionId: number;       // 1-8
  /** For questions 1-7: which side wins ('A' or 'B') */
  winner?: 'A' | 'B';
  /** For question 6: how much graph matters */
  graphImportance?: 'high' | 'medium' | 'low';
}

/**
 * Derive weights from admin calibration answers.
 * Each answer produces a constraint on the weight vector.
 * Returns adjusted weights and any detected conflicts.
 */
export function deriveWeightsFromCalibration(
  answers: CalibrationAnswer[],
): { weights: CalibrationWeights; conflicts: string[] } {
  const conflicts: string[] = [];

  // Start with defaults and adjust based on answers
  let wProj = 0.25;
  let wDept = 0.20;
  let wGoal = 0.15;
  let wCreator = 0.10;
  let wGraph = 0.30;

  for (const answer of answers) {
    switch (answer.questionId) {
      case 1: {
        // Q1: Lead's P3 vs non-lead's P1
        // If A wins (lead P3), creator weight should be higher relative to project
        // If B wins (non-lead P1), project weight dominates creator
        if (answer.winner === 'A') {
          wCreator = Math.max(0.15, wCreator + 0.08);
          wProj = Math.max(0.05, wProj - 0.05);
        } else if (answer.winner === 'B') {
          wProj = Math.min(0.50, wProj + 0.05);
          wCreator = Math.max(0.05, wCreator - 0.03);
        }
        break;
      }
      case 2: {
        // Q2: Dept P1/Proj P2 vs Dept P2/Proj P1
        // If A wins, dept weight should be higher relative to project
        // If B wins, project weight dominates dept
        if (answer.winner === 'A') {
          wDept = Math.min(0.40, wDept + 0.08);
          wProj = Math.max(0.05, wProj - 0.05);
        } else if (answer.winner === 'B') {
          wProj = Math.min(0.50, wProj + 0.05);
          wDept = Math.max(0.05, wDept - 0.05);
        }
        break;
      }
      case 3: {
        // Q3: P3 blocking 12 downstream vs P1 no downstream
        // If A wins, graph weight dominates project
        // If B wins, project priority creates hard floor
        if (answer.winner === 'A') {
          wGraph = Math.min(0.50, wGraph + 0.10);
          wProj = Math.max(0.05, wProj - 0.07);
        } else if (answer.winner === 'B') {
          wProj = Math.min(0.50, wProj + 0.07);
          wGraph = Math.max(0.05, wGraph - 0.07);
        }
        break;
      }
      case 4: {
        // Q4: Lead's Dept P3 vs non-lead's Dept P1
        // If A wins, creator dominates dept
        // If B wins, dept dominates creator
        if (answer.winner === 'A') {
          wCreator = Math.max(0.05, wCreator + 0.06);
          wDept = Math.max(0.05, wDept - 0.04);
        } else if (answer.winner === 'B') {
          wDept = Math.min(0.40, wDept + 0.04);
          wCreator = Math.max(0.05, wCreator - 0.03);
        }
        break;
      }
      case 5: {
        // Q5: Goal 1/Dept P3 vs Goal 3/Dept P1
        // If A wins, goal weight dominates dept
        // If B wins, dept weight dominates goal
        if (answer.winner === 'A') {
          wGoal = Math.min(0.40, wGoal + 0.08);
          wDept = Math.max(0.05, wDept - 0.05);
        } else if (answer.winner === 'B') {
          wDept = Math.min(0.40, wDept + 0.05);
          wGoal = Math.max(0.05, wGoal - 0.05);
        }
        break;
      }
      case 6: {
        // Q6: Goal 1/Proj P3 vs Goal 3/Proj P1
        // If A wins, goal weight dominates project
        // If B wins, project weight dominates goal
        if (answer.winner === 'A') {
          wGoal = Math.min(0.40, wGoal + 0.08);
          wProj = Math.max(0.05, wProj - 0.05);
        } else if (answer.winner === 'B') {
          wProj = Math.min(0.50, wProj + 0.05);
          wGoal = Math.max(0.05, wGoal - 0.05);
        }
        break;
      }
      case 7: {
        // Q7: P2/Dept P2/Goal 2/high-graph vs P1/Dept P3/Goal 3/low-graph
        // Multi-factor tradeoff
        if (answer.winner === 'A') {
          wGraph = Math.min(0.50, wGraph + 0.05);
          wDept = Math.min(0.40, wDept + 0.02);
          wGoal = Math.min(0.40, wGoal + 0.02);
          wProj = Math.max(0.05, wProj - 0.05);
        } else if (answer.winner === 'B') {
          wProj = Math.min(0.50, wProj + 0.06);
          wGraph = Math.max(0.05, wGraph - 0.03);
          wGoal = Math.max(0.05, wGoal - 0.02);
        }
        break;
      }
      case 8: {
        // Q8: How much should graph/critical path matter?
        if (answer.graphImportance === 'high') {
          wGraph = Math.min(0.55, wGraph + 0.12);
        } else if (answer.graphImportance === 'low') {
          wGraph = Math.max(0.10, wGraph - 0.15);
        }
        // 'medium' keeps current graph weight
        break;
      }
    }
  }

  // Normalize weights to sum to 1
  const total = wProj + wDept + wGoal + wCreator + wGraph;
  wProj = wProj / total;
  wDept = wDept / total;
  wGoal = wGoal / total;
  wCreator = wCreator / total;
  wGraph = wGraph / total;

  // Enforce minimum 0.05 per weight
  const MIN_WEIGHT = 0.05;
  const weights = [wProj, wDept, wGoal, wCreator, wGraph];
  let deficit = 0;
  let surplus = 0;
  const aboveMin: number[] = [];

  for (let i = 0; i < weights.length; i++) {
    if (weights[i] < MIN_WEIGHT) {
      deficit += MIN_WEIGHT - weights[i];
      weights[i] = MIN_WEIGHT;
    } else {
      aboveMin.push(i);
      surplus += weights[i] - MIN_WEIGHT;
    }
  }

  // Redistribute deficit from above-min weights proportionally
  if (deficit > 0 && surplus > 0) {
    for (const idx of aboveMin) {
      const share = (weights[idx] - MIN_WEIGHT) / surplus;
      weights[idx] -= deficit * share;
    }
  }

  // Detect contradictions (simple heuristic: if any two answers directly conflict)
  if (answers.some(a => a.questionId === 1 && a.winner === 'A') &&
      answers.some(a => a.questionId === 4 && a.winner === 'B')) {
    if (wCreator <= MIN_WEIGHT + 0.01) {
      conflicts.push('Questions 1 and 4 pull creator weight in opposite directions');
    }
  }
  // Q5 says goal > dept, Q6 says goal > project — but Q2 says dept > project
  if (answers.some(a => a.questionId === 5 && a.winner === 'A') &&
      answers.some(a => a.questionId === 6 && a.winner === 'A')) {
    if (wGoal >= 0.35) {
      conflicts.push('Questions 5 and 6 both boost goal weight very high — consider if goal should dominate');
    }
  }
  // Q5 says dept > goal, Q6 says project > goal — goal gets squeezed
  if (answers.some(a => a.questionId === 5 && a.winner === 'B') &&
      answers.some(a => a.questionId === 6 && a.winner === 'B')) {
    if (wGoal <= MIN_WEIGHT + 0.01) {
      conflicts.push('Questions 5 and 6 both reduce goal weight — goal priority may have no effect');
    }
  }

  return {
    weights: {
      project: Math.round(weights[0] * 1000) / 1000,
      dept: Math.round(weights[1] * 1000) / 1000,
      goal: Math.round(weights[2] * 1000) / 1000,
      creator: Math.round(weights[3] * 1000) / 1000,
      graph: Math.round(weights[4] * 1000) / 1000,
    },
    conflicts,
  };
}
