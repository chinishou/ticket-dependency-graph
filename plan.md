# Tech-Tree Improvement Plan: Relationships, Ownership & UX

## Context & Vision

Tech-tree is an **add-on to ShotGrid's ticket system**, built for the **pipeline team**. SG enforces constraints that don't fit pipeline reality:

- **SG: one ticket → one project.** Reality: a pipeline fix can serve multiple productions.
- **SG: no ticket dependencies.** Reality: pipeline tasks form complex dependency chains.
- **SG: no cross-department grouping.** Reality: pipeline goals span rendering, rigging, comp, etc.
- **SG: no "Goal" concept.** Reality: tickets need strategic grouping toward objectives.

**Tech-tree's job:** Add the relationships SG can't — multi-project associations, dependencies, departmental cross-references, and goal-based organization — while keeping SG as the source of truth for ticket data.

**All workers are pipeline team.** The app is their ticket system. Departments are kept for planning/tracking but not for worker identity.

---

## The Core Problem: Single-Association Limitation

Currently, both SG and tech-tree enforce single associations:

```
SG:        Ticket → 1 Project (fixed)
Tech-tree: Task   → 1 contributingDepartmentId (fixed)
Tech-tree: Goal   → 1 parentId (department OR project, not both)
```

**What we need:**

```
Tech-tree: Task → N Projects (SG source + local cross-refs)
Tech-tree: Task → N Departments (local cross-refs)
Tech-tree: Goal → 1 primary parent + cross-ref to project and/or department
```

---

## Implementation Plan

### Phase 1: Foundation (no schema changes)

#### 1.1 Computed Goal Status

**Problem:** Goals have no status indicator. All nodes are purple regardless of progress.

**Solution:** Pure function `computeGoalStatus(goal, tasksMap)`:
- `completed` — all tasks done (green)
- `in_progress` — any task in_progress (blue)
- `blocked` — any task blocked, none in_progress (red)
- `available` — tasks exist, none started (gray)
- `empty` — no tasks (dim)

**Files:**
- `src/types/index.ts` — add `GoalStatus`, `computeGoalStatus()`, `getGoalStatusColor()`
- `src/components/tech-tree/GoalNode.tsx` — status-colored border (replace hardcoded `#a78bfa`), widen progress bar 3px→6px, add status badge

#### 1.2 Parent Selector for GoalMapView

**Problem:** GoalMapView defaults to `departmentsMap.keys()[0]`. No way to switch which department/project's goals you see.

**Solution:** Tabbed selector showing all departments and projects. Clicking switches `goalMapParentType`/`goalMapParentId`.

**Files:**
- `src/App.tsx` — add user-controlled `goalMapParentType`/`goalMapParentId` state
- `src/components/layout/ParentSelector.tsx` — **new**: horizontal pill bar, departments left, projects right, active indicator

#### 1.3 GoalSelector Grouped by Parent

**Problem:** Flat `<select>` with all goals — unusable at scale.

**Solution:** `<optgroup>` elements grouped by parent: "Dept: Tools", "Project: Dragon Quest".

**Files:**
- `src/components/layout/GoalSelector.tsx` — read departments/projects from store, group/sort goals

#### 1.4 Project Context on Task Cards

**Problem:** MyTasksView shows goal name but not which project(s) a task serves.

**Solution:** Add `getProjectForGoal(goalId)` to store. Display project name in task cards.

**Files:**
- `src/store/useStore.ts` — add getter
- `src/components/worker/MyTasksView.tsx` — show project name
- `src/components/shared/TaskDetailPanel.tsx` — add project row
- `src/components/shared/FloatingTaskDetailPanel.tsx` — add project row

#### 1.5 Breadcrumb Context Tracking

**Problem:** Dashboard→TechTree breadcrumb "back" goes to GoalMapView, not the originating dashboard.

**Solution:** Track `entrySource` in App.tsx. Breadcrumb returns to correct origin.

**Files:**
- `src/App.tsx` — add `entrySource` state, update `buildBreadcrumbs()`

---

### Phase 2: Multi-Association Model (schema additions, backward compatible)

#### 2.1 Task Multi-Project & Multi-Department Associations

**Problem:** SG locks a ticket to one project. Tech-tree mirrors this with single `contributingDepartmentId`. Pipeline tasks often serve multiple projects and relate to multiple departments.

**Solution:** Add `relatedProjectIds: string[]` and `relatedDepartmentIds: string[]` to Task.

**Schema change** (`src/types/index.ts`):
```ts
Task {
  // ... existing fields unchanged (contributingDepartmentId, sgProjectId stay)
  relatedProjectIds?: string[];       // NEW: multiple project associations
  relatedDepartmentIds?: string[];    // NEW: multiple department associations
}
```

**Auto-sync rule** (`server/mutations.ts` in `upsertTaskFromSg`):
- On SG sync, if task has `sgProjectId`, ensure `sg-{sgProjectId}` is in `relatedProjectIds`
- Preserve any additional project/dept associations the user added in tech-tree

**UI for editing** (`src/components/shared/TaskDetailPanel.tsx`):
- Multi-select dropdowns for "Related Projects" and "Related Departments"
- SG-sourced project shown with lock icon (can't remove, SG is source of truth)
- User can add/remove additional associations

**Priority calc update** (`src/utils/priorityCalc.ts`):
- Project factor: `max(priority of relatedProjectIds)` instead of single-goal lookup
- Dept factor: `max(priority of relatedDepartmentIds)` instead of single `contributingDepartmentId`
- Fall back to existing logic when arrays are empty

**Files:**
- `src/types/index.ts` — add optional arrays
- `src/store/useStore.ts` — update `updateTask`
- `server/mutations.ts` — update `upsertTaskFromSg`, `updateTask`, `addTaskToGoal`
- `src/utils/priorityCalc.ts` — multi-project/dept factor logic
- `src/components/shared/TaskDetailPanel.tsx` — multi-select UI

#### 2.2 Goal Cross-References (Department + Project)

**Problem:** Goal can only have ONE parent. "USD Pipeline" goal is executed BY Pipeline dept FOR Dragon Quest project — can't represent both.

**Solution:** Add optional `departmentId` and `projectId` cross-reference fields to Goal.

**Schema change** (`src/types/index.ts`):
```ts
Goal {
  // Keep existing (primary parent for goal-map grouping)
  parentType: 'department' | 'project';
  parentId: string;

  // NEW: cross-references
  departmentId?: string;   // which dept executes this goal
  projectId?: string;      // which project this goal serves
}
```

**Backfill:** `parentType === 'department'` → auto-set `departmentId = parentId`. `parentType === 'project'` → auto-set `projectId = parentId`.

**Goal-map integration:** `getGoalsForProject(projectId)` includes goals where `projectId === projectId` (not just `parentId`). Same for departments. Goals appear in both views with badge.

**Create-goal form:** Optional secondary parent picker (e.g., "Serves Project" dropdown when creating under a dept).

**Files:**
- `src/types/index.ts` — add optional fields
- `src/store/useStore.ts` — update `addGoal`, `getGoalsForDepartment`, `getGoalsForProject`
- `server/mutations.ts` — update `addGoal`, `removeGoal`
- `src/components/tech-tree/GoalMapView.tsx` — create-goal form, cross-ref badges
- `src/components/tech-tree/GoalNode.tsx` — show project/dept badge

#### 2.3 GoalNode Visual Enhancement

**Problem:** All goal nodes look identical (purple). No status or cross-reference visibility.

**Solution:** Combine computed GoalStatus (1.1) with multi-association badges:
- Status-colored border (green/blue/red/gray per status)
- 6px progress bar with percentage
- Project badge (if cross-referenced)
- Department badge (if cross-referenced)

**Files:**
- `src/components/tech-tree/GoalNode.tsx` — status colors, badges, enlarged progress bar

---

### Phase 3: Navigation & Workflow Improvements

#### 3.1 Project-Scoped Goal Map

**Problem:** No way to see all goals serving a project in one view.

**Solution:** ParentSelector (1.2) + Goal cross-refs (2.2) = clicking a project tab shows all goals with that `projectId`. Department badge on each node shows who's executing.

**Files:**
- `src/App.tsx` — wire project selection
- `src/store/useStore.ts` — enhanced `getGoalsForProject`

#### 3.2 Global Unplaced Tasks Panel

**Problem:** Unplaced SG tickets only visible inside a specific goal's TechTreeView.

**Solution:** "Unplaced Tickets" button in GoalMapView toolbar. Panel shows all tasks with no goalId, **grouped by SG project** (`sgProjectName`). Each task shows `relatedProjectIds` badges and has "Place in Goal" dropdown.

**Files:**
- `src/components/tech-tree/GlobalUnplacedPanel.tsx` — **new**
- `src/components/tech-tree/GoalMapView.tsx` — toolbar button
- `src/store/useStore.ts` — `getAllUnplacedTasks()` getter

#### 3.3 Filtering by Associations

**Problem:** With multi-association tasks, users need to filter views by project/department.

**Solution:** Filter dropdowns in key views:
- **Timeline**: filter/group by project (currently dept-only)
- **MyTasksView**: filter by project

**Files:**
- `src/components/timeline/TimelineView.tsx` — project filter
- `src/components/worker/MyTasksView.tsx` — project filter

#### 3.4 Department-Project Cross View

**Problem:** No matrix view of department x project progress.

**Solution:** Dashboard sub-view: rows = departments, columns = active projects, cells = task progress using `relatedProjectIds`/`relatedDepartmentIds`.

**Files:**
- `src/components/dashboard/CrossView.tsx` — **new**
- `src/App.tsx` — add `'cross'` to SubViewB

---

## Priority Calc Rebalancing

### Current defaults (single-association):
```
Project: 25%  <- often defaults to P2 (no project link)
Dept:    20%  <- meaningless if all pipeline (same dept)
Goal:    15%
Creator: 10%
Graph:   30%
```

### Proposed defaults (multi-association):
```
Project: 30%  <- max(relatedProjectIds priorities) - now meaningful
Dept:    10%  <- reduced; still useful for sub-categories
Goal:    20%  <- increased - goals are the primary organizational tool
Creator: 10%  <- unchanged
Graph:   30%  <- unchanged
```

`CalibrationWeights` shape unchanged. Only `DEFAULT_WEIGHTS` values change. Settings sliders still work.

---

## Implementation Order

```
Phase 1 (independently shippable, no schema changes):
  1.1  Computed Goal Status
  1.2  Parent Selector
  1.3  GoalSelector Grouping
  1.4  Project Context on Task Cards
  1.5  Breadcrumb Context

Phase 2 (schema additions, backward compatible):
  2.1  Task Multi-Association (relatedProjectIds, relatedDepartmentIds)
  2.2  Goal Cross-References (departmentId, projectId)
  2.3  GoalNode Visual Enhancement

Phase 3 (navigation & workflow):
  3.1  Project-Scoped Goal Map
  3.2  Global Unplaced Panel
  3.3  Filtering by Associations
  3.4  Cross View
```

---

## Safety & Compatibility

- **No SG sync breakage:** New fields are tech-tree-owned. SG sync ignores them. `relatedProjectIds` is additive; SG project auto-included but never removed by sync.
- **No migration needed:** SQLite JSON blobs. New optional fields default to `undefined`.
- **No bidirectional dep changes:** New arrays are simple references, not dependency edges.
- **Backward compat:** `contributingDepartmentId` (single) stays. Priority calc falls back to it when `relatedDepartmentIds` is empty.
- **Worker model:** `Worker.departmentId` stays for schema compat. UI de-emphasizes department on workers.

## Verification

1. `npm run build` — clean typecheck after each phase
2. Phase 1: Goal nodes show status colors; parent selector switches dept/project views; task cards show project name
3. Phase 2: Edit a task -> add multiple related projects -> priority reflects highest project priority; create goal under dept with project cross-ref -> goal appears in both goal maps
4. Phase 3: Global unplaced panel shows orphan tasks grouped by SG project; timeline filters by project; cross-view shows dept x project matrix
5. Full flow: SG sync -> task arrives unplaced with SG project auto-associated -> coordinator places in goal -> adds project cross-ref -> worker sees all associations -> priority uses highest project priority
