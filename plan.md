# Task Tech Tree — UI Prototype Plan

## Context

Building a UI prototype for a game-inspired task management/visualization web app for VFX production. The goal is fast iteration on the UI — no backend yet. The design doc (`task-tech-tree-system.md`) defines a rich data model (Company → Department/Project → Goal → Task/Milestone) with multi-parent/multi-child dependencies, priority calculation, and 4 UI views. The key constraint: this is NOT a freeform node editor — the tech tree must be auto-laid-out like a strategy game tech tree.

## Tech Stack

| Choice | Why |
|--------|-----|
| **React 18 + TypeScript + Vite** | Fast HMR, type safety for complex data model |
| **React Flow + dagre** | Auto-layout DAG rendering; dagre handles layered left-to-right layout natively. `nodesDraggable: false` enforces the "no freeform editing" constraint |
| **Tailwind CSS** | Rapid styling iteration, good dark mode support |
| **Zustand** | Lightweight in-memory state for mock data |
| **React Router v6** | Navigation hierarchy (Company → Project/Dept → Goal → Task) |

## File Structure

```
src/
├── main.tsx, App.tsx
├── types/index.ts                    # All interfaces from data model
├── data/mockData.ts                  # Dragon Quest VFX example from design doc
├── store/useStore.ts                 # Zustand store
├── utils/
│   ├── graphLayout.ts                # dagre → React Flow positions
│   ├── priorityCalc.ts              # Backward propagation scoring
│   └── dateUtils.ts                  # ETA, timeline math
├── components/
│   ├── layout/  (AppShell, ViewSwitcher, Breadcrumbs)
│   ├── shared/  (ProgressBar, StatusBadge, PriorityBadge, WorkerAvatars, TaskDetailPanel)
│   ├── tech-tree/  (TechTreeView, TaskNode, MilestoneNode, DependencyEdge)
│   ├── dashboard/  (CompanyDashboard, ProjectDashboard, DeptDashboard, cards)
│   ├── timeline/   (TimelineView, TimelineRow, TimeAxis, MilestoneMarker, WorkerAllocation)
│   └── worker/     (WorkerView, TaskQueue)
└── pages/  (CompanyPage, ProjectPage, DepartmentPage, GoalPage, WorkerPage)
```

## Implementation Phases

### Phase 1: Foundation + Tech Tree View (highest visual impact)

1. Init project: Vite + React + TS, install `reactflow`, `@dagrejs/dagre`, `tailwindcss`, `react-router-dom`, `zustand`
2. `src/types/index.ts` — TypeScript interfaces matching the data model (Company, Department, Project, Goal, Task, Milestone, Worker, enums for status/priority)
3. `src/data/mockData.ts` — Dragon Quest project, Pipeline dept, USD Pipeline goal with tasks (USD Setup ✓, Sublayer Caching in-progress, Asset Resolver available, Shot Assembly locked), milestones, workers (Alice, Bob, Carol, etc.)
4. `src/store/useStore.ts` — Zustand store with entity lookups
5. `src/utils/graphLayout.ts` — dagre layout: `rankdir: 'LR'`, converts tasks+deps into positioned React Flow nodes/edges
6. `TaskNode.tsx` + `MilestoneNode.tsx` — Custom nodes with status colors, worker count, ETA
7. `TechTreeView.tsx` — React Flow canvas with dagre auto-layout, fit-to-view, click-to-select
8. `TaskDetailPanel.tsx` — Slide-out showing cost, workers, prerequisites, unlocks
9. Basic routing to view a goal's tech tree

### Phase 2: Dashboard Views

10. Shared components: ProgressBar, StatusBadge, PriorityBadge, WorkerAvatars
11. CompanyDashboard — project cards + department cards with progress/status
12. ProjectDashboard — dept contributions, milestones, blockers
13. DeptDashboard — goals, worker list, utilization
14. AppShell + navigation + ViewSwitcher [A][B][C]

### Phase 3: Timeline View

15. TimeAxis with month/week markers
16. TimelineRow — horizontal task bars positioned by date
17. TimelineView grouping by department or goal
18. MilestoneMarker + WorkerAllocation swimlanes

### Phase 4: Worker View + Polish

19. WorkerView — active task, "this unlocks" mini tree, queue
20. Priority calculation (backward propagation from design doc)
21. Dark mode, transitions, hover states

### Phase 5: Backend + Concurrent Editing

#### Context

Internal tool, max 5 users. Need persistence and edit locking so people don't overwrite each other. No real auth needed — just a name tag so others know who's editing. No audit logging.

#### Backend Stack

- **Express.js** — simple REST API server
- **better-sqlite3** — embedded SQLite, zero config, runs in the Express process
- **Polling** — clients poll for lock status + data changes (simple, no WebSocket complexity)

Why SQLite + Express over Supabase/Firebase:
- Zero external dependencies, runs locally or on any VM
- SQLite transactions handle the bidirectional sync atomically
- No accounts/billing/hosted services to manage
- Fits the "internal tool" nature — deploy alongside existing infra

#### Database Schema

```sql
-- All 7 entity types as tables with JSON columns for array fields
-- e.g. tasks table:
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL  -- JSON blob of the full Task object
);
-- Same pattern for: companies, departments, projects, goals, milestones, workers

-- User tags (no passwords)
CREATE TABLE users (
  name TEXT PRIMARY KEY,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Edit locks
CREATE TABLE edit_locks (
  scope TEXT PRIMARY KEY,   -- e.g. "goal:goal-usd-pipeline" or "goal-map:dept-pipeline"
  locked_by TEXT NOT NULL,  -- user name tag
  locked_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL   -- auto-expire after 5 min, refreshed on activity
);
```

JSON blob per entity (rather than normalized columns) keeps the schema simple and matches the current Zustand Map structure exactly — no ORM, no migration complexity.

#### API Endpoints

```
GET  /api/state                    -- returns all entities (full app state)
POST /api/mutations/:type          -- execute a mutation (updateTask, updateGoal, etc.)
                                      body: { mutationType, entityId, updates }
                                      server applies bidirectional sync in a transaction

POST /api/users                    -- create/get a user tag (body: { name })
GET  /api/users                    -- list all user tags

POST /api/locks/acquire            -- body: { scope, userName }
POST /api/locks/release            -- body: { scope, userName }
GET  /api/locks                    -- list all active locks (for UI display)

GET  /api/poll?since=<timestamp>   -- returns changes since timestamp + current locks
```

#### User Tag System

- No login page — just a name picker in the header
- On first visit: prompt "Enter your name" → creates tag via `POST /api/users`
- Stored in localStorage, shown in header as "Editing as: Alice"
- Anyone can switch to any tag (it's trust-based, internal tool)
- The tag is only used for lock ownership display ("Alice is editing USD Pipeline")

#### Locking Flow

1. User clicks "Unlock" (edit mode) → client calls `POST /api/locks/acquire { scope: "goal:goal-usd-pipeline", userName: "Alice" }`
2. Server checks: is scope already locked by someone else and not expired? → if yes, reject with lock holder name
3. If free or expired → insert/replace lock row, return success
4. Client enters edit mode. Refreshes lock every 2 min via same acquire call.
5. User clicks "Lock" (exit edit mode) → client calls `POST /api/locks/release`
6. Other clients poll `/api/locks` and show "Alice is editing" banner, disable their unlock button

Lock auto-expires after 5 minutes if not refreshed (handles browser close/crash).

#### Sub-phases

**5a — Server + Persistence (3-4 days)**
- New `server/` directory: `server/index.ts`, `server/db.ts`, `server/routes.ts`
- SQLite schema + seed from current mockData
- REST endpoints for full state fetch + mutations
- Port the 5 Zustand mutation functions to server-side (bidirectional sync in SQLite transactions)
- Refactor `useStore.ts`: fetch state from API on init, mutations call API then update local state
- Add Vite proxy config to forward `/api` to Express
- Files: new `server/*`, `src/store/useStore.ts`, `vite.config.ts`, `package.json`

**5b — User Tags + Locking (2-3 days)**
- User tag CRUD endpoints + SQLite table
- Lock acquire/release/list endpoints
- Name picker UI in AppShell header (dropdown or text input, localStorage persistence)
- TechTreeView/GoalMapView: acquire lock on edit toggle, show "X is editing" banner when locked by another
- Poll `/api/locks` every 5s to update lock display
- Lock refresh interval (2 min) while in edit mode
- Files: `AppShell.tsx`, `TechTreeView.tsx`, `GoalMapView.tsx`, `useStore.ts`

**5c — Polling for live updates (1-2 days)**
- Poll `/api/poll?since=<ts>` every 5-10s for non-editing users
- Server tracks last-modified timestamp per entity
- On change detected, refresh affected entities in Zustand store
- Files: `useStore.ts` (polling hook)

#### Zustand Store Changes

Structure stays the same. What changes:
- **Init**: mock data import → `fetch('/api/state')` on mount
- **Mutations**: sync `set()` calls → `async fetch('/api/mutations/...')` then local `set()`
- **New state**: `userName: string | null`, `locks: Map<string, { lockedBy: string }>`, `isLoading: boolean`
- **New actions**: `setUserName()`, `acquireLock(scope)`, `releaseLock(scope)`, `pollForUpdates()`

#### Verification

- Start server: `npm run server` (Express on :3001)
- Start client: `npm run dev` (Vite on :5173, proxies /api to :3001)
- Open 2 browser tabs, set different user names
- Tab 1: enter edit mode on USD Pipeline → lock acquired
- Tab 2: try to edit same goal → sees "Alice is editing", unlock button disabled
- Tab 2: edit a different goal → works fine (different scope)
- Tab 1: make changes, exit edit mode → Tab 2 sees updated data on next poll
- Close Tab 1 without exiting edit → lock expires after 5 min, Tab 2 can then edit

---

## Key Technical Decisions

- **dagre config**: `rankdir: 'TB'` (top-to-bottom), `ranksep: 100`, `nodesep: 60` — RPG skill tree style flow
- **React Flow**: `nodesDraggable: false`, `nodesConnectable: false` — enforces organized layout
- **Cross-dept deps**: Show as grayed "external reference" nodes when viewing a single goal's tree
- **URL routing**: `/project/:id?view=tree|dashboard|timeline`, view param controls which of A/B/C is active
- **If dagre layout quality is poor**: Fall back to ELK (elkjs) which handles complex DAGs better
- **Concurrent editing**: Pessimistic locking at goal/tree scope, Express + SQLite backend, polling for updates, name tags instead of auth

## Visual Style

- **Dark theme** — dark gray/navy background with glowing nodes
- Done nodes: green glow, In-progress: blue/cyan glow, Available: white/light border, Locked: dim/grayed out
- Edges: subtle glowing lines, thick for critical path

## Delivery

- **Phase 1 first** — deliver Tech Tree view + mock data, get feedback, then continue to Dashboard/Timeline/Worker views

## Verification (Phase 1)

- Run `npm run dev`, navigate to a goal's Tech Tree view — nodes should auto-layout top-to-bottom with correct dependency edges
- Click a node → TaskDetailPanel shows prerequisites/unlocks
- Switch views via [A][B][C] buttons at any level
- Dashboard drill-down: Company → Project → Goal
- Timeline shows tasks as horizontal bars on time axis
