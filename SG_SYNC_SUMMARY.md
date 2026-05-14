# SG Ticket Sync — Implementation Summary

## What Was Built

ShotGrid (Flow Production Tracking) is now the source of truth for **Tasks**, **Projects**, and **Workers** in ticket-dependency-graph.

### Data Flow

```
SG Ticket/Project/User change
        ↓
sgEvent Daemon (ticket_plugin.py)
        ↓ HTTP POST (internal API)
app server (/api/sg/sync/task, /api/sg/archive/task)
        ↓
SQLite DB (upsert via mutations.ts)
        ↓
client polls /api/state every 5s
        ↓
UI reflects SG-backed attributes
```

---

## Files Changed

| File | Purpose |
|------|---------|
| `src/types/index.ts` | Added SG sync fields to `Task`, `Project`, `Worker` |
| `server/mutations.ts` | SG upsert/archive mutations + status mapping |
| `server/routes.ts` | `POST /api/sg/sync/task`, `/api/sg/archive/task`, `/api/sg/bootstrap` |
| `shotgunEvents/src/ticket_plugin.py` | Daemon plugin: receives SG events → POSTs to app API |
| `sg_client.py` | SG client layer (subprocess) for bootstrap, sync, list-statuses, list-projects, and outbound ticket writes |
| `src/store/useStore.ts` | `sgBootstrap()` admin action |
| `src/components/tech-tree/TaskNode.tsx` | SG badge, archived opacity + icon |
| `src/components/shared/TaskDetailPanel.tsx` | SG fields display + SG badge |
| `src/utils/priorityCalc.ts` | Skip archived tasks in priority scoring |
| `README.md` | ShotGrid Integration section |
| `.env` | `SG_INTERNAL_SECRET`, `APP_API_URL` |

---

## SG Field Mapping

### Ticket → Task

| SG Field | → | Task Field |
|----------|---|------------|
| `id` | → | `sgTicketId`, `ticketId` |
| `title` | → | `name` |
| `description` | → | `description` |
| `project` | → | `sgProjectId`, `sgProjectName` |
| `sg_status_list` | → | `status` (mapped) |
| `sg_estimate` | → | `sgEstimate`, `baseDurationDays` |
| `time_logs_sum` | → | `sgTimeLogged` |
| `addressings_to` | → | `sgAssignedTo`, `assignedWorkerIds` |

### Status Mapping

| SG status contains | → | Task status |
|-------------------|---|-------------|
| resolved, closed, final | → | `completed` |
| in progress | → | `in_progress` |
| wait, ready, open | → | `available` |
| block | → | `blocked` |
| pause | → | `paused` |
| (unmatched) | → | `locked` |

### Worker Mapping

SG `HumanUser.permission_group` → app role:
- `Admin` → `admin`
- `Manager`, `Lead` → `coordinator`
- (default) → `worker`

---

## Setup

### 1. Environment

```bash
# .env
SG_URL=https://your-site.shotgrid.autodesk.com
SCRIPT_NAME=your_script
API_KEY=your_api_key
SG_ED_SITE_URL=https://your-site.shotgrid.autodesk.com
SG_ED_SCRIPT_NAME=your_script
SG_ED_API_KEY=your_api_key
SGDAEMON_TICKET_NAME=your_script
SGDAEMON_TICKET_KEY=your_api_key
SG_INTERNAL_SECRET=sg-internal-dev-secret
APP_API_URL=http://localhost:3001
ADMIN_PASSWORD=admin2026
```

### 2. Configure Daemon

Edit `shotgunEvents/src/shotgunEventDaemon.conf`:

```ini
[shotgun]
server: %(SG_ED_SITE_URL)s
name: %(SG_ED_SCRIPT_NAME)s
key: %(SG_ED_API_KEY)s

[plugins]
paths: /path/to/shotgunEvents/src
```

### 3. Bootstrap (first time only)

```bash
python sg_client.py
```

This replaces all local projects/workers with SG data and imports all open tickets as tasks.

### 4. Run

```bash
# App server
npm run server

# Daemon (separate terminal)
python shotgunEvents/src/ticket_plugin.py foreground
```

---

## Behavior

- **Ticket created in SG** → local task auto-created (unplaced if no goal)
- **Ticket updated in SG** → local task fields updated via daemon
- **Ticket retired in SG** → local task marked `archived: true`, visible but muted, excluded from priority
- **Archived tasks** → visible with opacity 0.4, preserved graph connections, excluded from priority scoring
- **Bootstrap** → replaces SG-backed projects and workers; upserts tickets; preserves local goals/milestones

---

## API Routes

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /api/sg/sync/task` | `x-sg-secret` header | Upsert task from SG event |
| `POST /api/sg/archive/task` | `x-sg-secret` header | Archive task on SG retirement |
| `POST /api/sg/bootstrap` | admin password | Full import of projects, workers, tickets |

---

## Notes

- SG daemon does **not** guarantee event delivery; webhooks are recommended for production
- `syncSource: 'sg'` marks entities that came from SG (used for clean bootstrap replacement)
- Archived tasks are filtered out of `computeTaskPriorities()` and `computeGraphFactors()`
- Daemon auto-reloads plugin on file change
