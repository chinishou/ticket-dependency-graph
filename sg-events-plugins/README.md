# sg-events-plugins

Custom ShotGrid sgEvent daemon plugins for the ticket-dependency-graph app.

These plugins listen to ShotGrid events and push changes to the app's internal API, keeping tasks, workers, and projects in sync.

## Plugins

| Plugin | ShotGrid Events | App Endpoints |
|--------|-----------------|---------------|
| `ticket_plugin.py` | `Shotgun_Ticket_New/Change/Retirement/Revival` | `/api/sg/sync/task`, `/api/sg/archive/task` |
| `human_user_plugin.py` | `Shotgun_HumanUser_New/Change/Retirement` | `/api/sg/sync/worker`, `/api/sg/archive/worker` |
| `project_plugin.py` | `Shotgun_Project_New/Change/Retirement` | `/api/sg/sync/project`, `/api/sg/archive/project` |
| `sg_common.py` | — | Shared `post_to_app()` helper |

## Easiest path: container

The repo ships a `Dockerfile.daemon` that clones upstream `shotgunEvents` at build time, drops these plugins in, and runs the daemon as a non-root user. `docker-compose.yml` wires it to the app container with a shared `.env`:

```bash
docker compose up -d --build sg-event-daemon
```

The container's entrypoint (`docker/daemon-entrypoint.sh`) renders `shotgunEventDaemon.conf` from env vars at startup, so you don't have to edit a config file in-tree. See **README → Container Deployment** for the env-var matrix.

If you want to run the daemon on bare metal instead, follow the manual install below.

## Installation

### 1. Clone upstream shotgunEvents

```bash
git clone https://github.com/shotgunsoftware/shotgunEvents
pip install -r shotgunEvents/requirements.txt
```

### 2. Copy plugins into upstream

Copy these four files into your shotgunEvents installation:

```bash
cp sg-events-plugins/*.py shotgunEvents/src/
cp sg-events-plugins/shotgunEventDaemon.conf.example shotgunEvents/src/shotgunEventDaemon.conf
```

### 3. Configure paths

Edit `shotgunEvents/src/shotgunEventDaemon.conf`:

- Set `[shotgun]` → `server`, `name`, `key` for your SG site
- Set `[plugins]` → `paths` to point to `shotgunEvents/src/`

### 4. Set environment variables

Copy `.env.example` from the project root to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `SG_ED_SITE_URL` — your ShotGrid site URL
- `SG_ED_SCRIPT_NAME` / `SG_ED_API_KEY` — SG script credentials
- `SG_INTERNAL_SECRET` — shared secret with the app server
- `APP_API_URL` — app server URL (default: `http://localhost:3001`)
- `SGDAEMON_TICKET_NAME` / `SGDAEMON_TICKET_KEY`
- `SGDAEMON_HUMANUSER_NAME` / `SGDAEMON_HUMANUSER_KEY`
- `SGDAEMON_PROJECT_NAME` / `SGDAEMON_PROJECT_KEY`

### 5. Run the daemon

```bash
python shotgunEvents/src/shotgunEventDaemon.py foreground
```

The daemon will listen for ShotGrid events and push updates to the app server.
