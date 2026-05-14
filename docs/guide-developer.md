# Developer Guide

Pipeline Tech Tree -- a task dependency graph and ticket management add-on for ShotGrid.

> For exhaustive architecture details, entity field definitions, and notification system internals, see [`CLAUDE.md`](../CLAUDE.md). This guide is the practical starting point.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Project Structure](#project-structure)
4. [Key Technical Patterns](#key-technical-patterns)
5. [Data Flow](#data-flow)
6. [ShotGrid Integration](#shotgrid-integration)
7. [Role-Based Access Control](#role-based-access-control)
8. [Priority System](#priority-system)
9. [Build and Validation](#build-and-validation)
10. [Common Gotchas](#common-gotchas)

---

## 1. Quick Start

**Prerequisites:** Node.js v20+ (Vite 8 requires ≥20.19), npm. Python 3.9+ if you'll exercise SG sync.

```bash
# Install dependencies
npm install

# Run both frontend and backend in parallel
npm run dev:all
```

This starts:
- **Frontend** (Vite) on `http://localhost:5173` -- proxies `/api` requests to the backend.
- **Backend** (Express) on `http://localhost:3001`.

To run them individually:

```bash
npm run dev      # Frontend only (Vite dev server, port 5173)
npm run server   # Backend only (tsx server/index.ts, port 3001)
```

If the backend is unavailable, the frontend falls back to mock data from `src/data/mockData.ts`.

### Containers (Docker / Podman)

For a production-like setup the repo ships two Dockerfiles and a Compose file:

```bash
docker compose up -d --build       # app on :3001 + sgEvent daemon sidecar
podman compose up -d --build       # same flags work
```

The app image bundles Node, Python (`shotgun_api3`), and the built frontend; the daemon image clones upstream `shotgunEvents` at build time and drops in our plugins. See **README → Container Deployment** for the full env-var matrix.

### Production-safety env vars to know about

- `SG_WRITE_DISABLED=1` — short-circuits the only two endpoints that write to SG (`/api/sg/update-task-{status,priority}`). Required for staging/test environments that share a SG site with prod.
- `DB_PATH` — per-environment SQLite file. `vitest.setup.ts` pins it to `./data.test.db` so tests cannot wipe `data.db`. Do not remove that setup file.
- `ADMIN_PASSWORD` and `SG_INTERNAL_SECRET` — default values (`admin2026`, `sg-internal-dev-secret`) are in source code and publicly visible. Always override in any non-toy deployment.

---

## 2. Architecture Overview

### Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript (~5.9), Vite 8, Tailwind CSS 4, Zustand 5, React Flow (@xyflow/react) |
| Backend | Express 5, better-sqlite3 |
| Graph layout | dagre (@dagrejs/dagre) |
| SG sync | Python (shotgun_api3), sgEventDaemon plugins |

### Data Model Hierarchy

```
Company --> Department --> Goal --> Task / Milestone
Company --> Project    --> Goal --> Task / Milestone
Department --> Worker  --> assigned Tasks
```

All entities have **bidirectional dependency links**. For example, `task.dependsOnTaskIds` and `task.unlocksTaskIds` are inverse arrays. Mutations must maintain both sides atomically -- the server handles this in SQLite transactions via `server/mutations.ts`.

### Frontend Views

Six top-level views, role-filtered, switched via ViewSwitcher in `App.tsx`:

| View | Description | Default landing for |
|------|-------------|---------------------|
| My Tasks | Active tasks, up-next queue, unlocks | Worker |
| Tech Tree | React Flow graph: goal-map (dept-level) and tech-tree (goal-level) | Coordinator |
| Dashboard | Company drill-down with progress stats, cross-view matrix | Admin |
| Timeline | Custom Gantt chart with dependency-based date scheduling |  |
| Workers | Worker list by department, detail with task queue | Admin/Coordinator only |
| Settings | Priority weights, calibration wizard, lead list, role management | Admin only |

---

## 3. Project Structure

```
ticket-dependency-graph/
  src/                          # Frontend (React)
    App.tsx                     # Root component, view switching, login gate
    main.tsx                    # Entry point
    index.css                   # CSS variables for dark theme (--color-*)
    types/
      index.ts                  # All entity types, enums, interfaces
    store/
      useStore.ts               # Main Zustand store (single source of truth)
      useNotificationStore.ts   # Notification + toast Zustand store
    hooks/
      usePermission.ts          # Centralized permission checks
    utils/
      priorityCalc.ts           # Five-dimension priority scoring
      graphLayout.ts            # dagre -> React Flow node positions
    components/
      dashboard/                # Dashboard view components
      layout/                   # ViewSwitcher, GoalSelector, header, panels
      settings/                 # Settings view (admin only)
      shared/                   # Shared components (FloatingTaskDetailPanel, etc.)
      tech-tree/                # Tech Tree view, TaskNode, MilestoneNode
      timeline/                 # Timeline/Gantt view
      worker/                   # Workers view, My Tasks view
    data/
      mockData.ts               # Fallback data when server unavailable
    pages/
      LoginPage                 # Login page with worker profile selection

  server/                       # Backend (Express)
    index.ts                    # Express server entry, port 3001
    routes.ts                   # All API routes, EDITOR_MUTATIONS gate, SG routes
    mutations.ts                # Bidirectional sync logic, SG upsert functions
    db.ts                       # SQLite schema, queries (entities + users + presence)

  sg-events-plugins/            # ShotGrid event daemon plugins (in-repo)
    ticket_plugin.py            # Ticket create/change/retire -> /api/sg/sync/task
    human_user_plugin.py        # User create/change/retire -> /api/sg/sync/worker
    project_plugin.py           # Project create/change/retire -> /api/sg/sync/project
    sg_common.py                # Shared post_to_app() helper with retry logic
    shotgunEventDaemon.conf.example  # Template with %(VAR)s env interpolation

  docker/
    daemon-entrypoint.sh        # Renders daemon conf from env vars at container start

  sg_client.py                  # SG client layer — every server-side SG operation
                                # shells out here via execFile (bootstrap, sync,
                                # list-statuses, list-projects, outbound writes)
  Dockerfile                    # App image (Node + Python + dist)
  Dockerfile.daemon             # SG event daemon sidecar image
  docker-compose.yml            # Both services with named volumes
  vitest.setup.ts               # Pins DB_PATH=./data.test.db before tests run
  vite.config.ts                # Vite config: React plugin, Tailwind plugin, /api proxy
  tsconfig.json                 # References tsconfig.app.json + tsconfig.node.json
  tsconfig.app.json             # Frontend TS config (strict, ES2023, verbatimModuleSyntax)
  tsconfig.node.json            # Vite/node TS config
  CLAUDE.md                     # Exhaustive architecture reference
```

---

## 4. Key Technical Patterns

### `import type` is mandatory

The project uses `verbatimModuleSyntax: true` in tsconfig. Vite/esbuild requires type-only imports to use the `import type` syntax:

```typescript
// Correct
import type { Task, Goal } from '../types';

// Wrong -- will fail
import { Task, Goal } from '../types';
```

### Zustand stable function refs

Store methods (e.g., `getAllUnplacedTasks`, `getProjectForGoal`) have **stable references that never change**. Using them as `useMemo` dependencies means the memo never recomputes. Subscribe to the **data slices** those methods read instead:

```typescript
// Wrong -- memo never recomputes
const tasks = useMemo(() => getAllUnplacedTasks(), [getAllUnplacedTasks]);

// Correct -- recomputes when tasksMap changes
const tasks = useMemo(() => getAllUnplacedTasks(), [tasksMap]);
```

### Optimistic mutations

Local Zustand state updates first, then an async `serverMutation()` call fires to the server. The server response reconciles state on the next poll cycle. Mutations are enriched with `userName`, `role`, and `userWorkerId` from the store.

### CSS variables for theming

Dark theme colors are defined in `src/index.css` as `--color-*` CSS variables. Components use **inline styles with CSS vars**, not Tailwind utility classes:

```tsx
<div style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
```

### `addGoal` backfill

`addGoal` auto-sets `departmentId = parentId` for department-parented goals. When rendering cross-reference badges, guard against this:

```typescript
// Only show cross-ref badge if it's genuinely a secondary association
if (goal.projectId && goal.projectId !== goal.parentId) { ... }
```

### DB query ORDER BY is load-bearing

Both `getAllEntities` and `getChangedEntitiesSince` in `server/db.ts` use `ORDER BY table_name, id`. SQLite's `INSERT OR REPLACE` reorders rows, so without `ORDER BY` the `Map.keys()` iteration order is non-deterministic. This breaks fallback logic in `App.tsx` that picks the first department via `Array.from(departmentsMap.keys())[0]`.

### GoalMapView double-click

React Flow's `elementsSelectable={false}` silently suppresses `onNodeDoubleClick`. Double-click is implemented via a timestamp ref in `onNodeClick` with a 300ms window. Do **not** add `onNodeDoubleClick` -- it will not fire.

### Null safety for worker data

DB may store `activeTaskId` (singular string, old format) while the frontend expects `activeTaskIds` (array). Always guard:

```typescript
const active = worker.activeTaskIds ?? [];
```

### CalibrationWeights migration guard

Older stored data may lack the `goal` key. Always guard when reading weights:

```typescript
const w = weights && 'goal' in weights ? weights : DEFAULT_WEIGHTS;
```

### ReactFlow applyNodeChanges cast

`applyNodeChanges` returns a generic type that needs explicit casting:

```typescript
applyNodeChanges(changes, nodes) as Node<TaskNodeData>[]
```

---

## 5. Data Flow

```
User action
    |
    v
Zustand store (optimistic local update)
    |
    v
serverMutation() --- async POST /api/entities/:table/:id --->  Express server
                                                                    |
                                                                    v
                                                                SQLite DB
                                                                (entities table:
                                                                 table_name, id,
                                                                 data JSON, updated_at)
    |
    v
Polling (every 5s): GET /api/poll?since=<timestamp>
    |
    v
Zustand store reconciles with server state
```

Key details:

- **Single source of truth:** the Zustand store in `src/store/useStore.ts`.
- **Entity maps:** `Map<string, T>` for each entity type (tasks, goals, workers, etc.).
- **Polling interval:** 5 seconds via `GET /api/poll?since=<ts>`. Returns only entities changed since the given timestamp.
- **Server storage:** a single `entities` table with JSON blobs -- no ORM, no migrations. Schema: `(table_name, id, data, updated_at)`.
- **Bidirectional sync:** `server/mutations.ts` wraps dependency updates in SQLite transactions so both sides of a link are always consistent.
- **Presence system:** `presence` table with `(scope, user_name)` composite PK, 3-minute heartbeat timeout.
- **Edit locks:** pessimistic locking at goal/tree scope, 5-minute auto-expiry.

---

## 6. ShotGrid Integration

The Node server has no ShotGrid SDK. **Every server-side SG operation shells out to `sg_client.py` via `execFile`**, including the Settings → SG Import UI buttons, the status/project pickers, and outbound ticket writes. The companion live-event path is the **sgEvent daemon** (separate process) which forwards SG events to the app's `/api/sg/sync/*` endpoints over HTTP.

### `sg_client.py` subcommands

```bash
python sg_client.py bootstrap                            # Full pull
python sg_client.py sync-projects [--statuses=...]
python sg_client.py sync-tickets [--statuses=...] [--project-ids=...]
python sg_client.py sync-workers
python sg_client.py sync-{project,worker,ticket}-by-id --id=N
python sg_client.py list-statuses                        # JSON to stdout
python sg_client.py list-projects                        # JSON to stdout
python sg_client.py update-ticket-status --id=N --status=VALUE   # WRITES to SG
python sg_client.py update-ticket-priority --id=N --priority=1-5 # WRITES to SG
```

The only two subcommands that mutate SG are `update-ticket-status` and `update-ticket-priority` — they're invoked by `/api/sg/update-task-status` and `/api/sg/update-task-priority` and gated by `SG_WRITE_DISABLED=1`.

### Live daemon sync (continuous)

Plugins live in `sg-events-plugins/`. For bare-metal: clone upstream `shotgunEvents` and copy our plugins into `shotgunEvents/src/`. For containers: `Dockerfile.daemon` does the clone + copy automatically.

| Plugin | SG Events | Endpoints |
|--------|-----------|-----------|
| `ticket_plugin.py` | Ticket New/Change/Retirement/Revival | `/api/sg/sync/task`, `/api/sg/archive/task` |
| `human_user_plugin.py` | HumanUser New/Change/Retirement | `/api/sg/sync/worker`, `/api/sg/archive/worker` |
| `project_plugin.py` | Project New/Change/Retirement | `/api/sg/sync/project`, `/api/sg/archive/project` |

### Outbound writes

Two store methods push changes back to SG for `syncSource: 'sg'` tasks (`src/store/useStore.ts`):

- **`syncTaskStatusToSg`** — fires on any status change. Maps `TaskStatus` → SG `sg_status_list` value via `mapTaskStatusToSg()` → POSTs to `/api/sg/update-task-status` → server shells out to `sg_client.py update-ticket-status`.
- **`syncTaskPriorityToSg`** — fires on status change when `sgPriorityAutoSync` is true. Re-computes priority over full store state, maps 0–100 → SG 5–1 (inverse).

Both are fire-and-forget (SG is corrected on next inbound event). Both bail at the server when `SG_WRITE_DISABLED=1` is set.

### Configurable status mapping

The TaskStatus → SG code mapping for outbound writes is **persisted in the `meta` table** (key `sg_status_map`) and edited from Settings → SG → "Status Mapping (Outbound)".

- Server defaults are in `DEFAULT_SG_STATUS_MAP` (`server/routes.ts`).
- Frontend loads from `/api/sg/status-map` on every `fetchState()` and stores it in `useStore.sgStatusMap`.
- The dropdown options in the UI are populated live from `/api/sg/list-statuses` (real SG site, no hardcoded codes user-facing).

### Project filter for ticket imports

Tickets import card in Settings → SG has a Projects filter populated live from `/api/sg/list-projects`. When narrower than all-selected, the chosen IDs are sent to `/api/sg/trigger-sync` and added to the `sync-tickets --project-ids=...` argv. Import-time only — the live daemon still forwards every ticket event regardless of project.

### Entity ID convention

SG-synced entities always have ID format `sg-{sgId}` and `syncSource: 'sg'`.

### Source-of-truth split (projects)

On re-sync, SG only overwrites its owned fields (`name`, `description`, `startDate`, `endDate`, `durationDays`, `sgProjectId`, `syncSource`). Local fields are preserved: `strategicPriority`, `status`, `contributingDepartmentIds`, `goalIds`, `milestoneIds`.

### Inbound SG → TaskStatus mapping

Keyword substring match (case-insensitive), first match wins, falls back to `locked`:

| Keywords | TaskStatus |
|----------|-----------|
| resolved, closed, final, done, complete | `completed` |
| in progress, in_progress, ip, working | `in_progress` |
| wait, ready, open, new, rev | `available` |
| block, hold | `blocked` |
| pause, stop | `paused` |

### SG role mapping

`permissionGroup` from SG maps to local role: Artist -> `worker`, Manager -> `coordinator`, Admin -> `admin`, anything else -> `worker`.

### Required environment variables

Daemon-facing SG routes (`/api/sg/sync/*`, `/api/sg/archive/*`, `/api/sg/update-task-*`) require `x-sg-secret`. UI-facing SG routes (`/api/sg/trigger-*`, `/api/sg/list-*`, `/api/sg/status-map`) require `adminPassword` in the body.

```bash
# Core (app server)
PORT=3001
DB_PATH=./data.db                # per-env override; tests pin to data.test.db
SERVE_STATIC=                    # 1 in container; serves dist/ + SPA fallback
SG_WRITE_DISABLED=               # 1 in any env that must not write to SG
PYTHON_CMD=python3
ADMIN_PASSWORD=                  # CHANGE — default 'admin2026' is in source

# Shared (app + daemon plugins)
SG_INTERNAL_SECRET=              # CHANGE — default in source is public
APP_API_URL=http://localhost:3001
VITE_SG_INTERNAL_SECRET=         # baked into JS at build; equals SG_INTERNAL_SECRET

# Bootstrap + outbound update-ticket calls
SG_URL=                          # e.g., https://your-site.shotgrid.autodesk.com
SCRIPT_NAME=
API_KEY=

# Daemon-only
SG_ED_SITE_URL=        SG_ED_SCRIPT_NAME=        SG_ED_API_KEY=
SGDAEMON_TICKET_NAME=     SGDAEMON_TICKET_KEY=
SGDAEMON_HUMANUSER_NAME=  SGDAEMON_HUMANUSER_KEY=
SGDAEMON_PROJECT_NAME=    SGDAEMON_PROJECT_KEY=
SG_ED_EMAIL_ENABLED=false        # daemon ERROR alerts via SMTP; default off
```

---

## 7. Role-Based Access Control

Three roles: **Admin**, **Coordinator**, **Worker** (defined in `src/types/index.ts: UserRole`).

| Capability | Admin | Coordinator | Worker |
|------------|:-----:|:-----------:|:------:|
| Settings access | x | | |
| Role management | x | | |
| Edit tasks/priorities | x | x | |
| View Workers page | x | x | |
| Update own task status | x | x | x |

### How it works

- **Admin is session-only.** Granted via password upgrade (`POST /api/auth/upgrade-admin`). Never persisted to DB. Stored in Zustand memory + localStorage during session. The `adminPassword` field is held in the store for subsequent admin-gated requests.
- **Worker and Coordinator roles** are stored in the `users` DB table (`name`, `role`, `created_at`). Set by admin via Settings role management.
- **`usePermission` hook** (`src/hooks/usePermission.ts`) is the single point for permission checks. All components use this -- never check role directly.
- **Server-side gate:** `EDITOR_MUTATIONS` set in `server/routes.ts` restricts write operations. Workers can only update `status`, `startedAt`, `completedAt` on tasks. Admin role is trusted from `body.role` since it is password-verified.
- **Login flow:** `LoginPage` shows worker profiles with DB role badges and a role filter (All/Worker/Coordinator). No user creation or role selection at login.

---

## 8. Priority System

Five-dimension weighted scoring producing a 0-100 score per task.

### Default weights

| Factor | Weight | Source |
|--------|--------|--------|
| Project | 30% | `Project.strategicPriority` (P1/P2/P3); max across `task.relatedProjectIds` |
| Department | 10% | `Department.priority` (P1/P2/P3); max across `task.relatedDepartmentIds` |
| Goal | 20% | `Goal.departmentPriority` (1-3) |
| Creator | 10% | `Worker.isLead` (lead=100, other=50) |
| Graph | 30% | Backward propagation: downstream count, critical path, status |

### Key details

- **`computeTaskPriorities()`** in `src/utils/priorityCalc.ts` accepts maps of tasks, milestones, goals, departments, and optional weight/priority overrides.
- **Weights are configurable** in Settings via manual sliders or a calibration wizard. Stored as `CalibrationWeights` in Zustand.
- **Priority override:** tasks support `priorityOverride` -- a frozen score with reason and snapshot that bypasses computation entirely.
- **Archived tasks** are skipped during priority computation.

---

## 9. Build and Validation

```bash
npm run build         # tsc -b && vite build (type-check + production bundle)
npm run lint          # eslint .
npm run preview       # Serve production build locally
npm run test          # Vitest watch mode
npm run test:run      # Vitest single run
npm run test:coverage # Vitest with coverage report (v8)
npm run test:e2e      # Playwright

# Single test file
npx vitest run server/__tests__/mutations.test.ts
```

The tsconfig is strict: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`.

Test files live in `server/__tests__/` (Node environment, better-sqlite3 against a separate file) and `src/**/__tests__/` (jsdom). E2E specs are in `e2e/` (Playwright, requires dev servers).

### Test isolation — load-bearing

- **`vitest.setup.ts`** runs before any module loads and sets `DB_PATH=./data.test.db` and `SG_WRITE_DISABLED=1`. This is the only thing preventing `server/__tests__/mutations.test.ts` (which calls `DELETE FROM entities` in `beforeEach`) from wiping `data.db` if you accidentally run tests in a production environment. **Do not remove this file or its reference in `vitest.config.ts`.**
- **`playwright.config.ts`** passes the same env vars to the dev server it spawns. **Caveat:** `reuseExistingServer: true` means an already-running `npm run dev:all` is reused with its original env. Before `npm run test:e2e` against a server pointing at real SG creds, stop the dev server first or start it yourself with the test env applied.

---

## 10. Common Gotchas

1. **Missing `import type`** -- forgetting the `type` keyword on type-only imports causes build failures. The `verbatimModuleSyntax` tsconfig option enforces this.

2. **Zustand methods as useMemo deps** -- store functions have stable refs and will never trigger recomputation. Use the data maps (`tasksMap`, `goalsMap`, etc.) as dependencies instead.

3. **Removing ORDER BY from DB queries** -- `INSERT OR REPLACE` in SQLite reorders rows. The `ORDER BY table_name, id` in `server/db.ts` is load-bearing for deterministic entity map iteration.

4. **Adding `onNodeDoubleClick` to GoalMapView** -- React Flow suppresses it when `elementsSelectable={false}`. Double-click is handled via a timestamp ref in `onNodeClick` (300ms window).

5. **Worker `activeTaskIds` null safety** -- old data may have `activeTaskId` (singular string). Always access via `worker.activeTaskIds ?? []`.

6. **CalibrationWeights without `goal` key** -- older stored weights lack the `goal` field. Always guard: `weights && 'goal' in weights ? weights : DEFAULT_WEIGHTS`.

7. **Bidirectional dependency edits** -- when mutating `dependsOnTaskIds` or `unlocksTaskIds`, both sides must be updated atomically. Use the server mutation functions in `server/mutations.ts` rather than raw DB writes.

8. **`addGoal` cross-ref badge** -- `addGoal` backfills `departmentId = parentId` for dept-parented goals. Cross-ref badge rendering must check `goal.projectId !== goal.parentId` to avoid false positives.

9. **ReactFlow `applyNodeChanges` typing** -- the return type needs an explicit `as Node<T>[]` cast or TypeScript will complain.

10. **Admin role in DB** -- admin is never stored in the DB. If you see admin-gated logic assuming a DB lookup, it will fail. Admin is session-only, verified by password.

11. **SG source-of-truth split** -- re-syncing a project from SG overwrites only SG-owned fields. Local fields (`strategicPriority`, `goalIds`, etc.) are preserved. Writing to SG-owned fields from the app will be overwritten on next sync.

12. **Archived entities in Tech Tree** -- `getTasksForGoal` intentionally includes archived tasks so dependency edges render correctly. All other views and computations must filter `!t.archived`.

13. **`sg_client.py` is not just bootstrap** -- despite the historical name (it was previously `sg_bootstrap.py`), this script is the SG client layer the Node server shells out to for every SG operation. The UI's Import buttons, status/project pickers, and outbound writes all go through here. Don't introduce a parallel SG-talking codepath.

14. **`SG_WRITE_DISABLED` only gates outbound writes** -- it short-circuits `/api/sg/update-task-status` and `/api/sg/update-task-priority` so they return `{ skipped: true }` without invoking Python. It does NOT block the daemon-facing inbound endpoints (`/api/sg/sync/*`) — those write to local DB only, never to SG.

15. **Don't add `SERVE_STATIC` checks to dev workflows** -- the env var triggers `express.static(dist)` + SPA fallback. In `npm run dev:all`, Vite serves the frontend on :5173 and proxies `/api` to Express; if you enable `SERVE_STATIC` in dev, you'll get stale `dist/` HTML at `localhost:3001/` and confuse yourself.

---

*For the full architecture reference including notification system internals, entity field definitions, and SG API route details, see [`CLAUDE.md`](../CLAUDE.md).*
