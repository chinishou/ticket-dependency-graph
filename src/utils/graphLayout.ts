import Dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';
import type { Task, Milestone } from '../types';

export interface TaskNodeData {
  type: 'task';
  task: Task;
  workerCount: number;
  etaDays: number;
  priorityScore?: number;
  dimmed?: boolean;
  [key: string]: unknown;
}

export interface MilestoneNodeData {
  type: 'milestone';
  milestone: Milestone;
  dimmed?: boolean;
  [key: string]: unknown;
}

export type GraphNodeData = TaskNodeData | MilestoneNodeData;

const TASK_NODE_WIDTH = 200;
const TASK_NODE_HEIGHT = 110;
const MILESTONE_NODE_WIDTH = 180;
const MILESTONE_NODE_HEIGHT = 70;
const NODE_SEP = 40;

export function buildGraphLayout(
  tasks: Task[],
  milestones: Milestone[],
  getWorkerCount: (taskId: string) => number,
  getEtaDays: (task: Task, workerCount: number) => number,
  focusedNodeIds?: Set<string> | null,
  priorityScores?: Map<string, number>,
): { nodes: Node<GraphNodeData>[]; edges: Edge[] } {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

  g.setGraph({
    rankdir: 'TB',
    ranksep: 80,
    nodesep: NODE_SEP,
    marginx: 40,
    marginy: 40,
  });

  // Add nodes
  for (const task of tasks) {
    g.setNode(task.id, { width: TASK_NODE_WIDTH, height: TASK_NODE_HEIGHT });
  }
  for (const milestone of milestones) {
    g.setNode(milestone.id, { width: MILESTONE_NODE_WIDTH, height: MILESTONE_NODE_HEIGHT });
  }

  const nodeIds = new Set([
    ...tasks.map((t) => t.id),
    ...milestones.map((m) => m.id),
  ]);

  // Build ordered children map (explicit output order)
  const childOrderMap = new Map<string, string[]>();

  // Add edges from tasks
  for (const task of tasks) {
    const orderedChildren: string[] = [];

    for (const childId of task.unlocksTaskIds) {
      if (nodeIds.has(childId)) {
        g.setEdge(task.id, childId);
        orderedChildren.push(childId);
      }
    }
    for (const msId of task.unlocksMilestoneIds) {
      if (nodeIds.has(msId)) {
        g.setEdge(task.id, msId);
        orderedChildren.push(msId);
      }
    }
    if (orderedChildren.length > 0) {
      childOrderMap.set(task.id, orderedChildren);
    }

    // Implicit reverse edges
    for (const depId of task.dependsOnTaskIds) {
      if (nodeIds.has(depId) && !g.hasEdge(depId, task.id)) {
        g.setEdge(depId, task.id);
      }
    }
    for (const msId of task.dependsOnMilestoneIds) {
      if (nodeIds.has(msId) && !g.hasEdge(msId, task.id)) {
        g.setEdge(msId, task.id);
      }
    }
  }

  // Add edges from milestones
  for (const milestone of milestones) {
    const orderedChildren: string[] = [];

    for (const taskId of milestone.unlocksTaskIds) {
      if (nodeIds.has(taskId)) {
        g.setEdge(milestone.id, taskId);
        orderedChildren.push(taskId);
      }
    }
    for (const msId of milestone.unlocksMilestoneIds) {
      if (nodeIds.has(msId)) {
        g.setEdge(milestone.id, msId);
        orderedChildren.push(msId);
      }
    }
    if (orderedChildren.length > 0) {
      childOrderMap.set(milestone.id, orderedChildren);
    }

    // Implicit reverse edges
    for (const taskId of milestone.requiredTaskIds) {
      if (nodeIds.has(taskId) && !g.hasEdge(taskId, milestone.id)) {
        g.setEdge(taskId, milestone.id);
      }
    }
    for (const msId of milestone.requiredMilestoneIds) {
      if (nodeIds.has(msId) && !g.hasEdge(msId, milestone.id)) {
        g.setEdge(msId, milestone.id);
      }
    }
  }

  // Run dagre for rank assignment (y positions)
  Dagre.layout(g);

  // ========== Custom x-positioning: children aligned under parents ==========

  // Group nodes by rank (y position)
  const rankMap = new Map<number, string[]>();
  for (const nodeId of g.nodes()) {
    const y = Math.round(g.node(nodeId).y);
    if (!rankMap.has(y)) rankMap.set(y, []);
    rankMap.get(y)!.push(nodeId);
  }
  const sortedRanks = Array.from(rankMap.entries()).sort((a, b) => a[0] - b[0]);

  const SPACING = TASK_NODE_WIDTH + NODE_SEP;

  // Helper: get node width
  const getNodeWidth = (nodeId: string): number => {
    const node = g.node(nodeId);
    return node?.width || TASK_NODE_WIDTH;
  };

  // Process each rank top-down
  for (let r = 0; r < sortedRanks.length; r++) {
    const nodesInRank = sortedRanks[r][1];

    if (r === 0) {
      // Root rank: keep dagre x positions, just ensure consistent sorting
      nodesInRank.sort((a, b) => g.node(a).x - g.node(b).x);
      continue;
    }

    // For each node, compute ideal x based on parents
    const idealX = new Map<string, number>();
    const rankSet = new Set(nodesInRank);

    for (const nodeId of nodesInRank) {
      const parents = ((g.predecessors(nodeId) as string[]) ?? []).filter(
        (pid) => g.node(pid),
      );

      if (parents.length === 0) {
        // Orphan in this rank, keep dagre position
        idealX.set(nodeId, g.node(nodeId).x);
      } else if (parents.length === 1) {
        // Single parent: position based on sibling order under this parent
        const parentId = parents[0];
        const parentX = g.node(parentId).x;
        const allChildren = childOrderMap.get(parentId) ?? [];
        // Siblings in this rank that are also single-parent
        const siblingsInRank = allChildren.filter((id) => {
          if (!rankSet.has(id)) return false;
          const preds = ((g.predecessors(id) as string[]) ?? []).filter(
            (pid) => g.node(pid),
          );
          return preds.length === 1;
        });

        const idx = siblingsInRank.indexOf(nodeId);
        if (idx === -1 || siblingsInRank.length === 0) {
          idealX.set(nodeId, parentX);
        } else {
          const count = siblingsInRank.length;
          idealX.set(
            nodeId,
            parentX + (idx - (count - 1) / 2) * SPACING,
          );
        }
      } else {
        // Multiple parents: center between them (centroid)
        const parentXs = parents.map((pid) => g.node(pid).x);
        const centroid =
          parentXs.reduce((sum, x) => sum + x, 0) / parentXs.length;
        idealX.set(nodeId, centroid);
      }
    }

    // Sort nodes by ideal x position
    nodesInRank.sort((a, b) => (idealX.get(a) ?? 0) - (idealX.get(b) ?? 0));

    // Apply ideal positions
    for (const nodeId of nodesInRank) {
      g.node(nodeId).x = idealX.get(nodeId)!;
    }

    // Resolve overlaps: ensure minimum spacing between adjacent nodes
    for (let i = 1; i < nodesInRank.length; i++) {
      const prevNode = g.node(nodesInRank[i - 1]);
      const currNode = g.node(nodesInRank[i]);
      const minDist =
        (getNodeWidth(nodesInRank[i - 1]) + getNodeWidth(nodesInRank[i])) / 2 +
        NODE_SEP;
      if (currNode.x - prevNode.x < minDist) {
        currNode.x = prevNode.x + minDist;
      }
    }
  }

  // ========== Build output nodes and edges ==========

  const nodes: Node<GraphNodeData>[] = [];
  const hasFocus = focusedNodeIds && focusedNodeIds.size > 0;

  for (const task of tasks) {
    const pos = g.node(task.id);
    const wc = getWorkerCount(task.id);
    const dimmed = hasFocus ? !focusedNodeIds.has(task.id) : false;
    nodes.push({
      id: task.id,
      type: 'taskNode',
      position: {
        x: pos.x - TASK_NODE_WIDTH / 2,
        y: pos.y - TASK_NODE_HEIGHT / 2,
      },
      measured: { width: TASK_NODE_WIDTH, height: TASK_NODE_HEIGHT },
      data: {
        type: 'task',
        task,
        workerCount: wc,
        etaDays: getEtaDays(task, wc),
        priorityScore: priorityScores?.get(task.id),
        dimmed,
      },
      hidden: false,
    });
  }

  for (const milestone of milestones) {
    const pos = g.node(milestone.id);
    const dimmed = hasFocus ? !focusedNodeIds.has(milestone.id) : false;
    nodes.push({
      id: milestone.id,
      type: 'milestoneNode',
      position: {
        x: pos.x - MILESTONE_NODE_WIDTH / 2,
        y: pos.y - MILESTONE_NODE_HEIGHT / 2,
      },
      measured: { width: MILESTONE_NODE_WIDTH, height: MILESTONE_NODE_HEIGHT },
      data: {
        type: 'milestone',
        milestone,
        dimmed,
      },
      hidden: false,
    });
  }

  const edges: Edge[] = [];
  const edgeEntries = g.edges();
  for (const e of edgeEntries) {
    const edgeDimmed = hasFocus
      ? !focusedNodeIds.has(e.v) || !focusedNodeIds.has(e.w)
      : false;
    edges.push({
      id: `${e.v}-${e.w}`,
      source: e.v,
      target: e.w,
      type: 'smoothstep',
      animated: false,
      style: {
        stroke: edgeDimmed
          ? 'rgba(71, 85, 105, 0.2)'
          : 'var(--color-text-muted)',
        strokeWidth: 2,
      },
    });
  }

  return { nodes, edges };
}
