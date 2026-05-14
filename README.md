# Ticket Dependency Graph

A game-inspired tech tree UI for managing VFX production tasks, goals, milestones, and workers across departments and projects.

## Features

- **Tech Tree View** — React Flow-based directed acyclic graph with dagre auto-layout, custom task/milestone nodes, dependency visualization, and unplaced-task bucket for SG-imported tasks awaiting goal assignment
- **Dashboard** — Drill-down company overview with project/department cards, progress stats, and inline priority controls (P1/P2/P3)
- **Timeline** — Custom Gantt chart with dependency-based date scheduling, month axis, and today marker
- **Workers** — Worker list by department with active tasks, unlocks, and priority-sorted queue
- **Settings** — 5-dimension priority weight configuration with calibration wizard, lead list management, and formula preview
- **ShotGrid Integration** — Syncs Tasks, Projects, and Workers from Flow Production Tracking via sgEvent Daemon; supports bootstrap import and real-time incremental updates

---

## ⚠️ Production Safety — Read First

Before you point this app at a real ShotGrid site, read this section in full. Two things can damage real data:

1. **Tests will mutate the live ShotGrid site** if pointed at it.
   `e2e/task-update.spec.ts` clicks "Mark Complete" on a real task. If that task is SG-synced, the app calls `/api/sg/update-task-status` → `python sg_client.py update-ticket-status` → `sg.update("Ticket", ...)` against your live SG site. The ticket status changes for everyone.
2. **Tests will erase the SQLite database** if `DB_PATH` is unset.
   `server/__tests__/mutations.test.ts` runs `DELETE FROM entities` in `beforeEach`. The `vitest.setup.ts` file pins `DB_PATH=./data.test.db` so this can't touch the production DB — **do not remove that setup**.

Mandatory environment separation:

| Environment | `SG_URL`            | `DB_PATH`         | `SG_WRITE_DISABLED` |
|-------------|---------------------|-------------------|---------------------|
| production  | prod SG site        | `./data.db`       | unset               |
| staging     | **separate** SG     | `./data.staging.db` | `1`                 |
| local dev   | dev SG (or prod with `SG_WRITE_DISABLED=1`) | `./data.dev.db` | `1` recommended  |
| tests       | none / dev SG       | `./data.test.db`  | `1`                 |

**The production SG site and the test/staging SG site MUST NOT be the same site.** A bad test run on shared SG site will corrupt ticket statuses, retire/revive tickets, and trigger downstream daemon events.

### Code paths that mutate ShotGrid

These are the only two places in the app that write to SG. Everything else reads or writes local SQLite only.

| Trigger                                              | Endpoint                          | SG call                                    |
|------------------------------------------------------|-----------------------------------|--------------------------------------------|
| User changes status of an SG-synced task             | `POST /api/sg/update-task-status` | `sg.update("Ticket", id, {sg_status_list})` |
| Same change AND `sgPriorityAutoSync` is on (Settings) | `POST /api/sg/update-task-priority` | `sg.update("Ticket", id, {priority})`     |

Both endpoints honor the `SG_WRITE_DISABLED=1` env flag — when set, they return `{ success: true, skipped: true }` without invoking the Python script. Use this in any environment where you want the app to read from SG but never write back.

The Python client (`sg_client.py`) only writes to SG when invoked with the `update-ticket-status` or `update-ticket-priority` subcommands. The default `bootstrap` / `sync-*` subcommands are read-only on SG (they only push data into the local app DB).

### Default secrets are publicly known — change them

| Variable             | Default in source        | Risk if left as default                    |
|----------------------|--------------------------|--------------------------------------------|
| `SG_INTERNAL_SECRET` | `sg-internal-dev-secret` | Anyone hitting your URL can call `/api/sg/sync/*` and overwrite local entities. |
| `ADMIN_PASSWORD`     | `admin2026`              | Anyone can become admin and change roles, calibration, and priorities. |

Set both to long random strings before exposing the app on a network you don't fully control.

---

## Container Deployment (Docker / Podman)

Two images and a Compose file:

| File                  | Image                              | Process                                                          |
|-----------------------|------------------------------------|------------------------------------------------------------------|
| `Dockerfile`          | `ticket-dep-graph:latest`          | Node API server (Express) + Python (`sg_client.py` subprocess) + built frontend. Single port 3001. |
| `Dockerfile.daemon`   | `ticket-dep-graph-daemon:latest`   | ShotGrid event daemon (upstream `shotgunEvents` + our three plugins). No exposed ports — talks outbound to SG and to the app container. |
| `docker-compose.yml`  | —                                  | Brings up both with named volumes, healthcheck-gated startup, shared `.env`. Works with `docker compose`, `podman-compose`, and `podman compose`. |

### Why two images?

The app server and the event daemon have very different runtime needs (Node + Python vs. Python only) and very different lifecycles (the daemon must restart cleanly when SG creds rotate; the app shouldn't). Keeping them in separate images means a code change on one side doesn't force a rebuild of the other, and lets you scale or restart them independently.

### About `sg_client.py`

`sg_client.py` is the **SG client layer** for the Node server (previously named `sg_bootstrap.py` — renamed because it does much more than one-time bootstrap). The Node server has no ShotGrid SDK, so every server-side operation that talks to SG (including the UI's Settings → SG Import buttons, the status/project pickers, and outbound ticket-status writes) `execFile`s this script with a subcommand. Both the daemon container *and* the app container need different subsets of the SG ecosystem:

- The **app image** includes `sg_client.py` + `shotgun_api3` because the Settings UI invokes those subcommands.
- The **daemon image** includes the upstream `shotgunEvents` runtime + our plugins from `sg-events-plugins/` and forwards events to the app's `/api/sg/sync/*` endpoints via HTTP.

### Build

```bash
# Quickest — Compose builds both images for you
docker compose build
podman compose build      # or: podman-compose build

# Or build individually
docker build -f Dockerfile        -t ticket-dep-graph:latest        .
docker build -f Dockerfile.daemon -t ticket-dep-graph-daemon:latest .
```

The app build is a two-stage build:

| Stage     | Purpose                                                                    |
|-----------|----------------------------------------------------------------------------|
| `builder` | Installs all npm deps (incl. devDeps), runs `npm run build` to produce `dist/`, compiles `better-sqlite3` native bindings. |
| `runtime` | Slim `node:20-bookworm-slim` + `python3` + `shotgun_api3`. Copies only the built `dist/`, `node_modules`, server source, and `sg_client.py`. Non-root user (UID 10001). |

The daemon image clones upstream `shotgunEvents` at build time. Pin to a specific commit for reproducible builds:

```bash
docker build -f Dockerfile.daemon \
    --build-arg SHOTGUNEVENTS_REF=v1.2.3 \
    -t ticket-dep-graph-daemon:latest .
```

### Run (recommended — Compose)

```bash
cp .env.example .env
# Edit .env. The compose file reads it for both services.
# At minimum, set:
#   ADMIN_PASSWORD, SG_INTERNAL_SECRET            (app & daemon)
#   SG_URL, SCRIPT_NAME, API_KEY                  (app — bootstrap + outbound writes)
#   SG_ED_SITE_URL, SG_ED_SCRIPT_NAME, SG_ED_API_KEY  (daemon — event stream)
#   SGDAEMON_TICKET_NAME / _KEY, etc.             (daemon — per-plugin creds)

docker compose up -d --build
# or: podman compose up -d --build

# Watch logs
docker compose logs -f
docker compose logs -f app           # app only
docker compose logs -f sg-event-daemon

# Stop / restart
docker compose down                  # keeps volumes
docker compose down -v               # destroys data — be sure
```

Browse to `http://localhost:3001` — Express serves the built frontend and the API on the same port. The daemon doesn't expose any port; it talks outbound to SG and to the `app` service via Docker's internal DNS (`http://app:3001`).

### Run (manual — single image)

If you only want the app and plan to run the daemon elsewhere (bare metal, k8s, etc.):

```bash
docker run -d \
  --name tdg \
  -p 3001:3001 \
  -v tdg-data:/data \
  -v tdg-logs:/app/logs \
  -e ADMIN_PASSWORD='your-real-password' \
  -e SG_INTERNAL_SECRET='your-real-32-char-secret' \
  -e SG_URL='https://your-site.shotgrid.autodesk.com' \
  -e SCRIPT_NAME='your-script-name' \
  -e API_KEY='your-sg-api-key' \
  ticket-dep-graph:latest

# Same flags work for podman
podman run -d --name tdg -p 3001:3001 \
  -v tdg-data:/data -v tdg-logs:/app/logs \
  --env-file .env \
  ticket-dep-graph:latest
```

### Defaults baked into the image

| Env var             | Default       | Notes                                                       |
|---------------------|---------------|-------------------------------------------------------------|
| `NODE_ENV`          | `production`  | Triggers JSON-formatted log output to stdout                |
| `PORT`              | `3001`        | Honored by `server/index.ts`                                |
| `PYTHON_CMD`        | `python3`     | Used by SG-write endpoints to invoke `sg_client.py`      |
| `DB_PATH`           | `/data/data.db` | SQLite file — mount a volume at `/data`                   |
| `SERVE_STATIC`      | `1`           | Makes Express serve `dist/` + SPA fallback                  |
| `SG_WRITE_DISABLED` | (unset)       | Set to `1` for staging containers that read SG but never write back |

**You MUST override `ADMIN_PASSWORD` and `SG_INTERNAL_SECRET`** at run time — the in-source defaults (`admin2026`, `sg-internal-dev-secret`) are public.

### Volumes

| Container         | Mountpoint                       | Contents                                       | Required?                |
|-------------------|----------------------------------|------------------------------------------------|--------------------------|
| app               | `/data`                          | `data.db` + WAL/SHM sidecar files              | Yes (otherwise the DB lives in the container's writable layer and is lost on `docker rm`) |
| app               | `/app/logs`                      | `app.log` audit trail                          | Optional — logs also stream to stdout, so `docker logs tdg-app` works without the mount |
| sg-event-daemon   | `/var/log/shotgunEventDaemon`    | `shotgunEventDaemon.id` (last processed event ID) + per-plugin log files | **Yes** — without this, the daemon either re-processes every historical event after each restart or silently drops events that occurred during downtime |

### Healthcheck

The image declares a `HEALTHCHECK` that hits `/api/state` every 30 s using Node's built-in `fetch` (no `curl`/`wget` needed in the slim base). Docker honors it automatically; Podman ignores `HEALTHCHECK` unless you pass `--health-cmd` or run under `quadlet`.

### Podman-specific notes

- **Rootless**: the image runs as UID `10001`. Under rootless Podman this maps via `subuid`/`subgid` automatically.
- **SELinux** (RHEL/Fedora): if bind-mounting a host directory instead of a named volume, add `:Z` so SELinux relabels: `-v /srv/tdg/data:/data:Z`.
- **systemd integration**: `podman generate systemd --new --name tdg` to produce a unit file, or write a Quadlet `.container` file for the modern approach.

### Graceful shutdown

`server/index.ts` registers `SIGTERM`/`SIGINT` handlers that:
1. Stop accepting new HTTP connections.
2. Let in-flight requests drain (up to 8 s).
3. Call `db.close()` to checkpoint the SQLite WAL cleanly.
4. Exit with code 0.

If a request is still running at 8 s, the process exits with code 1 to make sure orchestrators don't hang waiting for the default 10 s SIGKILL. The daemon image uses `exec` in its entrypoint script so PID 1 is the actual `python` process, letting SIGTERM reach the daemon directly.

### What's NOT in the image

- **The `.env` file** is in `.dockerignore` to prevent secret leakage into the image. Always provide secrets via `--env-file` or `-e` at run time.
- **Tests** (`e2e/`, `playwright.config.ts`) and **`scripts/`** are excluded for image size.
- The daemon image **clones upstream `shotgunEvents` at build time** — it isn't pre-bundled in this repo. The build needs network access to GitHub. Pin a specific ref via `--build-arg SHOTGUNEVENTS_REF=...` for air-gapped reproducible builds.

### Updating

```bash
git pull
docker compose up -d --build       # rebuilds both images, restarts both services
# named volumes (tdg-data, tdg-logs, tdg-daemon-state) preserve all state
```

The schema is created idempotently on startup (`CREATE TABLE IF NOT EXISTS`), so existing data carries forward across image rebuilds as long as the volumes are mounted. The daemon resumes from `shotgunEventDaemon.id` so no SG events are missed across the restart window (events that fire during the rebuild are still buffered by SG and replayed when the daemon reconnects).

---

## Production Deployment (Linux)

Tested target: Ubuntu 22.04 / Debian 12 / RHEL 9. Adjust paths, package manager, and service manager as needed.

### Prerequisites

```bash
# Node 20+ (for native better-sqlite3 prebuilds and Vite 8)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs build-essential python3 python3-pip git

# Python 3.9+ for the SG bootstrap and event daemon
python3 -m pip install --user shotgun_api3 requests python-dotenv
```

### 1. Clone and build

```bash
sudo mkdir -p /opt/ticket-dependency-graph
sudo chown $USER /opt/ticket-dependency-graph
git clone <your-repo-url> /opt/ticket-dependency-graph
cd /opt/ticket-dependency-graph

npm ci
npm run build   # produces dist/ for the frontend
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env. At minimum, set:
#   SG_URL, SCRIPT_NAME, API_KEY      (real prod SG site + script)
#   SG_INTERNAL_SECRET                (random ≥ 32 chars)
#   ADMIN_PASSWORD                    (random ≥ 16 chars)
#   VITE_SG_INTERNAL_SECRET           (must equal SG_INTERNAL_SECRET)
#   DB_PATH                           (e.g. /var/lib/ticket-dep-graph/data.db)
#   PYTHON_CMD                        (e.g. /usr/bin/python3)
# Leave SG_WRITE_DISABLED unset — production wants outbound SG writes.

sudo mkdir -p /var/lib/ticket-dep-graph
sudo chown $USER /var/lib/ticket-dep-graph

chmod 600 .env   # contains secrets and SG API key
```

The `VITE_SG_INTERNAL_SECRET` is embedded into the JS bundle at build time, so re-run `npm run build` after changing it.

### 3. Serve the frontend

The built `dist/` directory is static — serve it with nginx (recommended) or any static server. The Express API server still runs on port 3001 and must be reverse-proxied at `/api`.

Example nginx config (`/etc/nginx/sites-available/ticket-dep-graph`):

```nginx
server {
  listen 80;
  server_name ticket-dep-graph.example.com;

  root /opt/ticket-dependency-graph/dist;
  index index.html;

  # SPA fallback
  location / {
    try_files $uri /index.html;
  }

  # Proxy API to Express
  location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 60s;
  }
}
```

For HTTPS, terminate TLS at nginx (e.g. via certbot). The internal `/api` traffic stays on localhost.

### 4. systemd service for the API server

`/etc/systemd/system/ticket-dep-graph.service`:

```ini
[Unit]
Description=Ticket Dependency Graph API
After=network.target

[Service]
Type=simple
User=tdg
Group=tdg
WorkingDirectory=/opt/ticket-dependency-graph
EnvironmentFile=/opt/ticket-dependency-graph/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/npx tsx server/index.ts
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/ticket-dep-graph/server.log
StandardError=append:/var/log/ticket-dep-graph/server.err

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /usr/sbin/nologin tdg
sudo chown -R tdg:tdg /opt/ticket-dependency-graph /var/lib/ticket-dep-graph
sudo mkdir -p /var/log/ticket-dep-graph && sudo chown tdg:tdg /var/log/ticket-dep-graph

sudo systemctl daemon-reload
sudo systemctl enable --now ticket-dep-graph
sudo systemctl status ticket-dep-graph
```

### 5. systemd service for the SG event daemon

The daemon must run continuously to receive ticket/user/project events from SG.

```bash
git clone https://github.com/shotgunsoftware/shotgunEvents /opt/shotgunEvents
sudo cp /opt/ticket-dependency-graph/sg-events-plugins/*.py /opt/shotgunEvents/src/
sudo cp /opt/ticket-dependency-graph/sg-events-plugins/shotgunEventDaemon.conf.example \
        /opt/shotgunEvents/src/shotgunEventDaemon.conf
# Edit shotgunEventDaemon.conf — set logFile path, pluginPaths, and SG creds.
```

`/etc/systemd/system/sg-event-daemon.service`:

```ini
[Unit]
Description=ShotGrid event daemon (ticket-dep-graph plugins)
After=ticket-dep-graph.service
Requires=ticket-dep-graph.service

[Service]
Type=simple
User=tdg
EnvironmentFile=/opt/ticket-dependency-graph/.env
WorkingDirectory=/opt/shotgunEvents/src
ExecStart=/usr/bin/python3 shotgunEventDaemon.py foreground
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sg-event-daemon
```

### 6. Bootstrap (one-time)

This pulls every project, worker, department, and ticket from SG into the local DB. Run once, after the API server is up, before opening the UI.

```bash
sudo -u tdg env $(cat /opt/ticket-dependency-graph/.env | xargs) \
     python3 /opt/ticket-dependency-graph/sg_client.py
```

### 7. Backups

Back up `DB_PATH` (default `data.db`) and the `.env` file. `data.db` is a SQLite file in WAL mode; back it up with the SQLite `.backup` command or hot-copy `data.db`, `data.db-shm`, `data.db-wal` together.

```bash
# Crontab (daily, 3 a.m.)
0 3 * * * sqlite3 /var/lib/ticket-dep-graph/data.db ".backup '/var/backups/tdg-$(date +\%F).db'"
```

### 8. Verification checklist before opening to users

- [ ] `curl http://127.0.0.1:3001/api/state` returns JSON with the expected projects/workers
- [ ] Default password `admin2026` is **rejected** at login (you've changed `ADMIN_PASSWORD`)
- [ ] `curl -H "x-sg-secret: sg-internal-dev-secret" http://127.0.0.1:3001/api/sg/bootstrap` returns 403 (you've changed `SG_INTERNAL_SECRET`)
- [ ] `SG_WRITE_DISABLED` is **unset** in `/opt/ticket-dependency-graph/.env`
- [ ] The systemd `EnvironmentFile=` is the same `.env` you intend to use (no stale copy)
- [ ] Logs at `/var/log/ticket-dep-graph/server.log` show the SG event daemon connecting
- [ ] Mark a ticket complete in the UI → confirm the SG ticket actually moves to `res` (verifying the round trip works on the **prod** SG site)

---

## Testing Safety

`npm run test:run` and `npm run test:e2e` are not safe to run blindly against a production deployment. Read this before running tests on any host that talks to a real SG site.

### What the tests do

| Test                                          | Touches                                              |
|-----------------------------------------------|------------------------------------------------------|
| `server/__tests__/mutations.test.ts` (vitest) | Wipes `entities` table in `beforeEach`               |
| `src/utils/__tests__/priorityCalc.test.ts`    | Pure functions, safe                                 |
| `src/types/__tests__/goalStatus.test.ts`      | Pure functions, safe                                 |
| `e2e/auth.spec.ts`                            | Logs in, upgrades to admin, signs out                |
| `e2e/log-viewer.spec.ts`                      | POSTs `updateTask` for a mock task ID                |
| `e2e/task-update.spec.ts`                     | **Clicks "Mark Complete" on the first visible task** |

### Built-in safeguards

- `vitest.setup.ts` sets `DB_PATH=./data.test.db` and `SG_WRITE_DISABLED=1` **before** any DB module is imported. Vitest cannot touch `data.db` or your real SG site as long as this file exists and `vitest.config.ts` keeps `setupFiles: ['./vitest.setup.ts']`.
- `playwright.config.ts` passes `SG_WRITE_DISABLED=1` and `DB_PATH=data.test.db` to the dev server it spawns.

### The big caveat — `reuseExistingServer: true`

`playwright.config.ts` has `reuseExistingServer: true`. If a dev server is already running (e.g. `npm run dev:all` in another terminal), Playwright **will not** spawn a new one and **the env vars in `playwright.config.ts` do not apply**. Your already-running server uses whatever env it was started with.

Practical rule: **before `npm run test:e2e`, stop any running `npm run dev:all` and let Playwright start its own server.** Or, start the dev server yourself with the test env explicitly:

```bash
SG_WRITE_DISABLED=1 DB_PATH=data.test.db npm run dev:all
# in another terminal:
npm run test:e2e
```

### Never deploy a CI runner that can reach prod SG

If your CI machine can reach the production SG URL, a misconfigured pipeline will mutate prod tickets. The safest setup is a separate SG site (a project clone or a dedicated test site) for CI. Set the test env to point at that site, and gate prod creds behind a deploy-only secrets store.

---

## ShotGrid Integration

Ticket Dependency Graph can use Flow Production Tracking (ShotGrid) as the source of truth for tasks, projects, and workers.

### Architecture

- **sgEvent Daemon** — runs as a long-lived process, monitors the ShotGrid event stream, and pushes changes to the app via internal API
- **Three daemon plugins** (in `sg-events-plugins/`, copied into `shotgunEvents/src/`):
  - `ticket_plugin.py` — Ticket New/Change/Retirement/Revival → task sync
  - `human_user_plugin.py` — HumanUser New/Change/Retirement → worker sync
  - `project_plugin.py` — Project New/Change/Retirement → project sync
  - `sg_common.py` — shared `post_to_app()` helper used by all three
- **Bootstrap Script** (`sg_client.py`) — one-time import of all existing SG entities; also runs the two `update-ticket-*` subcommands invoked by the app's outbound SG endpoints

### Daemon → App API

All routes require `x-sg-secret` header. Bootstrap uses admin password in body.

```
POST /api/sg/sync/task            body: SgTicketPayload + optional goalId
POST /api/sg/archive/task         body: { sgTicketId: number }
POST /api/sg/sync/worker          body: SgUserPayload
POST /api/sg/archive/worker       body: { sgUserId: number }
POST /api/sg/sync/project         body: SgProjectPayload
POST /api/sg/archive/project      body: { sgProjectId: number }
POST /api/sg/update-task-status   body: { sgTicketId, status }     ← writes to SG
POST /api/sg/update-task-priority body: { sgTicketId, priority }   ← writes to SG
POST /api/sg/bootstrap            body: { adminPassword, projects?, workers?, tickets? }
```

Only the two `update-task-*` routes invoke the Python interpreter and call `sg.update(...)`. They are gated by `SG_WRITE_DISABLED`.

### Environment Variables

See `.env.example` for the full list with comments. Key ones:

```bash
# Shared (plugins + app server)
SG_INTERNAL_SECRET=...           # CHANGE from default in prod
APP_API_URL=http://localhost:3001
SG_WRITE_DISABLED=               # set to 1 in non-prod environments
DB_PATH=./data.db                # separate file per environment
PYTHON_CMD=python3               # path to interpreter for outbound SG writes

# Per-plugin daemon credentials
SGDAEMON_TICKET_NAME=...         SGDAEMON_TICKET_KEY=...
SGDAEMON_HUMANUSER_NAME=...      SGDAEMON_HUMANUSER_KEY=...
SGDAEMON_PROJECT_NAME=...        SGDAEMON_PROJECT_KEY=...

# Bootstrap script + outbound update-ticket calls
SG_URL=https://your-site.shotgrid.autodesk.com
SCRIPT_NAME=...
API_KEY=...
ADMIN_PASSWORD=...               # CHANGE from default in prod
```

### Setup (development)

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
   python sg_client.py
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

**Reverse status mapping** (tech-tree → SG, used by outbound writes):
- Configured in **Settings → SG → Status Mapping (Outbound)**. The dropdown is populated live from your SG site via `POST /api/sg/list-statuses`, so the codes always match what your site accepts. The mapping is persisted in the `meta` table (key `sg_status_map`).
- If no mapping is saved yet, the app falls back to: `completed`→`res`, `in_progress`→`ip`, `available`/`locked`→`opn`, `blocked`→`hold`, `paused`→`wtg`. Override these in the Settings UI if your SG site uses different codes.
- Stale codes (saved before the SG site was edited) are flagged in red so the admin can re-pick.

### Source-of-Truth Split

SG owns: names, dates, status, estimates, assignments, and sync metadata.
**Local-only** (never overwritten by SG): `Project.strategicPriority`, `Project.status`, `Project.goalIds`, `Project.contributingDepartmentIds`, `Worker.activeTaskIds`, `Worker.assignedTaskIds`.

### Archived Tasks / Workers / Projects

When a SG entity is retired, the local record is marked `archived: true`. Archived tasks remain visible in the tech tree with muted styling (40% opacity + folder icon) and preserve dependency graph connections, but are excluded from priority calculations, workload counts, and all non–tech-tree views.

### Bootstrap Behavior

- SG-backed projects and workers **replace** all existing SG-sourced projects and workers; local entities are untouched
- SG tickets are upserted as tasks (existing tasks with matching `sgTicketId` are updated)
- Tasks without goal placement are marked `unplaced: true` and appear in the Tech Tree's Unplaced panel
- Local goals, milestones, and mock data are preserved

### Restricting tickets to specific SG projects

The Tickets import card in **Settings → SG → SG Import** has a **Projects** filter alongside the existing Statuses filter. It's populated live via `POST /api/sg/list-projects` (which shells out to `python sg_client.py list-projects`) so the list always matches your SG site. Selecting a subset only imports tickets whose `project.id` is in that subset; leaving all selected imports tickets from every project (no `--project-ids` flag is passed, so newly-added SG projects are picked up automatically).

This is an **import-time filter only** — the live sgEvent daemon (`ticket_plugin.py`) still forwards every ticket event regardless of project. If a ticket from an unwanted project is created in SG between imports, it will arrive via the daemon. Re-run a filtered import to clean it up (or use the **Clear SG Data** button), or extend `/api/sg/sync/task` with a project allow-list check if you need live filtering too.

Workers (HumanUsers) are global in SG and stay unfiltered — they're not project-bound.

CLI equivalent:

```bash
python sg_client.py list-projects                              # JSON to stdout
python sg_client.py sync-tickets --project-ids=122,205         # only those two
python sg_client.py sync-tickets --statuses=opn,ip --project-ids=122  # combined
```

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

**Read "Testing Safety" above before running these against any host with prod SG creds.**

```bash
npm run test:run      # Vitest single run (uses data.test.db, no SG writes)
npm run test:coverage # Vitest with coverage report
npm run test:e2e      # Playwright E2E (see "reuseExistingServer" caveat above)
```
