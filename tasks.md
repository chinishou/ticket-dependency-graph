# Detailed Implementation Tasks

Generated from `plan.md`. Each task is self-contained and directly executable.

---

## Phase 1 — Foundation (no schema changes)

### Task 1.1 — Computed Goal Status

**Goal:** Make GoalNode visually reflect the aggregate status of its child tasks.

#### 1.1a — Add types and helpers (`src/types/index.ts`)

Add after the `TaskStatus` type declaration (line 29):

```ts
export type GoalStatus = 'completed' | 'in_progress' | 'blocked' | 'available' | 'empty';

export function computeGoalStatus(
  goal: { taskIds: string[] },
  tasksMap: Map<string, { status: string; archived?: boolean }>,
): GoalStatus {
  const tasks = goal.taskIds
    .map((id) => tasksMap.get(id))
    .filter((t): t is { status: string; archived?: boolean } => !!t && !t.archived);
  if (tasks.length === 0) return 'empty';
  if (tasks.every((t) => t.status === 'completed')) return 'completed';
  if (tasks.some((t) => t.status === 'in_progress')) return 'in_progress';
  if (tasks.some((t) => t.status === 'blocked')) return 'blocked';
  return 'available';
}

export function getGoalStatusColor(status: GoalStatus): string {
  switch (status) {
    case 'completed':  return 'var(--color-done)';
    case 'in_progress': return 'var(--color-in-progress)';
    case 'blocked':    return 'var(--color-blocked)';
    case 'available':  return 'var(--color-available)';
    case 'empty':      return 'var(--color-border)';
  }
}

export function getGoalStatusGlow(status: GoalStatus): string {
  switch (status) {
    case 'completed':  return 'var(--color-done-glow)';
    case 'in_progress': return 'var(--color-in-progress-glow)';
    case 'blocked':    return 'var(--color-locked-glow)';
    case 'available':  return 'var(--color-available-glow)';
    case 'empty':      return 'transparent';
  }
}
```

#### 1.1b — Update GoalNodeData and GoalNode (`src/components/tech-tree/GoalNode.tsx`)

- Import `computeGoalStatus`, `getGoalStatusColor`, `getGoalStatusGlow`, `GoalStatus` from `../../types`
- Add `tasksMap: Map<string, { status: string; archived?: boolean }>` to `GoalNodeData`
- In `GoalNodeComponent`:
  - Compute `const status = computeGoalStatus(goal, data.tasksMap)`
  - Compute `const accent = getGoalStatusColor(status)` and `const glow = getGoalStatusGlow(status)`
  - Replace hardcoded `ACCENT = '#a78bfa'` and `ACCENT_GLOW` with `accent`/`glow`
  - Change progress bar height from `3` to `6`
  - Add `{pct}%` text after `{completedTasks}/{totalTasks} tasks`
  - Add a small status badge (e.g., a colored dot + label) below the goal name

#### 1.1c — Pass tasksMap into GoalNodeData (`src/components/tech-tree/GoalMapView.tsx`)

In `buildGoalGraphLayout`, the node data already receives `tasksMap` entries for progress counting (line 58–60). Extend the `GoalNodeData` field population to also pass the full `tasksMap` reference so `GoalNode` can call `computeGoalStatus`.

**Verify:** `npm run build` clean. In browser: goal nodes change border color based on task statuses.

---

### Task 1.2 — Parent Selector for GoalMapView

**Goal:** Let coordinators switch which department or project's goals they are viewing without navigating away.

#### 1.2a — New component (`src/components/layout/ParentSelector.tsx`)

Create this file. Props:

```ts
interface ParentSelectorProps {
  parentType: 'department' | 'project';
  parentId: string;
  onChange: (type: 'department' | 'project', id: string) => void;
}
```

Reads `departments` and `projects` from `useStore`. Renders a horizontal pill bar:
- Left group: one pill per department (sorted by name)
- Separator
- Right group: one pill per active project (filter `project.status === 'active'`, sorted by `strategicPriority` then name)
- Active pill has filled background using `var(--color-accent)` (or `#a78bfa`); inactive pills use `var(--color-bg-tertiary)` with border
- Overflow: `overflowX: 'auto'`, `whiteSpace: 'nowrap'`, hide scrollbar with `-ms-overflow-style: none; scrollbar-width: none`

#### 1.2b — Wire into App.tsx (`src/App.tsx`)

Currently `goalMapParentType` and `goalMapParentId` are derived from `selectedGoalId` (lines 82–85). Change to:

1. Add state: `const [goalMapParentType, setGoalMapParentType] = useState<'department' | 'project'>('department')`
2. Add state: `const [goalMapParentId, setGoalMapParentId] = useState<string>('')`
3. Add effect to initialize from first available dept when `departmentsMap` loads:
   ```ts
   useEffect(() => {
     if (!goalMapParentId && departmentsMap.size > 0) {
       setGoalMapParentId(Array.from(departmentsMap.keys())[0]);
     }
   }, [departmentsMap, goalMapParentId]);
   ```
4. When `handleGoalMapSelect` fires, sync back: `setGoalMapParentType(goal.parentType); setGoalMapParentId(goal.parentId)`
5. Render `<ParentSelector>` above the GoalMapView canvas when `subViewA === 'goal-map'` (add it inside the `rightContent` or as an overlay toolbar above the ReactFlow canvas in GoalMapView)

#### 1.2c — Position in UI

Option A (preferred): Pass `ParentSelector` as a prop or render it as the `topBar` slot inside `GoalMapView`. The component already has a toolbar area (the Edit / + Goal / hint text row). Add ParentSelector above that row.

Option B: Render in App.tsx `rightContent` when `subViewA === 'goal-map'`.

**Verify:** Clicking different department/project pills changes which goals appear in the GoalMapView canvas.

---

### Task 1.3 — GoalSelector Grouped by Parent

**Goal:** Make the tech-tree dropdown in the header bar scannable by grouping goals under their parent.

#### 1.3a — Rewrite GoalSelector (`src/components/layout/GoalSelector.tsx`)

Current file is 34 lines with a flat `<select>`. Replace with:

```tsx
export function GoalSelector({ selectedGoalId, onSelectGoal }: GoalSelectorProps) {
  const goalsMap = useStore((s) => s.goals);
  const departmentsMap = useStore((s) => s.departments);
  const projectsMap = useStore((s) => s.projects);

  // Build groups: collect goals per parent, sorted by departmentPriority then name
  const deptGroups: { label: string; goals: Goal[] }[] = [];
  const projGroups: { label: string; goals: Goal[] }[] = [];

  for (const dept of departmentsMap.values()) {
    const goals = dept.goalIds
      .map((id) => goalsMap.get(id))
      .filter(Boolean) as Goal[];
    goals.sort((a, b) => a.departmentPriority - b.departmentPriority || a.name.localeCompare(b.name));
    if (goals.length > 0) deptGroups.push({ label: `Dept: ${dept.name}`, goals });
  }
  for (const proj of projectsMap.values()) {
    if (proj.status === 'active') {
      const goals = proj.goalIds
        .map((id) => goalsMap.get(id))
        .filter(Boolean) as Goal[];
      goals.sort((a, b) => a.name.localeCompare(b.name));
      if (goals.length > 0) projGroups.push({ label: `Project: ${proj.name}`, goals });
    }
  }
  // Sort dept groups and project groups by label
  deptGroups.sort((a, b) => a.label.localeCompare(b.label));
  projGroups.sort((a, b) => a.label.localeCompare(b.label));

  return (
    <select value={selectedGoalId} onChange={(e) => onSelectGoal(e.target.value)} style={...}>
      {[...deptGroups, ...projGroups].map(({ label, goals }) => (
        <optgroup key={label} label={label}>
          {goals.map((goal) => (
            <option key={goal.id} value={goal.id}>{goal.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
```

Add `import type { Goal } from '../../types'` at top.

**Verify:** GoalSelector in the header bar shows goals grouped under "Dept: …" and "Project: …" labels.

---

### Task 1.4 — Project Context on Task Cards

**Goal:** Workers and coordinators can see which project a task belongs to without leaving the current view.

#### 1.4a — Add `getProjectForGoal` to store (`src/store/useStore.ts`)

1. Add to `AppState` interface (after `getUnplacedTasks`):
   ```ts
   getProjectForGoal: (goalId: string) => Project | null;
   ```
2. Add implementation (after `getUnplacedTasks` implementation ~line 982):
   ```ts
   getProjectForGoal: (goalId) => {
     const goal = get().goals.get(goalId);
     if (!goal) return null;
     if (goal.parentType === 'project') return get().projects.get(goal.parentId) ?? null;
     // Also check project.goalIds (goals parented to dept may still be in a project's goalIds)
     for (const project of get().projects.values()) {
       if (project.goalIds.includes(goalId)) return project;
     }
     return null;
   },
   ```

#### 1.4b — Show project in MyTasksView (`src/components/worker/MyTasksView.tsx`)

In the task card render (for both `activeTasks` and `upNextTasks`/`queueTasks`), below the goal name line, add:

```tsx
const getProjectForGoal = useStore((s) => s.getProjectForGoal);
// Inside card:
const project = getProjectForGoal(task.goalId);
{project && (
  <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 1 }}>
    {project.name}
  </div>
)}
```

#### 1.4c — Show project in FloatingTaskDetailPanel (`src/components/shared/FloatingTaskDetailPanel.tsx`)

After the existing `dept &&` block (around line 58), add:

```tsx
const getProjectForGoal = useStore((s) => s.getProjectForGoal);
const project = getProjectForGoal(task.goalId);
// In JSX after the Department row:
{project && (
  <div style={metaRowStyle}>
    <span style={{ color: 'var(--color-text-muted)' }}>Project</span>
    <span>{project.name}</span>
  </div>
)}
```

#### 1.4d — Show project in TaskDetailPanel (`src/components/shared/TaskDetailPanel.tsx`)

Same pattern as 1.4c: add `getProjectForGoal` selector, render a "Project" meta row in the task detail sidebar.

**Verify:** Open MyTasksView as a worker — task cards show project name below goal name. Click a task in Timeline/Workers — FloatingTaskDetailPanel shows a "Project" row.

---

### Task 1.5 — Breadcrumb Context Tracking

**Goal:** When a user drills from Dashboard → goal tech tree, clicking the breadcrumb parent returns to the originating dashboard instead of GoalMapView.

#### 1.5a — Add entrySource state (`src/App.tsx`)

1. Add type:
   ```ts
   type EntrySource =
     | { from: 'goal-map' }
     | { from: 'project-dashboard'; projectId: string }
     | { from: 'dept-dashboard'; deptId: string };
   ```
2. Add state: `const [entrySource, setEntrySource] = useState<EntrySource>({ from: 'goal-map' })`

#### 1.5b — Record entry when navigating from dashboards

In `handleDashboardGoalSelect` (line 138):
```ts
const handleDashboardGoalSelect = useCallback((goalId: string) => {
  clearSelection();
  setSelectedGoalId(goalId);
  setSubViewA('tech-tree');
  setTopView('A');
  // Record where we came from
  if (subViewB === 'project') setEntrySource({ from: 'project-dashboard', projectId: selectedProjectId });
  else if (subViewB === 'department') setEntrySource({ from: 'dept-dashboard', deptId: selectedDeptId });
  else setEntrySource({ from: 'goal-map' });
}, [clearSelection, subViewB, selectedProjectId, selectedDeptId]);
```

Also reset entrySource when the user manually navigates to goal-map:
```ts
const handleGoToGoalMap = useCallback(() => {
  clearSelection();
  setSubViewA('goal-map');
  setEntrySource({ from: 'goal-map' });
}, [clearSelection]);
```

#### 1.5c — Use entrySource in breadcrumbs

In `buildBreadcrumbs()`, for the `subViewA === 'tech-tree'` case (line 164–168), replace the hardcoded `handleGoToGoalMap` onClick with:

```ts
const handleBreadcrumbBack = useCallback(() => {
  if (entrySource.from === 'project-dashboard') {
    setSelectedProjectId(entrySource.projectId);
    setSubViewB('project');
    setTopView('B');
  } else if (entrySource.from === 'dept-dashboard') {
    setSelectedDeptId(entrySource.deptId);
    setSubViewB('department');
    setTopView('B');
  } else {
    handleGoToGoalMap();
  }
}, [entrySource, handleGoToGoalMap]);
```

Use `handleBreadcrumbBack` for both the company and parent breadcrumb `onClick` in the tech-tree case.

**Verify:** Dashboard → click a goal → tech tree opens. Clicking the parent breadcrumb returns to the same dashboard (not GoalMapView).

---

## Phase 2 — Multi-Association Model

### Task 2.1 — Task Multi-Project & Multi-Department Associations

**Goal:** A pipeline task can be formally associated with multiple SG projects and multiple departments.

#### 2.1a — Schema change (`src/types/index.ts`)

In the `Task` interface, add two optional fields after `syncSource`:
```ts
relatedProjectIds?: string[];      // tech-tree cross-references (SG source auto-included)
relatedDepartmentIds?: string[];   // tech-tree cross-references
```

#### 2.1b — SG sync auto-populates (`server/mutations.ts` in `upsertTaskFromSg`)

After the existing task is built/merged, add:
```ts
// Auto-include SG source project in relatedProjectIds
if (resolvedTask.sgProjectId) {
  const sgProjLocalId = `sg-${resolvedTask.sgProjectId}`;
  const existing = (resolvedTask.relatedProjectIds as string[] | undefined) ?? [];
  resolvedTask.relatedProjectIds = existing.includes(sgProjLocalId)
    ? existing
    : [sgProjLocalId, ...existing];
}
```
This ensures SG's project is always the first entry but user-added projects are preserved on re-sync.

#### 2.1c — Preserve on `addTaskToGoal` (`server/mutations.ts`)

No change needed — `addTaskToGoal` merges the incoming task data; `relatedProjectIds` persists naturally.

#### 2.1d — Store `updateTask` preserves new fields (`src/store/useStore.ts`)

`updateTask` currently spreads `updates` over the existing task. `relatedProjectIds` and `relatedDepartmentIds` are plain arrays, so optimistic update works correctly. No change needed.

#### 2.1e — Priority calc uses multi-associations (`src/utils/priorityCalc.ts`)

In `computeTaskPriorities`, replace the project factor and dept factor lookups:

**Project factor (replace lines 195–197):**
```ts
// Project factor: highest priority among relatedProjectIds, fall back to goal→project
let projPriority: StrategicPriority = 'P2';
const relatedProjIds = (task as Task & { relatedProjectIds?: string[] }).relatedProjectIds;
if (relatedProjIds && relatedProjIds.length > 0) {
  // Find highest-priority (lowest rank number) project
  for (const pid of relatedProjIds) {
    const proj = (projects as unknown as Map<string, { strategicPriority: StrategicPriority }>)?.get(pid);
    if (proj && strategicPriorityToRank(proj.strategicPriority) < strategicPriorityToRank(projPriority)) {
      projPriority = proj.strategicPriority;
    }
  }
} else {
  projPriority = projectPriorityMap?.get(task.goalId) ?? 'P2';
}
const projectFactor = computeProjectFactor(projPriority);
```

Note: `computeTaskPriorities` currently receives `goals` and `departments` but not `projects`. Add `projects?: Map<string, Project>` to the `PriorityInput` interface and pass it from all call sites.

**Dept factor (replace lines 199–202):**
```ts
let deptPriority: StrategicPriority = 'P2';
const relatedDeptIds = (task as Task & { relatedDepartmentIds?: string[] }).relatedDepartmentIds;
if (relatedDeptIds && relatedDeptIds.length > 0) {
  for (const did of relatedDeptIds) {
    const dept = departments?.get(did);
    if (dept && strategicPriorityToRank(dept.priority) < strategicPriorityToRank(deptPriority)) {
      deptPriority = dept.priority;
    }
  }
} else {
  const dept = departments?.get(task.contributingDepartmentId);
  deptPriority = dept?.priority ?? 'P2';
}
const deptFactor = computeDeptFactor(deptPriority);
```

#### 2.1f — Update DEFAULT_WEIGHTS (`src/utils/priorityCalc.ts`)

```ts
export const DEFAULT_WEIGHTS: CalibrationWeights = {
  project: 0.30,   // was 0.25
  dept: 0.10,      // was 0.20
  goal: 0.20,      // was 0.15
  creator: 0.10,
  graph: 0.30,
};
```

#### 2.1g — Multi-select UI in TaskDetailPanel (`src/components/shared/TaskDetailPanel.tsx`)

Add a new `RelatedAssociations` section below the existing dependency lists. Create a reusable internal component `MultiSelectList`:

```tsx
// Props: title, selectedIds, allOptions [{id, name}], sgLockedId (optional, can't remove)
// Renders: tag pills for each selected item, "+" button to open a search dropdown, "×" to remove
```

Wire to `updateTask(taskId, { relatedProjectIds: [...] })` and `updateTask(taskId, { relatedDepartmentIds: [...] })`.

The SG-sourced project pill should show a 🔒 icon and be unremovable (identified by checking `task.sgProjectId` matches `sg-{sgProjectId}`).

**Verify:** `npm run build` clean. Edit a task → add a second project → priority score changes if that project has higher priority than the original. SG-project pill shows lock icon.

---

### Task 2.2 — Goal Cross-References

**Goal:** A goal can now formally reference both a department (who executes it) and a project (what it serves), regardless of which is the `parentType`.

#### 2.2a — Schema change (`src/types/index.ts`)

In the `Goal` interface, add two optional fields after `unlocksGoalIds`:
```ts
departmentId?: string;   // which dept executes this goal (tech-tree cross-ref)
projectId?: string;      // which project this goal serves (tech-tree cross-ref)
```

#### 2.2b — Backfill in `addGoal` (`server/mutations.ts`)

In the `addGoal` function, after inserting the goal:
```ts
// Backfill cross-refs from primary parent
if (!goal.departmentId && goal.parentType === 'department') {
  goal = { ...goal, departmentId: goal.parentId };
}
if (!goal.projectId && goal.parentType === 'project') {
  goal = { ...goal, projectId: goal.parentId };
}
```

#### 2.2c — Update store lookups (`src/store/useStore.ts`)

**`getGoalsForDepartment`:** After returning goals from `dept.goalIds`, also include goals where `goal.departmentId === deptId` that aren't already in the list:
```ts
getGoalsForDepartment: (deptId) => {
  const dept = get().departments.get(deptId);
  const fromDept = new Set(dept?.goalIds ?? []);
  const result: Goal[] = [];
  for (const goal of get().goals.values()) {
    if (fromDept.has(goal.id) || goal.departmentId === deptId) {
      result.push(goal);
    }
  }
  return result;
},
```

**`getGoalsForProject`:** Same pattern — include goals where `goal.projectId === projectId` in addition to `project.goalIds`:
```ts
getGoalsForProject: (projectId) => {
  const project = get().projects.get(projectId);
  const fromProject = new Set(project?.goalIds ?? []);
  const result: Goal[] = [];
  for (const goal of get().goals.values()) {
    if (fromProject.has(goal.id) || goal.projectId === projectId) {
      result.push(goal);
    }
  }
  return result;
},
```

#### 2.2d — Update `removeGoal` (`server/mutations.ts`)

When removing a goal, remove it from both `dept.goalIds` and `project.goalIds` if cross-referenced:
```ts
// Also remove from cross-referenced project/dept goalIds
if (goal.projectId) {
  const proj = getEntity('projects', goal.projectId) as Record<string, unknown> | null;
  if (proj) {
    upsertEntity('projects', goal.projectId, {
      ...proj,
      goalIds: arrayRemove(proj.goalIds as string[], goalId),
    });
  }
}
// similar for goal.departmentId
```

#### 2.2e — Create-goal form adds secondary parent picker (`src/components/tech-tree/GoalMapView.tsx`)

In `handleCreateGoal` (line 128–146), after the goal name input, add:
- If `parentType === 'department'`: optional `<select>` for "Serves Project" (lists all active projects + "None"). Sets `goal.projectId`.
- If `parentType === 'project'`: optional `<select>` for "Executing Department". Sets `goal.departmentId`.

The `Goal` object in `handleCreateGoal` should include the new fields:
```ts
const goal: Goal = {
  ...existing fields,
  departmentId: parentType === 'department' ? parentId : selectedDeptId || undefined,
  projectId: parentType === 'project' ? parentId : selectedProjectId || undefined,
};
```

**Verify:** Create a goal under a department, assign it to a project. Navigate to that project's goal map (via ParentSelector from 1.2) — the goal appears there with a department badge.

---

### Task 2.3 — GoalNode Visual Enhancement

**Goal:** Goal nodes show status color, enlarged progress bar, cross-reference badges.

#### 2.3a — Update GoalNode (`src/components/tech-tree/GoalNode.tsx`)

Builds on Task 1.1a/1.1b. Additional changes after 1.1 is complete:

1. **Cross-reference badges** — Add to `GoalNodeData`:
   ```ts
   projectName?: string;     // populated when goal has a projectId cross-ref
   departmentName?: string;  // populated when goal has a departmentId cross-ref
   ```

2. **In `buildGoalGraphLayout`** (`GoalMapView.tsx`): populate `projectName` and `departmentName` by looking up `goal.projectId` / `goal.departmentId` in the respective maps.

3. **In GoalNode JSX**, below the owner line, render small pill badges:
   ```tsx
   {data.projectName && (
     <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3,
       background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)',
       border: '1px solid var(--color-border)', marginRight: 4 }}>
       📁 {data.projectName}
     </span>
   )}
   {data.departmentName && (
     <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3,
       background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)',
       border: '1px solid var(--color-border)' }}>
       🏢 {data.departmentName}
     </span>
   )}
   ```

4. **Expand node height** in `GOAL_NODE_HEIGHT` from `100` to `120` to accommodate badges.

**Verify:** Goal with cross-references shows project/dept badges. Status color updates as tasks change.

---

## Phase 3 — Navigation & Workflow Improvements

### Task 3.1 — Project-Scoped Goal Map

**Goal:** Clicking a project tab in the ParentSelector shows all goals that serve that project.

#### 3.1a — Wire project selection in App.tsx

This is mostly already done by Task 1.2 (ParentSelector) + Task 2.2 (enhanced `getGoalsForProject`). Verify the full path:
- ParentSelector onChange with `type='project'` → sets `goalMapParentType='project'`, `goalMapParentId=projectId`
- GoalMapView receives these as props → calls `getGoalsForProject(projectId)` → returns goals where `parentId === projectId` OR `projectId === projectId`
- Goals from different departments appear with their `departmentName` badge (from Task 2.3)

No new code needed if 1.2 and 2.2 are done correctly.

**Verify:** Select a project tab in ParentSelector → goals from multiple departments (all serving that project) appear in the goal map.

---

### Task 3.2 — Global Unplaced Tasks Panel

**Goal:** Coordinators can see and batch-place all unplaced SG tickets from a single panel at the goal-map level.

#### 3.2a — Add `getAllUnplacedTasks` to store (`src/store/useStore.ts`)

Add to interface and implementation:
```ts
getAllUnplacedTasks: () => Task[];

// implementation:
getAllUnplacedTasks: () => {
  return Array.from(get().tasks.values()).filter(
    (t) => !t.archived && (!t.goalId || t.goalId === ''),
  );
},
```

#### 3.2b — Create GlobalUnplacedPanel (`src/components/tech-tree/GlobalUnplacedPanel.tsx`)

New component. Props: `{ onClose: () => void }`.

**Layout:**
- Fixed overlay panel, left side, same style as `UnplacedTasksPanel` but taller (full height minus header)
- Header: "Unplaced Tickets (N)" + close button + search input
- Body: tasks grouped by `task.sgProjectName || task.sgProjectId || 'No Project'`
- Each group has a collapsible header showing project name + task count
- Each task row shows: ticket ID badge, task name, `relatedProjectIds` pill badges, "Place in Goal" `<select>` dropdown
- The "Place in Goal" select lists all goals grouped by parent (same as `GoalSelector` from Task 1.3 — consider extracting the optgroup logic into a shared `useGroupedGoals()` hook)
- Selecting a goal calls `addTaskToGoal(selectedGoalId, task)` from store

#### 3.2c — Add toolbar button to GoalMapView (`src/components/tech-tree/GoalMapView.tsx`)

In the toolbar section (where Edit and + Goal buttons live), add:
```tsx
{!editMode && (
  <button onClick={() => setShowGlobalUnplaced(true)} style={...}>
    📥 Unplaced Tickets {unplacedCount > 0 && `(${unplacedCount})`}
  </button>
)}
{showGlobalUnplaced && <GlobalUnplacedPanel onClose={() => setShowGlobalUnplaced(false)} />}
```

Add `const getAllUnplacedTasks = useStore((s) => s.getAllUnplacedTasks)` and compute `unplacedCount` with `useMemo`.

**Verify:** GoalMapView toolbar shows "Unplaced Tickets (N)" button. Click → panel opens with tasks grouped by SG project. Selecting a goal and confirming places the task.

---

### Task 3.3 — Filtering by Associations

**Goal:** Key views can be filtered by project using `relatedProjectIds`.

#### 3.3a — Project filter in MyTasksView (`src/components/worker/MyTasksView.tsx`)

1. Add state: `const [projectFilter, setProjectFilter] = useState<string>('all')`
2. Read `projectsMap` from store
3. Add a filter bar above the active tasks section:
   ```tsx
   <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} style={...}>
     <option value="all">All Projects</option>
     {Array.from(projectsMap.values())
       .filter((p) => p.status === 'active')
       .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
   </select>
   ```
4. Filter `activeTasks`, `queueTasks`, `unlockedTasks` when `projectFilter !== 'all'`:
   ```ts
   const matchesFilter = (t: Task) =>
     projectFilter === 'all' ||
     (t as Task & { relatedProjectIds?: string[] }).relatedProjectIds?.includes(projectFilter) ||
     (t.goalId && (() => {
       const goal = goalsMap.get(t.goalId);
       return goal?.parentType === 'project' && goal.parentId === projectFilter;
     })());
   ```

#### 3.3b — Project filter in TimelineView (`src/components/timeline/TimelineView.tsx`)

1. Add state: `const [projectFilter, setProjectFilter] = useState<string>('all')`
2. Add project filter `<select>` in the timeline toolbar (alongside any existing controls)
3. Apply filter to `scheduledTasks` before rendering rows — filter by `task.relatedProjectIds?.includes(projectFilter)` or goal-based fallback

**Verify:** MyTasksView shows only tasks associated with the selected project. Timeline rows filter similarly.

---

### Task 3.4 — Department-Project Cross View

**Goal:** Admins/coordinators can see a matrix of department × project task progress.

#### 3.4a — Create CrossView component (`src/components/dashboard/CrossView.tsx`)

New component. Props: `{ onBack: () => void }`.

**Data model:**
```ts
// For each (dept, project) pair, compute:
interface CellData {
  total: number;
  completed: number;
  inProgress: number;
  blocked: number;
}
```

**How to populate cells:**
- Iterate all tasks (exclude archived)
- For each task, get its `relatedDepartmentIds` (fallback: `[task.contributingDepartmentId]`)
- For each task, get its `relatedProjectIds` (fallback: goal→project lookup)
- For each (dept, project) pair this task belongs to, increment the cell counters

**Render:**
- Header row: company name + "Cross View" + Back button
- Table: rows = departments (sorted by priority), columns = active projects (sorted by priority)
- Cell: progress bar + "X/Y" text, colored by status (blocked=red, in_progress=blue, done=green)
- Clicking a cell navigates to that department's GoalMapView filtered by that project (calls `onSelectDeptProjectView` or similar — wire through App.tsx)

#### 3.4b — Wire into App.tsx and CompanyDashboard

1. Add `'cross'` to `SubViewB` type in `App.tsx`
2. Add handler: `const handleShowCrossView = useCallback(() => setSubViewB('cross'), [])`
3. Render `<CrossView onBack={handleBackToCompany} />` when `subViewB === 'cross'`
4. Add "Cross View" button to `CompanyDashboard` in the header area

**Verify:** CompanyDashboard shows "Cross View" button. Click → matrix table appears with departments as rows, projects as columns, progress in cells.

---

## Dependency Graph

```
1.1a (types) → 1.1b (GoalNode) → 1.1c (GoalMapView data)
1.2a (ParentSelector) → 1.2b (App.tsx wiring)
1.3a (GoalSelector rewrite)
1.4a (store getter) → 1.4b/c/d (UI components)
1.5a/b/c (App.tsx breadcrumbs)

2.1a (types) → 2.1b (SG sync) → 2.1e (priority calc) → 2.1f (default weights)
              → 2.1g (TaskDetailPanel UI)
2.2a (types) → 2.2b (server backfill) → 2.2c (store lookups) → 2.2d (removeGoal)
              → 2.2e (create-goal form)
[1.1 + 2.2] → 2.3 (GoalNode badges)

[1.2 + 2.2] → 3.1 (project goal map — no extra code)
3.2a (getAllUnplacedTasks) → 3.2b (GlobalUnplacedPanel) → 3.2c (GoalMapView button)
[2.1] → 3.3a/b (filtering by relatedProjectIds)
[2.1] → 3.4a/b (CrossView uses relatedProjectIds/DeptIds)
```

## Verification Checklist

- [ ] `npm run build` passes after each phase
- [ ] Phase 1: goal nodes show status colors; parent selector switches views; task cards show project name; breadcrumb back returns to originating dashboard
- [ ] Phase 2: adding a second related project raises priority score for a P1 project task; creating a goal with a cross-ref makes it appear in both parent's goal maps; SG sync preserves user-added `relatedProjectIds`
- [ ] Phase 3: global unplaced panel groups tickets by SG project; timeline filters by project; cross view matrix populates correctly
- [ ] SG re-sync does not remove user-added `relatedProjectIds` (only auto-adds the SG project)
- [ ] `npm run lint` clean
