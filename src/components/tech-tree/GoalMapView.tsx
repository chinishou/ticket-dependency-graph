import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
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
import Dagre from '@dagrejs/dagre';
import { useStore } from '../../store/useStore';
import { usePermission } from '../../hooks/usePermission';
import type { Goal } from '../../types';
import { GoalNode, type GoalNodeData } from './GoalNode';
import { GlobalUnplacedPanel } from './GlobalUnplacedPanel';

const nodeTypes = { goalNode: GoalNode };

const GOAL_NODE_WIDTH = 220;
const GOAL_NODE_HEIGHT = 120;

interface GoalMapViewProps {
  parentType: 'department' | 'project';
  parentId: string;
  onSelectGoal: (goalId: string) => void;
}

function buildGoalGraphLayout(
  goals: Goal[],
  tasksMap: Map<string, { status: string; archived?: boolean }>,
  departmentsMap: Map<string, { id: string; name: string }>,
  projectsMap: Map<string, { id: string; name: string }>,
): { nodes: Node<GoalNodeData>[]; edges: Edge[] } {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 40, marginx: 40, marginy: 40 });

  const goalIds = new Set(goals.map((gl) => gl.id));
  for (const goal of goals) {
    g.setNode(goal.id, { width: GOAL_NODE_WIDTH, height: GOAL_NODE_HEIGHT });
  }
  for (const goal of goals) {
    for (const depId of goal.dependsOnGoalIds) {
      if (goalIds.has(depId)) g.setEdge(depId, goal.id);
    }
    for (const childId of goal.unlocksGoalIds) {
      if (goalIds.has(childId) && !g.hasEdge(goal.id, childId)) g.setEdge(goal.id, childId);
    }
  }
  Dagre.layout(g);

  const nodes: Node<GoalNodeData>[] = goals.map((goal) => {
    const pos = g.node(goal.id);
    const totalTasks = goal.taskIds.length;
    const completedTasks = goal.taskIds.filter((tid) => {
      const t = tasksMap.get(tid);
      return t && t.status === 'completed';
    }).length;
    return {
      id: goal.id,
      type: 'goalNode' as const,
      position: { x: pos.x - GOAL_NODE_WIDTH / 2, y: pos.y - GOAL_NODE_HEIGHT / 2 },
      measured: { width: GOAL_NODE_WIDTH, height: GOAL_NODE_HEIGHT },
      data: {
        type: 'goal' as const,
        goal,
        completedTasks,
        totalTasks,
        tasksMap,
        // Only show cross-ref badge when it points to a DIFFERENT entity than the primary parent
        // (addGoal backfills departmentId/projectId = parentId for primary-parented goals,
        //  so without this guard every goal in a dept view shows a redundant dept badge)
        projectName: goal.projectId && goal.projectId !== goal.parentId
          ? (projectsMap.get(goal.projectId)?.name ?? goal.projectId)
          : undefined,
        departmentName: goal.departmentId && goal.departmentId !== goal.parentId
          ? (departmentsMap.get(goal.departmentId)?.name ?? goal.departmentId)
          : undefined,
      },
    };
  });

  const edges: Edge[] = g.edges().map((e) => ({
    id: `${e.v}-${e.w}`,
    source: e.v,
    target: e.w,
    type: 'smoothstep',
    animated: false,
    style: { stroke: 'var(--color-text-muted)', strokeWidth: 2 },
  }));

  return { nodes, edges };
}

export function GoalMapView({ parentType, parentId, onSelectGoal }: GoalMapViewProps) {
  const getGoalsForDepartment = useStore((s) => s.getGoalsForDepartment);
  const getGoalsForProject = useStore((s) => s.getGoalsForProject);
  const goalsMap = useStore((s) => s.goals);
  const tasksMap = useStore((s) => s.tasks);
  const departmentsMap = useStore((s) => s.departments);
  const projectsMap = useStore((s) => s.projects);
  const updateGoal = useStore((s) => s.updateGoal);
  const addGoal = useStore((s) => s.addGoal);
  const removeGoal = useStore((s) => s.removeGoal);
  const userName = useStore((s) => s.userName);
  const heartbeat = useStore((s) => s.heartbeatPresence);
  const getOtherViewers = useStore((s) => s.getOtherViewers);
  const { canEditTasks } = usePermission();

  const [editMode, setEditMode] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);

  const [newGoalSecondaryParent, setNewGoalSecondaryParent] = useState<string>('');

  // Auto-register presence
  const presenceScope = `goal-map:${parentId}`;
  useEffect(() => {
    if (!userName) return;
    const currentUser = userName;
    heartbeat(presenceScope);
    const interval = setInterval(() => heartbeat(presenceScope), 60 * 1000);
    return () => {
      clearInterval(interval);
      fetch('/api/presence/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: presenceScope, userName: currentUser }),
      }).catch(() => {});
    };
  }, [userName, presenceScope, heartbeat]);

  const otherViewers = getOtherViewers(presenceScope);

  // Create goal form
  const [showCreateGoal, setShowCreateGoal] = useState(false);
  const [newGoalName, setNewGoalName] = useState('');
  const createGoalInputRef = useRef<HTMLInputElement>(null);
  const [showGlobalUnplaced, setShowGlobalUnplaced] = useState(false);

  // Compute unplacedCount directly from tasksMap so it stays reactive to task changes.
  // (getAllUnplacedTasks has a stable reference and cannot serve as a useMemo dep.)
  const unplacedCount = useMemo(
    () => Array.from(tasksMap.values()).filter((t) => !t.archived && (!t.goalId || t.goalId === '')).length,
    [tasksMap],
  );

  useEffect(() => {
    if (showCreateGoal) createGoalInputRef.current?.focus();
  }, [showCreateGoal]);

  const handleCreateGoal = useCallback(() => {
    if (!newGoalName.trim()) return;
    const secondaryParent = newGoalSecondaryParent || undefined;
    const goal: Goal = {
      id: `goal-${Date.now()}`,
      name: newGoalName.trim(),
      description: '',
      owner: userName || '',
      parentType,
      parentId,
      departmentPriority: 99,
      taskIds: [],
      milestoneIds: [],
      dependsOnGoalIds: [],
      unlocksGoalIds: [],
      ...(parentType === 'department'
        ? { departmentId: parentId, projectId: secondaryParent }
        : { projectId: parentId, departmentId: secondaryParent }),
    };
    addGoal(goal);
    setNewGoalName('');
    setNewGoalSecondaryParent('');
    setShowCreateGoal(false);
  }, [newGoalName, userName, parentType, parentId, newGoalSecondaryParent, addGoal]);

  const parentGoals = useMemo(() => {
    return parentType === 'department'
      ? getGoalsForDepartment(parentId)
      : getGoalsForProject(parentId);
  }, [parentType, parentId, getGoalsForDepartment, getGoalsForProject, goalsMap]);

  const { nodes: layoutNodes, edges: layoutEdges } = useMemo(() => {
    return buildGoalGraphLayout(
      parentGoals,
      tasksMap as Map<string, { status: string; archived?: boolean }>,
      departmentsMap as Map<string, { id: string; name: string }>,
      projectsMap as Map<string, { id: string; name: string }>,
    );
  }, [parentGoals, tasksMap, departmentsMap, projectsMap]);

  const [editNodes, setEditNodes] = useState<Node<GoalNodeData>[]>([]);
  const [editEdges, setEditEdges] = useState<Edge[]>([]);

  // Sync edit state when store changes during edit mode
  useEffect(() => {
    if (editMode) {
      setEditEdges(layoutEdges.map((e) => ({ ...e, selectable: true, interactionWidth: 20 })));
      setEditNodes((prev) => {
        const posMap = new Map(prev.map((n) => [n.id, n.position]));
        return layoutNodes.map((n) => ({
          ...n,
          position: posMap.get(n.id) ?? n.position,
        }));
      });
    }
  }, [layoutNodes, layoutEdges]); // eslint-disable-line

  useEffect(() => { setEditMode(false); }, [parentId]);

  const toggleEditMode = useCallback(() => {
    if (!editMode) {
      setEditNodes(layoutNodes.map((n) => ({ ...n })));
      setEditEdges(layoutEdges.map((e) => ({ ...e, selectable: true, interactionWidth: 20 })));
      setEditMode(true);
    } else {
      setEditMode(false);
    }
  }, [editMode, layoutNodes, layoutEdges]);

  const applyAutoLayout = useCallback(() => {
    setEditNodes(layoutNodes.map((n) => ({ ...n })));
    setEditEdges(layoutEdges.map((e) => ({ ...e, selectable: true, interactionWidth: 20 })));
  }, [layoutNodes, layoutEdges]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const filtered = changes.filter((c) => c.type !== 'dimensions');
    if (filtered.length > 0) {
      setEditNodes((nds) => applyNodeChanges(filtered, nds) as Node<GoalNodeData>[]);
    }
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<Edge>[]) => {
    setEditEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const src = goalsMap.get(connection.source);
    if (src) {
      updateGoal(connection.source, { unlocksGoalIds: [...src.unlocksGoalIds, connection.target] });
    }
  }, [goalsMap, updateGoal]);

  const onEdgesDelete = useCallback((deletedEdges: Edge[]) => {
    for (const edge of deletedEdges) {
      const src = goalsMap.get(edge.source);
      if (src) {
        updateGoal(edge.source, { unlocksGoalIds: src.unlocksGoalIds.filter((id) => id !== edge.target) });
      }
    }
  }, [goalsMap, updateGoal]);

  const onNodesDelete = useCallback((deletedNodes: Node<GoalNodeData>[]) => {
    for (const node of deletedNodes) {
      removeGoal(node.id);
    }
  }, [removeGoal]);

  const isValidConnection = useCallback((connection: Edge | Connection) => {
    if (connection.source === connection.target) return false;
    return !editEdges.find((e) => e.source === connection.source && e.target === connection.target);
  }, [editEdges]);

  // onNodeDoubleClick may not fire when elementsSelectable={false}, so detect
  // double-click manually inside onNodeClick using a 300ms window.
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { id: string }) => {
      if (editMode) return;
      const now = Date.now();
      const last = lastClickRef.current;
      if (last && last.id === node.id && now - last.time < 300) {
        // Double-click detected — open tech tree
        lastClickRef.current = null;
        setSelectedGoalId(null);
        onSelectGoal(node.id);
      } else {
        // Single-click — toggle selection highlight
        lastClickRef.current = { id: node.id, time: now };
        setSelectedGoalId((prev) => prev === node.id ? null : node.id);
      }
    },
    [editMode, onSelectGoal],
  );

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative' }}
      className={editMode ? 'edit-mode' : ''}
    >
      <ReactFlow
        key={`${parentId}-${editMode ? 'e' : 'v'}`}
        nodes={editMode ? editNodes : layoutNodes}
        edges={editMode ? editEdges : layoutEdges}
        onNodeClick={onNodeClick}
        onNodesChange={editMode ? onNodesChange : undefined}
        onEdgesChange={editMode ? onEdgesChange : undefined}
        onConnect={editMode ? onConnect : undefined}
        onEdgesDelete={editMode ? onEdgesDelete : undefined}
        onNodesDelete={editMode ? onNodesDelete : undefined}
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
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ stroke: '#a78bfa', strokeWidth: 2 }}
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
          nodeColor={() => '#a78bfa'}
          style={{
            bottom: 20,
            right: 20,
            backgroundColor: '#1e293b',
            border: '1px solid #475569',
            borderRadius: 8,
          }}
          maskColor="rgba(15, 23, 42, 0.7)"
        />
      </ReactFlow>

      {/* Toolbar */}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 6, zIndex: 5 }}>
        {canEditTasks && (
          <button
            onClick={toggleEditMode}
            title={editMode ? 'Exit edit mode' : 'Enter edit mode'}
            style={{
              ...toolbarButtonStyle,
              backgroundColor: editMode ? '#a78bfa' : 'var(--color-bg-secondary)',
              color: editMode ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
            }}
          >
            {editMode ? 'Editing' : 'Edit'}
          </button>
        )}
        {canEditTasks && editMode && (
          <button onClick={applyAutoLayout} style={toolbarButtonStyle}>Auto Layout</button>
        )}
        {canEditTasks && (
          <button
            onClick={() => setShowCreateGoal(!showCreateGoal)}
            style={{
              ...toolbarButtonStyle,
              backgroundColor: showCreateGoal ? '#a78bfa' : 'var(--color-bg-secondary)',
              color: showCreateGoal ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
            }}
          >
            + Goal
          </button>
        )}
        {canEditTasks && selectedGoalId && !editMode && (
          <button
            onClick={() => { removeGoal(selectedGoalId); setSelectedGoalId(null); }}
            style={{ ...toolbarButtonStyle, borderColor: 'var(--color-blocked)', color: 'var(--color-blocked)' }}
          >
            Remove Goal
          </button>
        )}
        <button
          onClick={() => setShowGlobalUnplaced(!showGlobalUnplaced)}
          style={{
            ...toolbarButtonStyle,
            backgroundColor: showGlobalUnplaced ? '#a78bfa' : 'var(--color-bg-secondary)',
            color: showGlobalUnplaced ? 'var(--color-bg-primary)' : 'var(--color-text-primary)',
          }}
        >
          Unplaced {unplacedCount > 0 && `(${unplacedCount})`}
        </button>
      </div>

      {/* Create goal form */}
      {showCreateGoal && (
        <div style={{
          position: 'absolute', top: 48, left: 12, width: 260, zIndex: 6,
          backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
          borderRadius: 8, padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>New Goal</div>
          <input
            ref={createGoalInputRef}
            type="text"
            placeholder="Goal name..."
            value={newGoalName}
            onChange={(e) => setNewGoalName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateGoal()}
            style={{
              width: '100%', padding: '6px 8px', borderRadius: 5,
              border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-primary)', fontSize: 12, outline: 'none', marginBottom: 8,
            }}
          />
          {parentType === 'department' && (
            <select
              value={newGoalSecondaryParent}
              onChange={(e) => setNewGoalSecondaryParent(e.target.value)}
              style={{
                width: '100%', padding: '6px 8px', borderRadius: 5,
                border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-primary)', fontSize: 12, outline: 'none', marginBottom: 8,
              }}
            >
              <option value="">+ Serves Project (optional)</option>
              {Array.from(projectsMap.values())
                .filter((p) => p.status === 'active')
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </select>
          )}
          {parentType === 'project' && (
            <select
              value={newGoalSecondaryParent}
              onChange={(e) => setNewGoalSecondaryParent(e.target.value)}
              style={{
                width: '100%', padding: '6px 8px', borderRadius: 5,
                border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-primary)', fontSize: 12, outline: 'none', marginBottom: 8,
              }}
            >
              <option value="">+ Executing Dept (optional)</option>
              {Array.from(departmentsMap.values())
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
            </select>
          )}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setShowCreateGoal(false); setNewGoalName(''); setNewGoalSecondaryParent(''); }}
              style={{ ...toolbarButtonStyle, fontSize: 11 }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreateGoal}
              disabled={!newGoalName.trim()}
              style={{
                ...toolbarButtonStyle, fontSize: 11,
                backgroundColor: newGoalName.trim() ? '#a78bfa' : 'var(--color-bg-tertiary)',
                color: newGoalName.trim() ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
                border: 'none',
              }}
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Presence banner */}
      {otherViewers.length > 0 && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          padding: '6px 16px', borderRadius: 6,
          backgroundColor: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.25)',
          color: '#38bdf8', fontSize: 12, zIndex: 5, pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>
          {otherViewers.join(', ')} {otherViewers.length === 1 ? 'is' : 'are'} also viewing
        </div>
      )}

      {editMode && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          padding: '6px 16px', borderRadius: 6,
          backgroundColor: 'rgba(167, 139, 250, 0.15)', border: '1px solid rgba(167, 139, 250, 0.3)',
          color: '#a78bfa', fontSize: 11, zIndex: 5, pointerEvents: 'none',
        }}>
          Drag nodes · Drag handles to connect · Select edge + Delete · Double-click to open goal
        </div>
      )}

      {!editMode && parentGoals.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          padding: '6px 16px', borderRadius: 6,
          backgroundColor: 'rgba(167, 139, 250, 0.1)', border: '1px solid rgba(167, 139, 250, 0.2)',
          color: 'var(--color-text-muted)', fontSize: 11, zIndex: 5, pointerEvents: 'none',
        }}>
          Click to select · Double-click to open tech tree
        </div>
      )}

      {parentGoals.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12, zIndex: 4,
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 36, opacity: 0.3 }}>🌳</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', opacity: 0.6 }}>
            No goals yet
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: 280 }}>
            Use the <strong>+ Goal</strong> button above to create the first goal for this {parentType}.
          </div>
        </div>
      )}

      {showGlobalUnplaced && (
        <GlobalUnplacedPanel onClose={() => setShowGlobalUnplaced(false)} />
      )}
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
