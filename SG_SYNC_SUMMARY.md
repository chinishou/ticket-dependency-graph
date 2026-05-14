# ShotGrid Sync — Implementation Summary

ShotGrid (Flow Production Tracking) is the source of truth for **Tasks**, **Projects**, and **Workers**. There are two sync directions:

```
                inbound (read from SG)
SG site  ───────────────────────────────────────►  local SQLite
   ▲                                                    │
   │            outbound (write back to SG)             │
   └────────────────────────────────────────────────────┘
                  (gated by SG_WRITE_DISABLED)
```

## Inbound paths

Two ways data flows from SG → local DB:

1. **Live daemon** — upstream `shotgunEvents` + our plugins in `sg-events-plugins/` (`ticket_plugin.py`, `human_user_plugin.py`, `project_plugin.py`, `sg_common.py`) subscribe to SG events and POST to the app's `/api/sg/sync/*` endpoints over HTTP.
2. **Manual pull via UI** — Settings → SG Import buttons POST to `/api/sg/trigger-sync` / `/api/sg/trigger-bootstrap`, which `execFile`s `sg_client.py` with the appropriate subcommand. The same Python script is used at the CLI for one-off pulls.

```
SG event → daemon plugin
                ↓ HTTP POST (x-sg-secret header)
        app server (/api/sg/sync/task, /api/sg/archive/task, etc.)
                ↓
        SQLite via mutations.ts (upsert + bidirectional sync)
                ↓
        Clients polling /api/poll see the change within ≤30s
```

## Outbound path

Only two app actions push data **back** to SG:

| Trigger                                              | Endpoint                         | SG call                                       |
|------------------------------------------------------|----------------------------------|-----------------------------------------------|
| User changes status of an SG-synced task             | `POST /api/sg/update-task-status`  | `sg.update("Ticket", id, {sg_status_list: <code>})` |
| Same change + `sgPriorityAutoSync` enabled (Settings) | `POST /api/sg/update-task-priority` | `sg.update("Ticket", id, {priority: <1-5>})` |

Both shell out to `sg_client.py update-ticket-status` / `update-ticket-priority`, which call `shotgun_api3.Shotgun.update()`. **Both endpoints honor `SG_WRITE_DISABLED=1`** — when set, they return `{ success: true, skipped: true }` without invoking Python. Use this in any environment (test, staging, dev pointing at prod SG) where the app should read SG but never write back.

## Files

| File | Purpose |
|------|---------|
| `sg_client.py` | SG client layer — every server-side SG operation `execFile`s this script (bootstrap, sync, list-statuses, list-projects, outbound writes) |
| `sg-events-plugins/*.py` | Daemon plugins copied into upstream `shotgunEvents/src/` (or baked into `Dockerfile.daemon`) |
| `server/routes.ts` | All `/api/sg/*` endpoints; `SG_WRITE_DISABLED` guard; `DEFAULT_SG_STATUS_MAP` fallback |
| `server/mutations.ts` | `upsertTaskFromSg`, `upsertProjectFromSg`, `upsertWorkerFromSg`, archive helpers, `mapSgStatusToTaskStatus` |
| `src/store/useStore.ts` | `syncTaskStatusToSg`, `syncTaskPriorityToSg`, `mapTaskStatusToSg`, `sgStatusMap` state |
| `src/components/settings/SettingsSgSync.tsx` | Import UI (status + project filters) |
| `src/components/settings/SgStatusMap.tsx` | Outbound status code mapping UI |
| `src/types/index.ts` | SG sync fields on `Task`, `Project`, `Worker` (`sgTicketId`, `syncSource`, `archived`, …) |

## Configurable status mapping

The outbound TaskStatus → SG `sg_status_list` code mapping is **persisted in the `meta` table** (key `sg_status_map`) and edited from Settings → SG → "Status Mapping (Outbound)".

- The UI populates SG code dropdowns from `POST /api/sg/list-statuses` (which runs `sg_client.py list-statuses`), so no hardcoded SG codes appear in user-facing UI.
- Stale codes (configured but no longer present in SG) are flagged in red.
- Server defaults in `DEFAULT_SG_STATUS_MAP` (`server/routes.ts`) are used until the admin saves a mapping; the frontend mirrors them in `useStore.sgStatusMap` until the first `/api/sg/status-map` GET resolves.

## Project filter for ticket imports

The Tickets import card has a Projects filter populated live from `POST /api/sg/list-projects`. When the user narrows the selection, the chosen IDs become `--project-ids=...` on the `sync-tickets` invocation. When all projects are selected, no flag is passed so newly-added SG projects auto-flow into future imports. This is **import-time only** — the live daemon still forwards every ticket event regardless of project.

## Inbound SG status mapping

Keyword substring match (case-insensitive) in `mapSgStatusToTaskStatus` (`server/mutations.ts`). First match wins; unmatched falls through to `locked`:

| SG status contains       | → | TaskStatus     |
|--------------------------|---|----------------|
| resolved, closed, final, done, complete | → | `completed`    |
| in progress, in_progress, ip, working   | → | `in_progress`  |
| wait, ready, open, new, rev             | → | `available`    |
| block, hold                             | → | `blocked`      |
| pause, stop                             | → | `paused`       |
| (unmatched)                             | → | `locked`       |

## Worker role mapping

SG `HumanUser.permission_group` → app role:

| permission_group | → | role           |
|------------------|---|----------------|
| Admin            | → | `admin`        |
| Manager (or Lead)| → | `coordinator`  |
| Artist (default) | → | `worker`       |

## API Routes

All in `server/routes.ts`. Daemon-facing routes require `x-sg-secret` header. UI-facing routes require `adminPassword` in the body.

```
# Daemon-facing (x-sg-secret)
POST /api/sg/sync/task               body: SgTicketPayload + optional goalId
POST /api/sg/archive/task            body: { sgTicketId }
POST /api/sg/sync/worker             body: SgUserPayload
POST /api/sg/archive/worker          body: { sgUserId }
POST /api/sg/sync/project            body: SgProjectPayload
POST /api/sg/archive/project         body: { sgProjectId }
POST /api/sg/update-task-status      body: { sgTicketId, status }     ← writes to SG
POST /api/sg/update-task-priority    body: { sgTicketId, priority }   ← writes to SG

# UI-facing (adminPassword)
GET  /api/sg/status                  → { url, configured, counts, lastModified }
GET  /api/sg/status-map              → { map, defaults } (open — frontend needs on every load)
POST /api/sg/status-map              body: { adminPassword, map }
POST /api/sg/list-statuses           body: { adminPassword }   → spawns Python
POST /api/sg/list-projects           body: { adminPassword }   → spawns Python
POST /api/sg/trigger-sync            body: { adminPassword, entity, statuses?, projectIds?, sgId? }
POST /api/sg/trigger-bootstrap       body: { adminPassword }
POST /api/sg/sync-departments        body: { adminPassword, departments }
POST /api/sg/bootstrap               body: { adminPassword, projects?, workers?, tickets? }
POST /api/sg/clear-sg-data           body: { adminPassword }
```

## Source-of-truth split

| Field group | Owned by | Behavior on re-sync |
|-------------|----------|---------------------|
| `name`, `description`, `startDate`, `endDate`, `durationDays`, `sgProjectId`, `syncSource` (on `Project`) | SG | overwritten |
| `strategicPriority`, `status`, `contributingDepartmentIds`, `goalIds`, `milestoneIds` (on `Project`) | App | preserved |
| Task fields under `sgTicketId`, `sgStatus`, `sgEstimate`, `sgTimeLogged`, `sgAssignedTo` | SG | overwritten |
| Task `goalId`, `priorityOverride`, dependencies | App | preserved |
| Worker `sgUserId`, `permissionGroup`, `name`, `departmentId` | SG | overwritten |
| Worker `activeTaskIds`, `assignedTaskIds`, `isLead` | App | preserved |

`syncSource: 'sg'` marks entities that came from SG. SG-synced entity IDs are always `sg-{sgId}`.

## Archived semantics

When an SG entity is retired, the corresponding local record is marked `archived: true`. Archived tasks remain visible in the Tech Tree (40% opacity, folder badge) and preserve dependency edges, but are excluded from priority calculations, workload counts, and all non–tech-tree views. `Shotgun_Ticket_Revival` un-archives.

## Setup

See **README → Container Deployment** for the recommended path (Docker Compose brings up both the app and the daemon with named volumes). For bare-metal: see **README → Production Deployment (Linux)**.

Bare-metal sketch:

```bash
# .env (see .env.example for the full list)
SG_URL=https://your-site.shotgrid.autodesk.com
SCRIPT_NAME=...    API_KEY=...
SG_INTERNAL_SECRET=<random 32+ chars>   # CHANGE
ADMIN_PASSWORD=<random>                 # CHANGE
APP_API_URL=http://localhost:3001
SG_WRITE_DISABLED=     # leave unset in prod; set 1 in staging/test

# Pull SG data once via UI (Settings → SG Import) or CLI:
python sg_client.py

# Run the live daemon (separate process, clone upstream shotgunEvents first):
python shotgunEvents/src/shotgunEventDaemon.py foreground
```

## Notes

- The sgEvent daemon does not guarantee event delivery; if it's down during an SG change, the change shows up only on the next inbound sync (manual or via UI button).
- Daemon auto-reloads plugin code on file change — useful for iterating on `sg-events-plugins/*.py` in dev.
- Outbound writes are fire-and-forget. If `sg.update()` fails, the next inbound event from the daemon will correct local state.
