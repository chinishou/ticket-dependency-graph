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
- **Bidirectional sync** in `server/mutations.ts` — updating one side of a dependency automatically updates the other side, wrapped in SQLite transactions.
- **Presence system** — `presence` table with `(scope, user_name)` composite PK, 3-minute heartbeat timeout. Cleanup on sign-out captures `userName` in closure (store may already be null at cleanup time).
- **Edit locks** — pessimistic at goal/tree scope, 5-minute auto-expiry.
- **Polling** — clients call `GET /api/poll?since=<ts>` every 5s for changes.
- Vite proxies `/api` to the Express server in dev mode (configured in `vite.config.ts`).

### Key Patterns

- **`import type`** is required for type-only imports (Vite/esbuild constraint).
- **Optimistic mutations** — local Zustand state updates first, then async `serverMutation()` call enriched with `userName`, `role`, `userWorkerId`. Server response reconciles state.
- **CSS variables** for theming — dark theme colors defined in `src/index.css` as `--color-*` vars. No Tailwind utility classes in components; inline styles with CSS vars throughout.
- **Mock data fallback** — store initializes from `src/data/mockData.ts` if server is unavailable.

## Entity Types

Defined in `src/types/index.ts`: Company, Department, Project, Goal, Task, Milestone, Worker.

Key enums: `TaskStatus` (locked/available/in_progress/paused/completed/blocked), `StrategicPriority` (P1/P2/P3), `WorkerAvailability` (full/partial/unavailable).

Key fields:
- `Department.priority: StrategicPriority` — department-level priority (P1/P2/P3), separate from goal priority.
- `Goal.departmentPriority: number` — goal-level priority within its department (1-3).
- `Worker.isLead?: boolean` — determines creator factor in priority calc. Managed via Settings lead list.
- `Worker.activeTaskIds: string[]` — multiple concurrent active tasks.
- `Worker.assignedTaskIds: string[]` — full queue including non-active.
- `Task.priorityOverride?: PriorityOverride` — manual score override with reason and snapshot.
