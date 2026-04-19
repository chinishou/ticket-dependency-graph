# Ticket Dependency Graph

A game-inspired tech tree UI for managing VFX production tasks, goals, milestones, and workers across departments and projects.

## Features

- **Tech Tree View** — React Flow-based directed acyclic graph with dagre auto-layout, custom task/milestone nodes, dependency visualization, and unplaced-task bucket for SG-imported tasks awaiting goal assignment
- **Dashboard** — Drill-down company overview with project/department cards, progress stats, and inline priority controls (P1/P2/P3)
- **Timeline** — Custom Gantt chart with dependency-based date scheduling, month axis, and today marker
- **Workers** — Worker list by department with active tasks, unlocks, and priority-sorted queue
- **Settings** — 5-dimension priority weight configuration with calibration wizard, lead list management, and formula preview
- **ShotGrid Integration** — Syncs Tasks, Projects, and Workers from Flow Production Tracking via sgEvent Daemon; supports bootstrap import and real-time incremental updates

## ShotGrid Integration

Ticket Dependency Graph can use Flow Production Tracking (ShotGrid) as the source of truth for tasks, projects, and workers.

### Architecture

- **sgEvent Daemon** (`shotgunEvents/`) — runs as a long-lived process, monitors the ShotGrid event stream, and pushes changes to the app via internal API
- **Three daemon plugins** in `shotgunEvents/src/`:
  - `ticket_plugin.py` — Ticket New/Change/Retirement/Revival → task sync
  - `human_user_plugin.py` — HumanUser New/Change/Retirement → worker sync
  - `project_plugin.py` — Project New/Change/Retirement → project sync
  - `sg_common.py` — shared `post_to_app()` helper used by all three
- **Bootstrap Script** (`sg_bootstrap.py`) — one-time import of all existing SG entities on first setup

### Daemon → App API

All routes require `x-sg-secret` header. Bootstrap uses admin password in body.

```
POST /api/sg/sync/task        body: SgTicketPayload + optional goalId
POST /api/sg/archive/task     body: { sgTicketId: number }
POST /api/sg/sync/worker      body: SgUserPayload
POST /api/sg/archive/worker   body: { sgUserId: number }
POST /api/sg/sync/project     body: SgProjectPayload
POST /api/sg/archive/project  body: { sgProjectId: number }
POST /api/sg/bootstrap        body: { adminPassword, projects?, workers?, tickets? }
```

### Environment Variables

```bash
# Shared (plugins + app server)
SG_INTERNAL_SECRET=sg-internal-dev-secret   # must match x-sg-secret header
APP_API_URL=http://localhost:3001

# Per-plugin daemon credentials (script name + key from SG admin)
SGDAEMON_TICKET_NAME=...        SGDAEMON_TICKET_KEY=...
SGDAEMON_HUMANUSER_NAME=...     SGDAEMON_HUMANUSER_KEY=...
SGDAEMON_PROJECT_NAME=...       SGDAEMON_PROJECT_KEY=...

# Bootstrap script only
SG_URL=https://your-site.shotgrid.autodesk.com
SCRIPT_NAME=your_script_name
API_KEY=your_api_key
ADMIN_PASSWORD=admin2026
```

### Setup

1. Install upstream sgEvent daemon:
   ```bash
   git clone https://github.com/shotgunsoftware/shotgunEvents
   pip install -r shotgunEvents/requirements.txt
   ```
2. Copy our plugins into it:
   ```bash
   cp sg-events-plugins/*.py shotgunEvents/src/
   cp sg-events-plugins/shotgunEventDaemon.conf.example shotgunEvents/src/shotgunEventDaemon.conf
   # Edit shotgunEvents/src/shotgunEventDaemon.conf paths for your system
   ```
3. Configure env vars:
   ```bash
   cp .env.example .env   # then fill in real values
   ```
4. Bootstrap (first time only):
   ```bash
   pip install shotgun_api3
   python sg_bootstrap.py
   ```
5. Start servers:
   ```bash
   npm run dev:all
   python shotgunEvents/src/shotgunEventDaemon.py foreground
   ```

### SG Field Mapping

| SG Ticket Field | → | Ticket Dependency Graph Field |
|-----------------|---|---------------------|
| id | → | sgTicketId, ticketId |
| title | → | name |
| description | → | description |
| project | → | sgProjectId, sgProjectName |
| sg_status_list | → | status (via status mapping) |
| sg_estimate | → | sgEstimate, baseDurationDays |
| time_logs_sum | → | sgTimeLogged |
| addressings_to | → | sgAssignedTo, assignedWorkerIds |

| SG HumanUser Field | → | Ticket Dependency Graph Field |
|--------------------|---|---------------------|
| id | → | sgUserId |
| name | → | name |
| permission_group | → | role (Artist→worker, Manager→coordinator, Admin→admin) |
| department | → | departmentId, departmentName |

| SG Project Field | → | Ticket Dependency Graph Field |
|------------------|---|---------------------|
| id | → | sgProjectId |
| code | → | name |
| description | → | description |
| start_date | → | startDate |
| due_date | → | endDate |
| sg_duration_days | → | durationDays |

**Status mapping** (SG → Ticket Dependency Graph):
- resolved/closed/final/done/complete → `completed`
- in progress/working → `in_progress`
- wait/ready/open/new/rev → `available`
- block/hold → `blocked`
- pause/stop → `paused`
- unmapped → `locked`

### Source-of-Truth Split

SG owns: names, dates, status, estimates, assignments, and sync metadata.
**Local-only** (never overwritten by SG): `Project.strategicPriority`, `Project.status`, `Project.goalIds`, `Project.contributingDepartmentIds`, `Worker.activeTaskIds`, `Worker.assignedTaskIds`.

### Archived Tasks / Workers / Projects

When a SG entity is retired, the local record is marked `archived: true`. Archived tasks remain visible in the tech tree with muted styling (40% opacity + 📁 badge) and preserve dependency graph connections, but are excluded from priority calculations, workload counts, and all non–tech-tree views.

### Bootstrap Behavior

- SG-backed projects and workers **replace** all existing SG-sourced projects and workers; local entities are untouched
- SG tickets are upserted as tasks (existing tasks with matching `sgTicketId` are updated)
- Tasks without goal placement are marked `unplaced: true` and appear in the Tech Tree's Unplaced panel
- Local goals, milestones, and mock data are preserved

## Priority System

Five weighted dimensions scored 0–100:

| Factor | Input | Scale |
|--------|-------|-------|
| **Project** | Strategic priority (P1/P2/P3) | P1=100, P2=67, P3=33 |
| **Department** | Dept priority (P1/P2/P3) | P1=100, P2=67, P3=33 |
| **Goal** | Goal priority within dept (1–3) | 1=100, 2=67, 3=33 |
| **Creator** | Lead status of task creator | Lead=100, Other=50 |
| **Graph** | Dependency topology + critical path | 0–100 computed |

Weights are configurable via manual sliders or an 8-question calibration wizard. Tasks also support manual priority overrides.

## Data Model

```
Company → Department → Goal → Task / Milestone
Company → Project  → Goal → Task / Milestone
Department → Worker → assigned Tasks
```

All entities have bidirectional dependency links maintained atomically by the server.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Zustand, React Flow
- **Backend**: Express 5, better-sqlite3
- **State**: Optimistic mutations with polling-based sync (5s interval)

## Getting Started

```bash
npm install

# Run both frontend (Vite :5173) and backend (Express :3001)
npm run dev:all

# Or run individually
npm run dev          # Frontend only (proxies /api to :3001)
npm run server       # Backend only
```

## Commands

```bash
npm run dev:all      # Dev servers (frontend + backend)
npm run dev          # Frontend only
npm run server       # Backend only
npm run build        # tsc -b && vite build
npm run lint         # ESLint
npm run preview      # Preview production build
```

## Testing

```bash
npm run test:run      # Vitest single run
npm run test:coverage # Vitest with coverage report
npm run test:e2e     # Playwright E2E tests (requires dev servers running)
```
