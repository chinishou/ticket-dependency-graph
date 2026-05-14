# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development — runs both frontend (Vite :5173) and backend (Express :3001)
npm run dev:all

# Individual servers
npm run dev          # Frontend only — proxies /api to :3001
npm run server       # Backend only (tsx server/index.ts)

# Build & check
npm run build        # tsc -b && vite build (produces dist/ for static serve)
npm run lint         # eslint .
npm run preview      # Preview production build

# Testing
npm run test         # Vitest watch mode
npm run test:run     # Vitest single run
npm run test:coverage
npm run test:e2e     # Playwright (uses dev server it spawns)

# Single test file
npx vitest run server/__tests__/mutations.test.ts
npx vitest run src/utils/__tests__/priorityCalc.test.ts

# Containers — work identically with podman build / podman compose
docker build -t ticket-dep-graph:latest .                # app image
docker build -f Dockerfile.daemon -t ticket-dep-graph-daemon:latest .
docker compose up -d --build                             # both services + volumes
```

## ⚠️ Production Safety

Three things can damage real data and must not be discovered the hard way:

1. **Vitest's `mutations.test.ts` calls `DELETE FROM entities` in `beforeEach`.** `vitest.setup.ts` pins `DB_PATH=./data.test.db` before any module loads — **never remove this setup file or its reference in `vitest.config.ts`**.
2. **E2E `task-update.spec.ts` clicks "Mark Complete" on a real task.** If the task is SG-synced and the dev server has no `SG_WRITE_DISABLED=1`, the app pushes the status change to live SG. `playwright.config.ts` sets the env var only for the server it spawns — already-running `npm run dev:all` instances ignore it.
3. **Default secrets are public.** `ADMIN_PASSWORD=admin2026` and `SG_INTERNAL_SECRET=sg-internal-dev-secret` are hardcoded fallbacks in source. Override both in any non-toy deployment.

`SG_WRITE_DISABLED=1` short-circuits **the only two paths that mutate SG**: `/api/sg/update-task-status` and `/api/sg/update-task-priority` in `server/routes.ts`. Everything else reads SG or writes only to local SQLite.

## Architecture

**Pipeline team ticket system and tech tree** — add-on to ShotGrid (SG) that adds cross-project associations, goal-based organization, and task dependency graphs that SG's single-project-per-ticket model cannot represent. All workers are assumed to be pipeline team.

### Data Model Hierarchy

```
Company → Department → Goal → Task / Milestone
Company → Project  → Goal → Task / Milestone
Department → Worker → assigned Tasks
```

All entities have bidirectional dependency links (e.g., `task.dependsOnTaskIds` ↔ `task.unlocksTaskIds`). Mutations must maintain both sides atomically.

### Frontend (src/)

- **React 19 + TypeScript + Vite** with Tailwind CSS
- **Zustand store** (`src/store/useStore.ts`) — single source of truth. Entity maps (`Map<string, T>`), optimistic mutations that fire-and-forget to server, polling for remote changes.
- **6 top-level views** switched via ViewSwitcher in `App.tsx` (role-filtered):
  - **F: My Tasks** — Worker-focused view: active tasks, up-next queue, unlocks. Worker landing page.
  - **A: Tech Tree** — React Flow + dagre auto-layout (`rankdir: 'TB'`). Custom `TaskNode`/`MilestoneNode`. `nodesDraggable: false` enforced. Sub-views: goal-map (department-level) and tech-tree (goal-level). Coordinator landing page (goal-map sub-view). `GoalMapView` has a `ParentSelector` pill bar above it to switch between departments (purple) and active projects (blue).
  - **B: Dashboard** — Drill-down: Company → Project/Department cards with progress stats. Sub-views: `company`, `project`, `department`, `cross`. The `cross` sub-view (`CrossView`) renders a Department × Project matrix table showing task counts, progress, and goal pills per cell. Inline P1/P2/P3 priority buttons (coordinator+ only). Admin landing page.
  - **C: Timeline** — Custom Gantt with dependency-based date scheduling, month axis, today marker.
  - **D: Workers** — Worker list by department, detail with active tasks, unlocks, priority-sorted queue. Admin/coordinator only.
  - **E: Settings** — Priority weight sliders, calibration wizard, lead list, role management, SG import/sync, SG status mapping, log viewer. Admin only.
- **Graph layout** (`src/utils/graphLayout.ts`) — dagre → React Flow node positions with explicit child ordering for deterministic layouts.

### Priority System (`src/utils/priorityCalc.ts`)

Five-dimension weighted scoring (0-100):

| Factor | Source | Scale |
|--------|--------|-------|
| **Project** (default 30%) | `Project.strategicPriority` (P1/P2/P3); uses max across `task.relatedProjectIds` | P1=100, P2=67, P3=33 |
| **Department** (default 10%) | `Department.priority` (P1/P2/P3); uses max across `task.relatedDepartmentIds` | P1=100, P2=67, P3=33 |
| **Goal** (default 20%) | `Goal.departmentPriority` (1-3) | 1=100, 2=67, 3=33 |
| **Creator** (default 10%) | `Worker.isLead` | lead=100, other=50 |
| **Graph** (default 30%) | Backward propagation: downstream count, critical path, status | 0-100 computed |

- Weights configured in Settings (manual sliders or calibration wizard), stored as `CalibrationWeights` in Zustand.
- `computeTaskPriorities()` accepts maps of tasks, milestones, goals, departments, and optional weight/priority overrides.
- Tasks support `priorityOverride` — a frozen score that bypasses computation.
- When consuming stored `CalibrationWeights`, guard for migration: `weights && 'goal' in weights ? weights : DEFAULT_WEIGHTS` (older data may lack the `goal` key).
- **`sgPriorityAutoSync`** (store flag, default `false`) — when true, `updateTask()` calls `syncTaskPriorityToSg()` after any status change. Requires `computeTaskPriorities()` over full store state to derive the current score.

### Role-Based Access Control

Three roles: **Admin**, **Coordinator**, **Worker** (`src/types/index.ts: UserRole`).

| Capability | Admin | Coordinator | Worker |
|------------|-------|-------------|--------|
| Settings access | ✓ | | |
| Role management | ✓ | | |
| Edit tasks/priorities | ✓ | ✓ | |
| View Workers page | ✓ | ✓ | |
| Update own task status | ✓ | ✓ | ✓ |

**Key design decisions:**
- **Admin is session-only** — granted via password upgrade (`POST /api/auth/upgrade-admin`), never persisted to DB. Stored only in Zustand memory + localStorage (cleared on reload init if found). Password stored in `adminPassword` store field during session.
- **Worker/Coordinator roles are predefined in DB** — `users` table with `role` column. Set by admin via Settings role management (requires `adminPassword` in request).
- **`usePermission` hook** (`src/hooks/usePermission.ts`) — centralized permission checks. All components use this instead of checking role directly.
- **Login flow** — single `LoginPage` component at App level. Shows worker profiles with DB role badges and role filter (All/Worker/Coordinator). No user creation or role selection at login.
- **`UserTagPicker`** — display-only (name + role badge), sign out, and admin upgrade. No user switching.
- **Server-side validation** — `EDITOR_MUTATIONS` set in `server/routes.ts` gates write operations. Workers can only update `status`, `startedAt`, `completedAt` on tasks. Admin role trusted from client `body.role` since it's password-verified.

**Null safety for worker data:** DB may store `activeTaskId` (singular string) from old format while frontend expects `activeTaskIds` (array). Always guard with `worker.activeTaskIds ?? []`.

### Backend (server/)

- **Express 5 + better-sqlite3** on port 3001 (override via `PORT` env var; honored by `server/index.ts`).
- **Single `entities` table** with JSON blobs: `(table_name, id, data, updated_at)` — no ORM, no migrations.
- **`users` table** — `(name, role, created_at)`. Roles: `worker` or `coordinator` only (admin never stored).
- **`meta` table** — generic key/value store. `last_modified` for polling, `sg_status_map` for the outbound SG status mapping. Use `getMeta`/`setMeta` helpers in `server/db.ts`.
- **Bidirectional sync** in `server/mutations.ts` — updating one side of a dependency automatically updates the other side, wrapped in SQLite transactions. Supports `updateTask`, `updateMilestone`, `updateGoal`, `updateDepartment`, `updateProject`, `updateWorker`, `addGoal`, `addMilestone`, `addTaskToGoal`, `removeTaskFromGoal`, `removeGoal`, `removeMilestoneFromGoal`.
- **DB query ordering** — both `getAllEntities` and `getChangedEntitiesSince` in `server/db.ts` use `ORDER BY table_name, id`. This is load-bearing: `INSERT OR REPLACE` in SQLite reorders rows, so without `ORDER BY` the `Map.keys()` order is non-deterministic, which breaks fallback logic in `App.tsx` that uses `Array.from(departmentsMap.keys())[0]`.
- **Presence system** — `presence` table with `(scope, user_name)` composite PK, 3-minute heartbeat timeout. Cleanup on sign-out captures `userName` in closure (store may already be null at cleanup time).
- **Edit locks** — pessimistic at goal/tree scope, 5-minute auto-expiry.
- **Polling** — clients call `GET /api/poll?since=<ts>` every 30s by default (configurable via `VITE_POLL_INTERVAL` env var in ms).
- **Static serving** — when `SERVE_STATIC=1` or `NODE_ENV=production`, Express also serves the built `dist/` directory with SPA fallback for non-`/api` paths. Dev mode (`npm run dev:all`) leaves it off so Vite handles the frontend on :5173.
- **Graceful shutdown** — `SIGTERM`/`SIGINT` handlers in `server/index.ts` stop accepting connections, drain in-flight requests, call `db.close()` (WAL checkpoint), and exit within 8 s. Important for clean container restarts.
- Vite proxies `/api` to the Express server in dev mode (configured in `vite.config.ts`).

### Notification System

Event-driven notification system with per-user persistence and toast alerts.

**Architecture:**
- **`useNotificationStore`** (`src/store/useNotificationStore.ts`) — separate Zustand store managing notifications and toasts. Initialized via `initNotifications()` on login/reconnect.
- **`Notification` type** (`src/types/index.ts`) — `id`, `type`, `title`, `message`, `priority`, `timestamp`, `read`, optional `entityType`, `userName`, `targetUserIds`.
- **Per-user localStorage** — notifications keyed by `tech-tree-notifications-{workerId}`. Targeted notifications written to each target user's storage so they see them on next login. Max 100 per user.
- **Toast system** — `addToast()` creates ephemeral 5-second popups via `NotificationToast` component (bottom-right corner).
- **`NotificationCenter`** — bell icon in header bar with unread count badge. Dropdown panel with mark-as-read, mark-all-read, and clear-all actions.
- **`FloatingTaskDetailPanel`** — slide-in panel showing task details when a task is selected from Workers, Timeline, or My Tasks views. Includes "Go to Tech Tree" navigation button.

**Notification types** (`NotificationType`):
| Type | Trigger | Priority |
|------|---------|----------|
| `task_assigned` | Worker assigned to task | medium |
| `task_status_changed` | Task status transitions | medium |
| `task_completed` | Task marked completed | low |
| `dependency_completed` | Upstream task completed, unlocking downstream | medium |
| `milestone_unlocked` | Milestone unlocked | high |
| `lock_acquired` / `lock_released` | Edit lock acquired/released | medium/low |
| `priority_overridden` / `priority_override_lifted` | Manual priority override set/removed | high/medium |
| `calibration_changed` | Priority calibration weights updated | high |

**Integration points in `useStore`:**
- `updateTask()` — emits `task_status_changed`, `task_completed`, `dependency_completed` (for downstream locked tasks), and `task_assigned` (for newly added workers).
- `updateMilestone()` — emits `milestone_unlocked` when milestone transitions to unlocked.
- `acquireLock()` / `releaseLock()` — emits `lock_acquired` / `lock_released`.
- `setPriorityOverride()` / `liftPriorityOverride()` — emits `priority_overridden` / `priority_override_lifted`.
- `setCalibrationWeights()` — emits `calibration_changed`.

**Targeting:** Notifications include optional `targetUserIds` (worker IDs). `isNotificationRelevant()` filters the notification list to show only broadcast (no targets) or targeted-to-current-user notifications.

### Key Patterns

- **`import type`** is required for type-only imports (Vite/esbuild constraint).
- **Optimistic mutations** — local Zustand state updates first, then async `serverMutation()` call enriched with `userName`, `role`, `userWorkerId`. Server response reconciles state.
- **CSS variables** for theming — dark theme colors defined in `src/index.css` as `--color-*` vars. No Tailwind utility classes in components; inline styles with CSS vars throughout.
- **Mock data fallback** — store initializes from `src/data/mockData.ts` if server is unavailable.
- **Cross-view task selection** — `selectedTaskId` in Zustand store enables selecting a task from Workers, Timeline, or My Tasks views and viewing details in `FloatingTaskDetailPanel`. "Go to Tech Tree" button navigates to the task's goal tech tree with the task highlighted.
- **Auto worker-ID linking** — `setUserName()` and `fetchState()` automatically match the logged-in user's name to a `Worker` entity and set `userWorkerId` in store + localStorage.
- **EntrySource breadcrumb** (`App.tsx`) — `EntrySource` discriminated union `{ from: 'goal-map' } | { from: 'project-dashboard'; projectId } | { from: 'dept-dashboard'; deptId } | { from: 'cross-view' }` tracks how the user navigated into the tech-tree view. `handleBreadcrumbBack()` uses it to navigate back to the correct origin.
- **Zustand stable function refs** — Store methods (e.g. `getAllUnplacedTasks`, `getProjectForGoal`) have stable references that never change. Using them directly as `useMemo` deps means the memo **never recomputes**. Instead, subscribe to the data slices those methods read (e.g. `tasksMap`) and derive inline.
- **GoalSelector grouping** (`src/components/layout/GoalSelector.tsx`) — Groups goals into `<optgroup>` elements: `Dept: name` for department-parented goals (sorted by `departmentPriority` then name), `Project: name` for project-parented goals. Ungrouped goals fall into `<optgroup label="Other">`.
- **`getGoalsForDepartment` / `getGoalsForProject`** (store) — Include both directly-parented goals and cross-ref goals (goals whose `departmentId`/`projectId` cross-ref points to the dept/project).
- **`getProjectForGoal`** (store) — Checks `goal.parentType === 'project'` first, then `goal.projectId` cross-ref, then falls back to a full project scan. Needed because cross-ref goals have a dept parent but a project association.

## Entity Types

Defined in `src/types/index.ts`: Company, Department, Project, Goal, Task, Milestone, Worker, Notification.

Key enums: `TaskStatus` (locked/available/in_progress/paused/completed/blocked), `StrategicPriority` (P1/P2/P3), `WorkerAvailability` (full/partial/unavailable).

**`GoalStatus`** (`src/types/index.ts`) — computed from child tasks: `completed | in_progress | blocked | available | empty`. Three helpers: `computeGoalStatus(goal, tasksMap)`, `getGoalStatusColor(status)`, `getGoalStatusGlow(status)`. Used in `GoalNode` for border color and status badge.

Key fields:
- `Department.priority: StrategicPriority` — department-level priority (P1/P2/P3), separate from goal priority.
- `Goal.departmentPriority: number` — goal-level priority within its department (1-3).
- `Goal.departmentId?: string` / `Goal.projectId?: string` — cross-reference fields. A dept-parented goal may have `projectId` set to mark it as cross-associated with a project, and vice versa. **Guard:** `addGoal` backfills `departmentId = parentId` for dept-parented goals, so cross-ref badge rendering must check `goal.projectId !== goal.parentId` (and same for `departmentId`) before treating it as a secondary association.
- `Task.relatedProjectIds?: string[]` / `Task.relatedDepartmentIds?: string[]` — multi-association: a task may contribute to several projects/departments beyond its primary goal's parent. Used by priority calc (max across all related) and `CrossView` matrix.
- `Worker.isLead?: boolean` — determines creator factor in priority calc. Managed via Settings lead list.
- `Worker.activeTaskIds: string[]` — multiple concurrent active tasks.
- `Worker.assignedTaskIds: string[]` — full queue including non-active.
- `Task.priorityOverride?: PriorityOverride` — manual score override with reason and snapshot.

**ShotGrid-synced fields** (set by SG sync only, never written by the app):
- `Task.sgTicketId`, `Task.sgProjectId`, `Task.sgStatus`, `Task.sgEstimate`, `Task.sgTimeLogged`, `Task.sgAssignedTo`
- `Task.unplaced?: boolean` — task has no goal placement yet. Visible in `GlobalUnplacedPanel` (global, opened from GoalMapView toolbar "Unplaced (N)" button, groups by `sgProjectName`) and `UnplacedTasksPanel` (per-goal, in TechTreeView).
- `Task.archived`, `Task.archivedAt`, `Task.syncSource` — same pattern on `Worker` and `Project`.
- `Worker.sgUserId`, `Worker.permissionGroup`, `Worker.role` — role derived from SG permission group.
- `Project.sgProjectId`, `Project.startDate`, `Project.endDate`, `Project.durationDays`.

**Archived entity semantics:**
- `archived: true` is a soft-delete; entity stays in DB and renders in the Tech Tree (muted, 40% opacity + folder badge) but is excluded from all other views, priority calculations, workload counts, and notification triggers.
- `getTasksForGoal` intentionally includes archived tasks so the Tech Tree can render them with their dependency edges intact.
- All other store getters and view components must filter `!t.archived`.

**GoalMapView double-click:** React Flow's `elementsSelectable={false}` silently suppresses `onNodeDoubleClick`. Double-click detection is implemented via a timestamp ref in `onNodeClick` (300ms window) — do not add `onNodeDoubleClick` back.

### Log System (`server/utils/logger.ts`, `src/components/settings/LogViewer.tsx`)

Server writes newline-delimited JSON to `logs/app.log`. Three log functions:
- `logRequest(method, path, statusCode, durationMs)` — HTTP request logs. Suppresses `/poll 304` (counts silently for daily summary instead).
- `logMutation(type, userName, entityId, success, error?, humanMessage?)` — stores structured context: `{ mutation, userName, entityId, success, humanMessage }`.
- `logSgSync(entityType, sgId, action, success, error?)` — stores `{ sgEntity, sgId, action, success }`.

**`buildHumanMessage(type, body)`** in `server/routes.ts` — called **before** the mutation runs so entity names are still in the DB for remove operations. Uses `entityName(table, id, fallback)` helper which calls `getEntity()` to resolve names (e.g. `goal-xxx` → `"My Goal"`). Produces messages like `wei chen created milestone "Test Milestone Alpha" in "test"` or `wei chen set ticket #1 status → in_progress`.

**LogViewer Readable mode** filters out pure HTTP request logs (entries where `ctx.method` present and no `humanMessage`/`mutation`), then renders structured chip rows. **Compact mode** shows all entries including HTTP requests, plain `humanMessage || message` text, no chips.

## ShotGrid Sync System

The Node server has no ShotGrid SDK; **every server-side operation that talks to SG shells out to `sg_client.py` via `execFile`**. This includes the UI's Settings → SG Import buttons (which POST to `/api/sg/trigger-sync` and `/api/sg/trigger-bootstrap`), the status/project dropdowns, and outbound ticket writes. There's no separate "bootstrap" workflow — the script is the SG client layer.

The companion live-event path is the **sgEvent daemon** (separate process), which forwards SG events to the app's `/api/sg/sync/*` endpoints over HTTP.

### `sg_client.py` subcommands

```bash
python sg_client.py bootstrap               # Full sync (default)
python sg_client.py sync-projects [--statuses=...]
python sg_client.py sync-workers
python sg_client.py sync-tickets [--statuses=...] [--project-ids=...]
python sg_client.py sync-ticket-by-id --id=N
python sg_client.py sync-worker-by-id --id=N
python sg_client.py sync-project-by-id --id=N
python sg_client.py update-ticket-status --id=N --status=VALUE   # writes to SG
python sg_client.py update-ticket-priority --id=N --priority=1-5 # writes to SG
python sg_client.py list-statuses                                # JSON metadata
python sg_client.py list-projects                                # JSON metadata
```

The only two subcommands that mutate SG are `update-ticket-status` and `update-ticket-priority`. Both are routed through `/api/sg/update-task-*` endpoints and gated by `SG_WRITE_DISABLED`.

### Daemon plugins (`sg-events-plugins/`)

| Plugin | SG Events | App Endpoints |
|--------|-----------|---------------|
| `ticket_plugin.py` | `Shotgun_Ticket_New/Change/Retirement/Revival` | `/api/sg/sync/task`, `/api/sg/archive/task` |
| `human_user_plugin.py` | `Shotgun_HumanUser_New/Change/Retirement` | `/api/sg/sync/worker`, `/api/sg/archive/worker` |
| `project_plugin.py` | `Shotgun_Project_New/Change/Retirement` | `/api/sg/sync/project`, `/api/sg/archive/project` |
| `sg_common.py` | — | Shared `post_to_app()` helper (retry with 4xx-break) |

The daemon image (`Dockerfile.daemon`) clones upstream `shotgunEvents` at build time and drops these plugins into `src/`. For bare-metal: users clone `shotgunEvents` themselves and copy plugins in.

### SG API Routes (all in `server/routes.ts`)

All `/api/sg/*` routes that the daemon hits require an `x-sg-secret` header matching `SG_INTERNAL_SECRET`. Routes that the UI hits use `adminPassword` in the body instead.

```
# Daemon-facing (x-sg-secret)
POST /api/sg/sync/task               body: SgTicketPayload + optional goalId
POST /api/sg/archive/task            body: { sgTicketId }
POST /api/sg/sync/worker             body: SgUserPayload
POST /api/sg/archive/worker          body: { sgUserId }
POST /api/sg/sync/project            body: SgProjectPayload
POST /api/sg/archive/project         body: { sgProjectId }
POST /api/sg/update-task-status      body: { sgTicketId, status }   ← writes to SG
POST /api/sg/update-task-priority    body: { sgTicketId, priority } ← writes to SG

# UI-facing (adminPassword)
GET  /api/sg/status                  → { url, configured, counts, lastModified }
GET  /api/sg/status-map              → { map, defaults }            (open)
POST /api/sg/status-map              body: { adminPassword, map }
POST /api/sg/list-statuses           body: { adminPassword }        → spawns Python
POST /api/sg/list-projects           body: { adminPassword }        → spawns Python
POST /api/sg/trigger-sync            body: { adminPassword, entity, statuses?, projectIds?, sgId? }
POST /api/sg/trigger-bootstrap       body: { adminPassword }
POST /api/sg/sync-departments        body: { adminPassword, departments }
POST /api/sg/bootstrap               body: { adminPassword, projects?, workers?, tickets? }
POST /api/sg/clear-sg-data           body: { adminPassword }
```

Entity IDs for SG-synced rows are always `sg-{sgId}`. The `syncSource: 'sg'` field marks them.

### Outbound SG sync (tech-tree → SG)

Two store methods push changes back to SG for `syncSource: 'sg'` tasks. Both send `x-sg-secret` via `VITE_SG_INTERNAL_SECRET` env var (falls back to dev secret).

- **`syncTaskStatusToSg(task)`** — called from `updateTask()` whenever status changes. Maps `TaskStatus` → SG `sg_status_list` value via `mapTaskStatusToSg()`. Calls `POST /api/sg/update-task-status` which shells out to `sg_client.py update-ticket-status`.
- **`syncTaskPriorityToSg(task)`** — called from `updateTask()` when status changes AND `sgPriorityAutoSync` is true. Calls `computeTaskPriorities()` with full store state, maps score (0–100) → SG priority (1–5, inverse: `Math.max(1, Math.min(5, 5 - Math.floor(score / 25)))`). Calls `POST /api/sg/update-task-priority` which shells out to `sg_client.py update-ticket-priority`.

Both are fire-and-forget (silent failure by design — SG sync is corrected on next inbound event). Both bail server-side when `SG_WRITE_DISABLED=1`.

### Configurable status mapping

The TaskStatus → SG `sg_status_list` mapping used for outbound writes is **persisted in the `meta` table** (key `sg_status_map`) and configured from Settings → SG → "Status Mapping (Outbound)".

- Server defaults are in `DEFAULT_SG_STATUS_MAP` (`server/routes.ts`): `completed`→`res`, `in_progress`→`ip`, `available`/`locked`→`opn`, `blocked`→`hold`, `paused`→`wtg`.
- Frontend mirrors them in `useStore.sgStatusMap` (initial value) and overwrites from `/api/sg/status-map` on every `fetchState()`.
- `mapTaskStatusToSg(status)` in the store reads from `sgStatusMap` with `'opn'` as ultimate fallback.
- The `SgStatusMap` component (`src/components/settings/SgStatusMap.tsx`) populates dropdown options from `POST /api/sg/list-statuses` (live SG site, no hardcoded codes user-facing) and flags codes that no longer exist in SG.

### Project filter for ticket imports

The Tickets card in Settings → SG → SG Import has a Projects filter populated live from `POST /api/sg/list-projects` (which runs `python sg_client.py list-projects`). When the user narrows the selection, `projectIds` is sent to `/api/sg/trigger-sync` and added to the `sync-tickets --project-ids=...` argv. When all projects are selected, no flag is passed (so newly-added SG projects auto-flow into future imports). This is **import-time only** — the live daemon still forwards every ticket event regardless of project.

### Source-of-truth split for Projects

`upsertProjectFromSg` only overwrites SG-owned fields (`name`, `description`, `startDate`, `endDate`, `durationDays`, `sgProjectId`, `syncSource`). On **re-sync of an existing project**, local fields are never touched: `strategicPriority`, `status`, `contributingDepartmentIds`, `goalIds`, `milestoneIds`. Defaults (`P2`, `active`, `[]`) only apply on **first create**.

### Status mapping inbound (`mapSgStatusToTaskStatus` in `server/mutations.ts`)

Keyword substring match (case-insensitive), first match wins, falls back to `'locked'`:

| Keywords | → TaskStatus |
|----------|-------------|
| resolved, closed, final, done, complete | `completed` |
| in progress, in_progress, ip, working | `in_progress` |
| wait, ready, open, new, rev | `available` |
| block, hold | `blocked` |
| pause, stop | `paused` |

### Role mapping (`upsertWorkerFromSg`)

`permissionGroup` string (from SG) → local `role`:  Artist → `worker` · Manager → `coordinator` · Admin → `admin` · anything else → `worker`.

## Container Deployment

Two images and a Compose file:

- **`Dockerfile`** → `ticket-dep-graph:latest`. Multi-stage build (`builder` compiles frontend + native bindings, `runtime` is `node:20-bookworm-slim` + Python + `shotgun_api3`). Non-root UID 10001. `SERVE_STATIC=1` and `DB_PATH=/data/data.db` baked as defaults. Healthcheck via Node `fetch` on `/api/state`.
- **`Dockerfile.daemon`** → `ticket-dep-graph-daemon:latest`. `python:3.12-slim-bookworm` base, clones upstream `shotgunEvents` at build time (`SHOTGUNEVENTS_REF` build-arg for pinning), drops the four plugin files into `src/`. Non-root UID 10002. `docker/daemon-entrypoint.sh` renders `shotgunEventDaemon.conf` from env vars via `sed` then `exec`s the daemon so PID 1 is Python.
- **`docker-compose.yml`** — both services, three named volumes (`tdg-data`, `tdg-logs`, `tdg-daemon-state`), `depends_on: condition: service_healthy` so the daemon waits for the app's healthcheck. The daemon's `APP_API_URL` is overridden to `http://app:3001` for in-cluster DNS.

Both images build identically under `docker build` and `podman build` — no BuildKit-only syntax is used. `.gitattributes` forces LF on shell scripts and Dockerfiles to prevent CRLF corruption from Windows clones.

## Test isolation

- **`vitest.setup.ts`** — runs before any test imports. Sets `DB_PATH=./data.test.db` and `SG_WRITE_DISABLED=1` so the destructive setup in `server/__tests__/mutations.test.ts` can never touch `data.db` and no outbound SG mutation can fire.
- **`vitest.config.ts`** — wires `setupFiles: ['./vitest.setup.ts']`. Without this, the tests would open `process.env.DB_PATH ?? 'data.db'`.
- **`playwright.config.ts`** — passes `SG_WRITE_DISABLED=1` and `DB_PATH=data.test.db` to its spawned web server. **Caveat:** `reuseExistingServer: true` means an already-running `npm run dev:all` instance is reused with its original env. Before running E2E, stop the dev server or start it with these vars yourself.

## Environment variables

```bash
# Core
PORT=3001                                  # honored by server/index.ts
DB_PATH=./data.db                          # separate file per environment
SERVE_STATIC=                              # set to 1 in production / container
NODE_ENV=                                  # production toggles JSON log output
PYTHON_CMD=python3                         # interpreter for sg_client.py subprocess
ADMIN_PASSWORD=                            # CHANGE — default 'admin2026' is in source

# Outbound SG writes — set to 1 in test/staging/CI/dev pointing at prod SG
SG_WRITE_DISABLED=

# Shared (app server + daemon plugins)
SG_INTERNAL_SECRET=                        # CHANGE — default in source is public
APP_API_URL=http://localhost:3001          # daemon overrides to http://app:3001 in compose
VITE_SG_INTERNAL_SECRET=                   # baked into JS bundle at build; equals SG_INTERNAL_SECRET

# Bootstrap script + outbound update-ticket calls
SG_URL=https://your-site.shotgrid.autodesk.com
SCRIPT_NAME=
API_KEY=

# Daemon-only (one script name+key per plugin from SG admin)
SG_ED_SITE_URL=        SG_ED_SCRIPT_NAME=        SG_ED_API_KEY=
SGDAEMON_TICKET_NAME=  SGDAEMON_TICKET_KEY=
SGDAEMON_HUMANUSER_NAME=  SGDAEMON_HUMANUSER_KEY=
SGDAEMON_PROJECT_NAME=  SGDAEMON_PROJECT_KEY=
SG_ED_EMAIL_ENABLED=false  # set true only with real SMTP server in conf
```
