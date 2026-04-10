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
npm run build        # tsc -b && vite build
npm run lint         # eslint .

# Preview production build
npm run preview
```

No test framework is configured. TypeScript type-checking (`tsc -b`) is the primary validation.

## Architecture

**VFX production task visualization app** — game-inspired tech tree UI for managing tasks, goals, milestones, and workers across departments and projects.

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
  - **A: Tech Tree** — React Flow + dagre auto-layout (`rankdir: 'TB'`). Custom `TaskNode`/`MilestoneNode`. `nodesDraggable: false` enforced. Sub-views: goal-map (department-level) and tech-tree (goal-level). Coordinator landing page (goal-map sub-view).
  - **B: Dashboard** — Drill-down: Company → Project/Department cards with progress stats. Inline P1/P2/P3 priority buttons (coordinator+ only). Admin landing page.
  - **C: Timeline** — Custom Gantt with dependency-based date scheduling, month axis, today marker.
  - **D: Workers** — Worker list by department, detail with active tasks, unlocks, priority-sorted queue. Admin/coordinator only.
  - **E: Settings** — Priority weight sliders, calibration wizard, lead list, role management. Admin only.
- **Graph layout** (`src/utils/graphLayout.ts`) — dagre → React Flow node positions with explicit child ordering for deterministic layouts.

### Priority System (`src/utils/priorityCalc.ts`)

Five-dimension weighted scoring (0-100):

| Factor | Source | Scale |
|--------|--------|-------|
| **Project** (default 25%) | `Project.strategicPriority` (P1/P2/P3) | P1=100, P2=67, P3=33 |
| **Department** (default 20%) | `Department.priority` (P1/P2/P3) | P1=100, P2=67, P3=33 |
| **Goal** (default 15%) | `Goal.departmentPriority` (1-3) | 1=100, 2=67, 3=33 |
| **Creator** (default 10%) | `Worker.isLead` | lead=100, other=50 |
| **Graph** (default 30%) | Backward propagation: downstream count, critical path, status | 0-100 computed |

- Weights configured in Settings (manual sliders or calibration wizard), stored as `CalibrationWeights` in Zustand.
- `computeTaskPriorities()` accepts maps of tasks, milestones, goals, departments, and optional weight/priority overrides.
- Tasks support `priorityOverride` — a frozen score that bypasses computation.
- When consuming stored `CalibrationWeights`, guard for migration: `weights && 'goal' in weights ? weights : DEFAULT_WEIGHTS` (older data may lack the `goal` key).

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

- **Express 5 + better-sqlite3** on port 3001
- **Single `entities` table** with JSON blobs: `(table_name, id, data, updated_at)` — no ORM, no migrations.
- **`users` table** — `(name, role, created_at)`. Roles: `worker` or `coordinator` only (admin never stored).
- **Bidirectional sync** in `server/mutations.ts` — updating one side of a dependency automatically updates the other side, wrapped in SQLite transactions. Supports `updateTask`, `updateMilestone`, `updateGoal`, `updateDepartment`, `updateProject`, `updateWorker`, `addGoal`, `addMilestone`, `addTaskToGoal`, `removeTaskFromGoal`.
- **Presence system** — `presence` table with `(scope, user_name)` composite PK, 3-minute heartbeat timeout. Cleanup on sign-out captures `userName` in closure (store may already be null at cleanup time).
- **Edit locks** — pessimistic at goal/tree scope, 5-minute auto-expiry.
- **Polling** — clients call `GET /api/poll?since=<ts>` every 5s for changes.
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

## Entity Types

Defined in `src/types/index.ts`: Company, Department, Project, Goal, Task, Milestone, Worker, Notification.

Key enums: `TaskStatus` (locked/available/in_progress/paused/completed/blocked), `StrategicPriority` (P1/P2/P3), `WorkerAvailability` (full/partial/unavailable).

Key fields:
- `Department.priority: StrategicPriority` — department-level priority (P1/P2/P3), separate from goal priority.
- `Goal.departmentPriority: number` — goal-level priority within its department (1-3).
- `Worker.isLead?: boolean` — determines creator factor in priority calc. Managed via Settings lead list.
- `Worker.activeTaskIds: string[]` — multiple concurrent active tasks.
- `Worker.assignedTaskIds: string[]` — full queue including non-active.
- `Task.priorityOverride?: PriorityOverride` — manual score override with reason and snapshot.

**ShotGrid-synced fields** (set by SG sync only, never written by the app):
- `Task.sgTicketId`, `Task.sgProjectId`, `Task.sgStatus`, `Task.sgEstimate`, `Task.sgTimeLogged`, `Task.sgAssignedTo`
- `Task.unplaced?: boolean` — task has no goal placement yet; visible in `UnplacedTasksPanel` in the Tech Tree view.
- `Task.archived`, `Task.archivedAt`, `Task.syncSource` — same pattern on `Worker` and `Project`.
- `Worker.sgUserId`, `Worker.permissionGroup`, `Worker.role` — role derived from SG permission group.
- `Project.sgProjectId`, `Project.startDate`, `Project.endDate`, `Project.durationDays`.

**Archived entity semantics:**
- `archived: true` is a soft-delete; entity stays in DB and renders in the Tech Tree (muted, 40% opacity + 📁 badge) but is excluded from all other views, priority calculations, workload counts, and notification triggers.
- `getTasksForGoal` intentionally includes archived tasks so the Tech Tree can render them with their dependency edges intact.
- All other store getters and view components must filter `!t.archived`.

## ShotGrid Sync System

The app can be kept in sync with Flow Production Tracking (ShotGrid/SG). There are two sync paths:

### 1. Bootstrap (one-time, manual)

```bash
# Requires shotgun_api3: pip install shotgun_api3
python sg_bootstrap.py
```

Calls `POST /api/sg/bootstrap` with admin password. Runs in order: projects → workers → tickets. Uses `replaceProjectsFromSg` / `replaceWorkersFromSg` (delete-then-upsert for SG-sourced rows) then upserts all tickets. Stale worker references in tasks are cleaned up atomically.

### 2. Live daemon sync (continuous, via sgEventDaemon)

Three plugins in `shotgunEvents/src/` register callbacks with the sgEvent daemon:

| Plugin | SG Events | App Endpoints |
|--------|-----------|---------------|
| `ticket_plugin.py` | `Shotgun_Ticket_New/Change/Retirement/Revival` | `/api/sg/sync/task`, `/api/sg/archive/task` |
| `human_user_plugin.py` | `Shotgun_HumanUser_New/Change/Retirement` | `/api/sg/sync/worker`, `/api/sg/archive/worker` |
| `project_plugin.py` | `Shotgun_Project_New/Change/Retirement` | `/api/sg/sync/project`, `/api/sg/archive/project` |

All three import from `sg_common.py` for the shared `post_to_app()` helper (retry with 4xx-break).

### SG API Routes (all in `server/routes.ts`)

All routes below require `x-sg-secret` header matching `SG_INTERNAL_SECRET`. Bootstrap requires `adminPassword` in body instead.

```
POST /api/sg/sync/task        body: SgTicketPayload + optional goalId
POST /api/sg/archive/task     body: { sgTicketId: number }
POST /api/sg/sync/worker      body: SgUserPayload
POST /api/sg/archive/worker   body: { sgUserId: number }
POST /api/sg/sync/project     body: SgProjectPayload
POST /api/sg/archive/project  body: { sgProjectId: number }
POST /api/sg/bootstrap        body: { adminPassword, projects?, workers?, tickets? }
```

Entity IDs for SG-synced rows are always `sg-{sgId}`. The `syncSource: 'sg'` field marks them.

### Source-of-truth split for Projects

`upsertProjectFromSg` only overwrites SG-owned fields (`name`, `description`, `startDate`, `endDate`, `durationDays`, `sgProjectId`, `syncSource`). On **re-sync of an existing project**, local fields are never touched: `strategicPriority`, `status`, `contributingDepartmentIds`, `goalIds`, `milestoneIds`. Defaults (`P2`, `active`, `[]`) only apply on **first create**.

### Status mapping (`mapSgStatusToTaskStatus` in `server/mutations.ts`)

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

### Required environment variables

```bash
# Shared (all plugins + routes)
SG_INTERNAL_SECRET=sg-internal-dev-secret   # must match x-sg-secret header
APP_API_URL=http://localhost:3001

# Per-plugin daemon credentials (sgEvent script name + key from SG admin)
SGDAEMON_TICKET_NAME=...        SGDAEMON_TICKET_KEY=...
SGDAEMON_HUMANUSER_NAME=...     SGDAEMON_HUMANUSER_KEY=...
SGDAEMON_PROJECT_NAME=...       SGDAEMON_PROJECT_KEY=...

# Bootstrap script only
SG_URL=https://your-site.shotgrid.autodesk.com
SCRIPT_NAME=dev    API_KEY=...    ADMIN_PASSWORD=admin2026
```
