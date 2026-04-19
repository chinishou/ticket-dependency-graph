# SG Ticket Sync Plan For task-tech-tree

## Summary

Replace task-tech-tree's current mock-first task/project/worker sourcing with Flow Production Tracking entities driven by sgEvent Daemon.

Planned behavior:
- SG Ticket becomes the source for tech-tree task records.
- SG Project becomes the source for local project records.
- SG HumanUser becomes the source for local worker records.
- sgEvent Daemon pushes incremental creates/updates/retirements into the app through a new internal server API.
- A protected manual admin bootstrap sync imports existing SG projects, workers, and tickets on first setup.
- Retired tickets/tasks remain visible in the tech tree in an archived state, preserve dependency connections, and are excluded from priority and active-work calculations.

## Current State Analysis

### Current data model
- Task model is defined in [index.ts](file:///d:/dev/task-tech-tree/src/types/index.ts#L108-L129).
- Project model is defined in [index.ts](file:///d:/dev/task-tech-tree/src/types/index.ts#L82-L92).
- Worker model is defined in [index.ts](file:///d:/dev/task-tech-tree/src/types/index.ts#L147-L155).
- Tasks currently support only light ticket linkage through `ticketId` and `ticketUrl`; there is no SG field mapping.

### Current persistence and mutation flow
- All entities are stored as JSON blobs in SQLite in [db.ts](file:///d:/dev/task-tech-tree/server/db.ts#L14-L48).
- The database seeds mock projects, goals, tasks, milestones, and workers when empty in [db.ts](file:///d:/dev/task-tech-tree/server/db.ts#L69-L91).
- Task updates currently go through generic merge logic in [mutations.ts](file:///d:/dev/task-tech-tree/server/mutations.ts#L24-L84).
- Server routes currently expose state, polling, auth, and generic mutations only in [routes.ts](file:///d:/dev/task-tech-tree/server/routes.ts#L19-L284).

### Current SG integration
- The SG daemon plugin exists in [ticket_plugin.py](file:///d:/dev/task-tech-tree/shotgunEvents/src/ticket_plugin.py#L7-L93).
- The plugin is receiving Ticket and Reading events, but it currently only logs them and does not sync into the app.
- The plugin loads `.env` and reads SG daemon credentials from environment variables.

### Relevant user decisions captured for this plan
- Integration path: daemon calls app API.
- Ticket create behavior: always auto-create a local task.
- SG fields to sync: Assigned To, Description, Estimate, Id, Project, Status, Time Logged, Title.
- New tasks without placement info: create as unplaced tasks.
- SG status mapping: overwrite the app task status.
- Workers: replace local workers with SG HumanUser sync; permission group maps to app role.
- Projects: replace local projects with SG Project sync.
- Bootstrap: protected manual admin sync.
- Existing mock projects/workers: replace on bootstrap.
- Retired tasks: visible archived state, preserve graph connections, excluded from priority and other active calculations.

## Assumptions & Decisions

### SG-to-local entity strategy
- One SG Ticket maps to one local Task.
- One SG Project maps to one local Project.
- One SG HumanUser maps to one local Worker.
- Goals and milestones remain local app concepts for now.
- Because SG does not currently provide tree placement/dependency structure, imported tickets will be created as unplaced tasks until a user connects them.

### Field mapping

#### Ticket -> Task
- `id` -> local SG source id field and existing `ticketId`
- `title` -> `name`
- `description` -> `description`
- `project` -> SG project metadata on task and local project linkage if resolved
- `sg_status_list` -> `status` through explicit mapping
- `sg_estimate` -> `baseDurationDays`
- `time_logs_sum` -> new read-only SG time-logged field on task
- `addressings_to` -> SG assignee metadata and local `assignedWorkerIds` after SG worker sync

#### Required new task metadata
- `sgTicketId`
- `sgProjectId`
- `sgProjectName`
- `sgStatus`
- `sgEstimate`
- `sgTimeLogged`
- `sgAssignedTo`
- `archived`
- `syncSource`

These fields should be stored directly in the task JSON blob so they can drive both UI and sync reconciliation.

### Status mapping decision
Map SG ticket status into current app `TaskStatus`:
- resolved/closed/final -> `completed`
- in progress style values -> `in_progress`
- waiting/ready/open style values -> `available`
- blocked style values -> `blocked`
- paused/on hold style values -> `paused`
- any unmapped or not-yet-unlocked imported ticket -> `locked`

Implementation should centralize this mapping in one shared server utility so both bootstrap sync and daemon event sync behave identically.

### Worker mapping decision
- Replace local workers with SG HumanUser-backed workers.
- Add SG metadata to workers for source id and permission group.
- Map SG permission groups:
  - Artist -> `worker`
  - Manager -> `coordinator`
  - Admin -> `admin`
- Initial sync must create/update workers before ticket assignment mapping runs.

### Project mapping decision
- Replace local projects with SG Project-backed projects.
- Import SG project fields required by the user:
  - name
  - start date
  - end date
  - duration
- Keep tech-tree-specific strategic priority local instead of sourcing it from SG.

### Archival behavior
- Retired SG tickets become archived local tasks.
- Archived tasks remain visible in the tech tree with visual treatment.
- Archived tasks preserve dependency/unlock graph links.
- Archived tasks must be excluded from:
  - priority calculations
  - active assignment load
  - other active-only rollups

## Proposed Changes

### 1. Extend shared types for SG-backed entities

#### File: [index.ts](file:///d:/dev/task-tech-tree/src/types/index.ts)
Update the core entity types to carry SG source metadata and archival state.

Planned changes:
- Extend `Task` with SG sync fields:
  - `sgTicketId`
  - `sgProjectId`
  - `sgProjectName`
  - `sgStatus`
  - `sgEstimate`
  - `sgTimeLogged`
  - `sgAssignedTo`
  - `archived`
  - `archivedAt`
  - `syncSource`
  - optional `unplaced`
- Extend `Project` with SG-backed fields:
  - `sgProjectId`
  - `startDate`
  - `endDate`
  - `durationDays`
  - `syncSource`
- Extend `Worker` with SG-backed fields:
  - `sgUserId`
  - `permissionGroup`
  - `syncSource`

Why:
- The current types do not have enough structure to preserve SG-backed attributes or distinguish archived imported records from active local-only entities.

### 2. Add SG sync mutation utilities on the server

#### File: [mutations.ts](file:///d:/dev/task-tech-tree/server/mutations.ts)
Add dedicated server-side sync functions instead of overloading the generic `updateTask()` path.

Planned additions:
- `upsertTaskFromSg(payload)`
- `archiveTaskFromSg(ticketId)`
- `upsertProjectFromSg(payload)`
- `replaceProjectsFromSg(projects)`
- `upsertWorkerFromSg(payload)`
- `replaceWorkersFromSg(workers)`
- shared helpers for:
  - SG status -> task status mapping
  - SG estimate -> duration conversion
  - task id generation / stable SG-based ids
  - safe assignment mapping after worker sync

Why:
- SG-originated sync logic has different rules than user edits:
  - create-if-missing
  - preserve graph fields
  - archive instead of delete
  - exclude archived tasks from active calculations

### 3. Add protected SG sync API routes

#### File: [routes.ts](file:///d:/dev/task-tech-tree/server/routes.ts)
Add dedicated endpoints for daemon incremental sync and manual bootstrap.

Planned routes:
- `POST /api/sg/sync/task`
- `POST /api/sg/archive/task`
- `POST /api/sg/bootstrap`
- optional narrower endpoints if bootstrap is split:
  - `/api/sg/bootstrap/projects`
  - `/api/sg/bootstrap/workers`
  - `/api/sg/bootstrap/tickets`

Behavior:
- Require an internal shared secret for daemon-originated requests.
- Require admin authorization for manual bootstrap.
- Return updated state snapshots or sync summaries for UI refresh.

Why:
- The app currently has no SG ingest surface.
- Using an API keeps daemon integration isolated from direct DB writes.

### 4. Support bootstrap replacement strategy in persistence layer

#### File: [db.ts](file:///d:/dev/task-tech-tree/server/db.ts)
Add helper operations needed for first-time source-of-truth replacement.

Planned changes:
- Add bulk replace helpers for `projects` and `workers`.
- Add optional helper to query tasks by SG ticket id.
- Keep current JSON blob persistence model; no table schema migration is needed because entity payloads are stored in `data`.
- Preserve existing goals/milestones/tasks unless explicitly replaced by SG task bootstrap.
- Decide seeding behavior:
  - retain current seed-on-empty behavior for development
  - bootstrap route replaces worker/project records once SG sync is invoked

Why:
- The user wants SG to replace local workers and projects after bootstrap, not merge blindly.

### 5. Implement daemon-to-app sync in the SG plugin

#### File: [ticket_plugin.py](file:///d:/dev/task-tech-tree/shotgunEvents/src/ticket_plugin.py)
Replace current log-only behavior with API calls into task-tech-tree.

Planned changes:
- Narrow event handling to the SG ticket events actually needed:
  - `Shotgun_Ticket_New`
  - `Shotgun_Ticket_Change`
  - `Shotgun_Ticket_Retirement` or equivalent retired event
  - `Shotgun_Reading_Change` only if it contributes to tracked attributes
- Extract normalized payload fields from event and, when required, fetch current ticket details from SG.
- POST normalized data to the new internal sync API.
- Add safe retry/error logging around network calls.
- Avoid crashing plugin callbacks on transient SG connection resets.

Needed payload fields from SG ticket:
- id
- title
- description
- project
- sg_status_list
- sg_estimate
- time_logs_sum
- addressings_to

Why:
- This is the main bridge between SG events and app state.

### 6. Add manual bootstrap sync implementation

#### Files:
- [routes.ts](file:///d:/dev/task-tech-tree/server/routes.ts)
- [mutations.ts](file:///d:/dev/task-tech-tree/server/mutations.ts)
- possibly a new SG service module under `server/` for fetch/mapping logic

Planned behavior:
- Admin triggers bootstrap manually.
- Bootstrap fetch order:
  1. SG projects
  2. SG users/workers
  3. SG tickets
- Replace local projects and workers with SG-backed entities.
- Upsert tickets as local tasks.
- Mark imported tasks unplaced if there is no goal placement.

Recommended file to add:
- `server/sgSync.ts` or equivalent mapping/service module

Why:
- Bootstrap and incremental sync should share mapping code, but bootstrap needs full-list SG fetches rather than event payload deltas.

### 7. Update store integration for SG sync and admin bootstrap

#### File: [useStore.ts](file:///d:/dev/task-tech-tree/src/store/useStore.ts)
Add client-side actions for:
- triggering manual bootstrap sync
- refreshing state after SG sync actions
- handling archived task visibility rules

Why:
- The server can sync data, but the UI needs an admin entry point and consistent live refresh behavior.

### 8. Update task UI to display SG-backed attributes

#### Files:
- [TaskDetailPanel.tsx](file:///d:/dev/task-tech-tree/src/components/shared/TaskDetailPanel.tsx)
- [FloatingTaskDetailPanel.tsx](file:///d:/dev/task-tech-tree/src/components/shared/FloatingTaskDetailPanel.tsx)
- [TaskNode.tsx](file:///d:/dev/task-tech-tree/src/components/tech-tree/TaskNode.tsx)

Planned UI behavior:
- Show SG-backed fields:
  - ticket id
  - title
  - description
  - project
  - SG status
  - estimate
  - time logged
  - assigned SG users
- Show archived visual state for retired tasks.
- Keep archived tasks visible but visually muted.
- Ensure archived tasks do not appear as active work in panels where active work is summarized.

Why:
- The imported fields need to be usable, not only stored.

### 9. Update priority and active-work calculations to ignore archived tasks

#### Files: actual calculation locations to confirm during implementation, likely in `src/` selectors/helpers
Implementation target:
- Any priority scoring or active workload logic that currently iterates all tasks must skip `archived === true`.

Why:
- The user explicitly wants archived tasks to preserve graph connections but not affect priority calculation or other active behaviors.

Implementation note:
- During execution, locate the exact scoring/selectors by searching for priority calculation and worker workload usage before editing.

### 10. Update documentation for real operational flow

#### Files:
- [README_TICKET_PLUGIN.md](file:///d:/dev/task-tech-tree/shotgunEvents/README_TICKET_PLUGIN.md)
- any SG integration notes added during implementation

Planned doc updates:
- daemon environment variables
- new internal API secret
- bootstrap workflow
- SG field mappings
- archive behavior
- known limitations around unplaced imported tasks

Why:
- The current doc explains plugin setup but not the actual app sync workflow.

## Execution Order

1. Extend shared types for SG-backed task/project/worker metadata.
2. Add server-side SG mapping and sync functions.
3. Add protected SG sync and bootstrap API routes.
4. Implement daemon plugin API calls.
5. Implement bootstrap import for SG projects, workers, and tickets.
6. Update client store/admin trigger flow.
7. Update task detail and node UI for SG-backed/archived fields.
8. Adjust priority and workload logic to ignore archived tasks.
9. Update operational docs.

## Verification Steps

### Server/data verification
- Start the app server and confirm SG sync routes are reachable.
- Run manual bootstrap and confirm:
  - local projects are replaced with SG projects
  - local workers are replaced with SG users
  - SG tickets appear as tasks
  - imported tasks without placement are marked unplaced
- Verify archived SG tickets remain stored and visible.

### Daemon verification
- Start sgEvent Daemon and create/update/retire an SG ticket.
- Confirm the daemon posts to the app API successfully.
- Confirm the corresponding task is created, updated, or archived locally.

### UI verification
- Confirm imported fields are visible in task detail views.
- Confirm archived tasks are visually distinct but still connected in the tree.
- Confirm archived tasks do not affect priority displays or active worker load.

### Regression checks
- Confirm existing local goal and milestone behavior still works.
- Confirm worker permission roles still behave correctly after SG bootstrap.
- Confirm generic manual task editing still works where intended for non-SG-only fields such as local priority.

