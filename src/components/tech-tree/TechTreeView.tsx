import { useMemo, useCallback, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useStore } from '../../store/useStore';
import { buildGraphLayout, type GraphNodeData } from '../../utils/graphLayout';
import { getEtaDays } from '../../types';
import { TaskNode } from './TaskNode';
import { MilestoneNode } from './MilestoneNode';
import { TaskDetailPanel } from '../shared/TaskDetailPanel';
import { UnplacedTasksPanel } from './UnplacedTasksPanel';

const nodeTypes = {
  taskNode: TaskNode,
  milestoneNode: MilestoneNode,
};

interface TechTreeViewProps {
  goalId: string;
}

export function TechTreeView({ goalId }: TechTreeViewProps) {
  const getTasksForGoal = useStore((s) => s.getTasksForGoal);
  const getMilestonesForGoal = useStore((s) => s.getMilestonesForGoal);
  const tasksMap = useStore((s) => s.tasks);
  const milestonesMap = useStore((s) => s.milestones);
  const workersMap = useStore((s) => s.workers);
  const setSelectedTask = useStore((s) => s.setSelectedTask);
  const setSelectedMilestone = useStore((s) => s.setSelectedMilestone);
  const selectedTaskId = useStore((s) => s.selectedTaskId);
  const selectedMilestoneId = useStore((s) => s.selectedMilestoneId);
  const focusedNodeId = useStore((s) => s.focusedNodeId);
  const getRelatedNodeIds = useStore((s) => s.getRelatedNodeIds);
  const setFocusedNode = useStore((s) => s.setFocusedNode);
  const updateTask = useStore((s) => s.updateTask);
  const updateMilestone = useStore((s) => s.updateMilestone);

  const [showUnplaced, setShowUnplaced] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editNodes, setEditNodes] = useState<Node<GraphNodeData>[]>([]);
  const [editEdges, setEditEdges] = useState<Edge[]>([]);

  const goalTasks = useMemo(() => getTasksForGoal(goalId), [getTasksForGoal, goalId, tasksMap]);
  const goalMilestones = useMemo(() => getMilestonesForGoal(goalId), [getMilestonesForGoal, goalId, milestonesMap]);

  const getWorkerCount = useCallback(
    (taskId: string) => {
      const task = goalTasks.find((t) => t.id === taskId);
      if (!task) return 0;
      return task.assignedWorkerIds.filter((id) => workersMap.has(id)).length;
    },
    [goalTasks, workersMap],
  );

  const focusedNodeIds = useMemo(() => {
    if (!focusedNodeId) return null;
    return getRelatedNodeIds(focusedNodeId);
  }, [focusedNodeId, getRelatedNodeIds]);

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(() => {
    return buildGraphLayout(goalTasks, goalMilestones, getWorkerCount, getEtaDays, focusedNodeIds);
  }, [goalTasks, goalMilestones, getWorkerCount, focusedNodeIds]);

  const displayNodes = useMemo(
    () => layoutNodes.map((n) => ({
      ...n,
      selected: n.id === selectedTaskId || n.id === selectedMilestoneId,
    })),
    [layoutNodes, selectedTaskId, selectedMilestoneId],
  );

  // Sync edit state when store changes during edit mode (panel edits)
  useEffect(() => {
    if (editMode) {
      setEditEdges(layoutEdges.map((e) => ({ ...e, selectable: true, interactionWidth: 20 })));
      setEditNodes((prev) => {
        const posMap = new Map(prev.map((n) => [n.id, n.position]));
        return displayNodes.map((n) => ({
          ...n,
          position: posMap.get(n.id) ?? n.position,
        }));
      });
    }
  }, [layoutEdges, displayNodes]); // eslint-disable-line -- intentionally exclude editMode

  // Exit edit mode on goal change
  useEffect(() => {
    setEditMode(false);
  }, [goalId]);

  const toggleEditMode = useCallback(() => {
    if (!editMode) {
      setEditNodes(displayNodes.map((n) => ({ ...n })));
      setEditEdges(layoutEdges.map((e) => ({ ...e, selectable: true, interactionWidth: 20 })));
      setEditMode(true);
    } else {
      setEditMode(false);
    }
  }, [editMode, displayNodes, layoutEdges]);

  const applyAutoLayout = useCallback(() => {
    setEditNodes(displayNodes.map((n) => ({ ...n })));
    setEditEdges(layoutEdges.map((e) => ({ ...e, selectable: true, interactionWidth: 20 })));
  }, [displayNodes, layoutEdges]);

  const onNodesChange = useCallback((changes: NodeChange<Node<GraphNodeData>>[]) => {
    // Filter out dimension changes to prevent infinite re-render loop
    // (ReactFlow measures → calls handler → state update → re-render → re-measure → ...)
    const filtered = changes.filter((c) => c.type !== 'dimensions');
    if (filtered.length > 0) {
      setEditNodes((nds) => applyNodeChanges(filtered, nds));
    }
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    setEditEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const addConnection = useCallback((sourceId: string, targetId: string) => {
    const srcTask = tasksMap.get(sourceId);
    const tgtTask = tasksMap.get(targetId);
    const srcMs = milestonesMap.get(sourceId);
    const tgtMs = milestonesMap.get(targetId);
    if (srcTask && tgtTask) updateTask(sourceId, { unlocksTaskIds: [...srcTask.unlocksTaskIds, targetId] });
    else if (srcTask && tgtMs) updateMilestone(targetId, { requiredTaskIds: [...tgtMs.requiredTaskIds, sourceId] });
    else if (srcMs && tgtTask) updateMilestone(sourceId, { unlocksTaskIds: [...srcMs.unlocksTaskIds, targetId] });
    else if (srcMs && tgtMs) updateMilestone(targetId, { requiredMilestoneIds: [...tgtMs.requiredMilestoneIds, sourceId] });
  }, [tasksMap, milestonesMap, updateTask, updateMilestone]);

  const removeConnection = useCallback((sourceId: string, targetId: string) => {
    const srcTask = tasksMap.get(sourceId);
    const tgtTask = tasksMap.get(targetId);
    const srcMs = milestonesMap.get(sourceId);
    const tgtMs = milestonesMap.get(targetId);
    if (srcTask && tgtTask) updateTask(sourceId, { unlocksTaskIds: srcTask.unlocksTaskIds.filter((id) => id !== targetId) });
    else if (srcTask && tgtMs) updateMilestone(targetId, { requiredTaskIds: tgtMs.requiredTaskIds.filter((id) => id !== sourceId) });
    else if (srcMs && tgtTask) updateMilestone(sourceId, { unlocksTaskIds: srcMs.unlocksTaskIds.filter((id) => id !== targetId) });
    else if (srcMs && tgtMs) updateMilestone(targetId, { requiredMilestoneIds: tgtMs.requiredMilestoneIds.filter((id) => id !== sourceId) });
  }, [tasksMap, milestonesMap, updateTask, updateMilestone]);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    addConnection(connection.source, connection.target);
  }, [addConnection]);

  const onEdgesDelete = useCallback((deletedEdges: Edge[]) => {
    for (const edge of deletedEdges) removeConnection(edge.source, edge.target);
  }, [removeConnection]);

  const isValidConnection = useCallback((connection: Edge | Connection) => {
    if (connection.source === connection.target) return false;
    return !editEdges.find((e) => e.source === connection.source && e.target === connection.target);
  }, [editEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string; type?: string }) => {
      if (node.type === 'milestoneNode') setSelectedMilestone(node.id);
      else setSelectedTask(node.id);
    },
    [setSelectedTask, setSelectedMilestone],
  );

  const onPaneClick = useCallback(() => {
    setSelectedTask(null);
    setSelectedMilestone(null);
    setFocusedNode(null);
  }, [setSelectedTask, setSelectedMilestone, setFocusedNode]);

  // Switch nodes/edges based on mode. Use key to remount ReactFlow when toggling.
  const activeNodes = editMode ? editNodes : displayNodes;
  const activeEdges = editMode ? editEdges : layoutEdges;
  const hasSelection = selectedTaskId || selectedMilestoneId;

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative' }}
      className={editMode ? 'edit-mode' : ''}
    >
      <ReactFlow
        key={`${goalId}-${editMode ? 'e' : 'v'}`}
        nodes={activeNodes}
        edges={activeEdges}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodesChange={editMode ? onNodesChange : undefined}
        onEdgesChange={editMode ? onEdgesChange : undefined}
        onConnect={editMode ? onConnect : undefined}
        onEdgesDelete={editMode ? onEdgesDelete : undefined}
        isValidConnection={editMode ? isValidConnection : undefined}
        nodeTypes={nodeTypes}
        nodesDraggable={editMode}
        nodesConnectable={editMode}
        edgesFocusable={editMode}
        elementsSelectable={editMode}
        snapToGrid={editMode}
        snapGrid={[20, 20]}
        deleteKeyCode={editMode ? 'Delete' : null}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ stroke: 'var(--color-accent)', strokeWidth: 2 }}
      >
        <Background
          variant={editMode ? BackgroundVariant.Lines : BackgroundVariant.Dots}
          gap={20}
          size={editMode ? 0.5 : 1}
          color="var(--color-bg-tertiary)"
        />
        <Controls style={{ bottom: 20, left: 20 }} showInteractive={false} />
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
          nodeColor={(node) => {
            if (node.type === 'milestoneNode') return '#f59e0b';
            const data = node.data as { task?: { status: string } };
            if (data?.task) {
              switch (data.task.status) {
                case 'completed': return '#22c55e';
                case 'in_progress': return '#38bdf8';
                case 'available': return '#e2e8f0';
                default: return '#475569';
              }
            }
            return '#475569';
          }}
          style={{
            bottom: 20,
            right: hasSelection ? 360 : 20,
            backgroundColor: '#1e293b',
            border: '1px solid #475569',
            borderRadius: 8,
          }}
          maskColor="rgba(15, 23, 42, 0.7)"
        />
      </ReactFlow>

      {/* Toolbar */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6, zIndex: 5 }}>
        <button
          onClick={() => setShowUnplaced(!showUnplaced)}
          style={{
            ...toolbarButtonStyle,
            backgroundColor: showUnplaced ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
            color: showUnplaced ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
          }}
        >
          📋 Tickets
        </button>
        <button
          onClick={toggleEditMode}
          style={{
            ...toolbarButtonStyle,
            backgroundColor: editMode ? 'var(--color-accent)' : 'var(--color-bg-secondary)',
            color: editMode ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
          }}
        >
          {editMode ? '🔓 Editing' : '🔒 Locked'}
        </button>
        {editMode && (
          <button onClick={applyAutoLayout} style={toolbarButtonStyle}>⟳ Auto Layout</button>
        )}
      </div>

      {editMode && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          padding: '6px 16px', borderRadius: 6,
          backgroundColor: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)',
          color: 'var(--color-accent)', fontSize: 11, zIndex: 5, pointerEvents: 'none',
        }}>
          Drag nodes to reposition · Drag from handles to connect · Select edge + Delete to remove
        </div>
      )}

      {showUnplaced && <UnplacedTasksPanel goalId={goalId} onClose={() => setShowUnplaced(false)} />}
      {hasSelection && <TaskDetailPanel goalId={goalId} />}
    </div>
  );
}

const toolbarButtonStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 6,
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-secondary)',
  color: 'var(--color-text-primary)',
  fontSize: 12, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 6,
};
