# sg-events-plugins

Custom ShotGrid sgEvent daemon plugins. These plugins listen to ShotGrid events and POST them to one or more consuming apps over HTTP.

The daemon they run inside is the upstream `shotgunEvents` project — completely app-agnostic. The plugins are the only piece that knows about specific apps.

## Plugins

| Plugin | ShotGrid Events | App Endpoints |
|--------|-----------------|---------------|
| `ticket_plugin.py` | `Shotgun_Ticket_New/Change/Retirement/Revival` | `/api/sg/sync/task`, `/api/sg/archive/task` |
| `human_user_plugin.py` | `Shotgun_HumanUser_New/Change/Retirement` | `/api/sg/sync/worker`, `/api/sg/archive/worker` |
| `project_plugin.py` | `Shotgun_Project_New/Change/Retirement` | `/api/sg/sync/project`, `/api/sg/archive/project` |
| `sg_common.py` | — | Shared `post_to_app(endpoint, payload, logger, plugin_key=...)` helper |

## Routing: one daemon, many apps

Each plugin passes its own `plugin_key` (`TICKET`, `HUMANUSER`, `PROJECT`) to `post_to_app`. The helper resolves the target URL like this:

```
APP_API_URL_{plugin_key}    (if set)
↓ fallback
APP_API_URL                 (always set; default http://localhost:3001)
```

So a single daemon can forward ticket events to one app and project events to another:

```bash
APP_API_URL=http://ticket-app.internal:3001         # default for all plugins
APP_API_URL_HUMANUSER=http://hr-app.internal:8080   # override for HumanUser only
```

If you only have one consumer, set just `APP_API_URL` and ignore the per-plugin variants.

## SG script credentials

Each plugin reads its own `SGDAEMON_{TICKET,HUMANUSER,PROJECT}_{NAME,KEY}` pair from the environment, so you *can* have one script per plugin for separate audit trails. Operationally, **using the same script name + key for all three pairs is fully supported** — the plugins don't care. The script needs read access to Ticket, HumanUser, and Project entities.

## Easiest path: standalone daemon container

The repo ships a `Dockerfile.daemon` that clones upstream `shotgunEvents` at build time, drops these plugins in, and runs the daemon as a non-root user. `docker-compose.daemon.yml` runs the daemon as a standalone deployment (separate from the app):

```bash
cp .env.example .env
# Set APP_API_URL (or per-plugin overrides), SG_INTERNAL_SECRET,
# SG_ED_SITE_URL / SG_ED_SCRIPT_NAME / SG_ED_API_KEY, and the
# SGDAEMON_* pairs.

docker compose -f docker-compose.daemon.yml up -d --build
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
- `SG_ED_SITE_URL` — your ShotGrid site URL (the site whose events are forwarded)
- `SG_ED_SCRIPT_NAME` / `SG_ED_API_KEY` — daemon engine script credentials
- `SG_INTERNAL_SECRET` — shared secret with every consuming app server
- `APP_API_URL` — default target app URL (e.g. `http://localhost:3001`)
- `APP_API_URL_TICKET` / `APP_API_URL_HUMANUSER` / `APP_API_URL_PROJECT` — optional per-plugin overrides; fall back to `APP_API_URL` if unset
- `SGDAEMON_TICKET_NAME` / `SGDAEMON_TICKET_KEY`
- `SGDAEMON_HUMANUSER_NAME` / `SGDAEMON_HUMANUSER_KEY`
- `SGDAEMON_PROJECT_NAME` / `SGDAEMON_PROJECT_KEY`

Tip: the same script name + key works fine in all three `SGDAEMON_*` pairs.

### 5. Run the daemon

```bash
python shotgunEvents/src/shotgunEventDaemon.py foreground
```

The daemon will listen for ShotGrid events and push updates to the app server.
