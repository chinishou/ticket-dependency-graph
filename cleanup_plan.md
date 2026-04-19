# Plan: GitHub-ready cleanup for `ticket-dependency-graph`

## Context

The project was moved/renamed from `task-tech-tree` to `ticket-dependency-graph` and we want to publish it to GitHub. Two problems block a clean upload:

1. **`shotgunEvents/` is a full embedded clone** of the upstream third-party repo (162 files incl. its own `.git/`). Users should install it themselves from upstream; only our custom plugins belong in *our* repo.
2. **Secret/garbage leakage risk** — `.env` (with real SG API keys), `state_debug.json`, `NUL`, `__pycache__/`, and stale hardcoded Windows paths (`d:\dev\task-tech-tree\`) are all currently tracked or un-ignored.

Decisions confirmed with user:
- Custom plugins go into a new top-level folder **`sg-events-plugins/`**.
- Keep all internal dev docs (`plan.md`, `tasks.md`, `SG_SYNC_SUMMARY.md`, `state_debug.json`, `example.py`, `NUL`, `__pycache__/`, `data.db*`) on disk — just make sure `.gitignore` covers the ones that shouldn't ship.
- Add `.env.example` (no LICENSE, no CONTRIBUTING.md for now).

## Changes

### 1. Extract our custom plugins — new folder `sg-events-plugins/`

Copy these four files out of `shotgunEvents/src/` into a new top-level `sg-events-plugins/` folder:

- `shotgunEvents/src/ticket_plugin.py` → `sg-events-plugins/ticket_plugin.py`
- `shotgunEvents/src/human_user_plugin.py` → `sg-events-plugins/human_user_plugin.py`
- `shotgunEvents/src/project_plugin.py` → `sg-events-plugins/project_plugin.py`
- `shotgunEvents/src/sg_common.py` → `sg-events-plugins/sg_common.py`

Also create a **`sg-events-plugins/shotgunEventDaemon.conf.example`** — a sanitized daemon config template with placeholder paths (no `d:\dev\...` absolute paths). Base it on `shotgunEvents/src/shotgunEventDaemon.conf.example` (already present upstream) with comments pointing at the plugins folder.

Create **`sg-events-plugins/README.md`** — a short install guide:
- "Clone upstream `https://github.com/shotgunsoftware/shotgunEvents`"
- "Copy these four `.py` files into `shotgunEvents/src/`"
- "Copy `shotgunEventDaemon.conf.example` → `shotgunEventDaemon.conf` and edit paths"
- "Set env vars (see root `.env.example`) then run `python shotgunEvents/src/shotgunEventDaemon.py foreground`"

### 2. Remove `shotgunEvents/` from our repo

Delete the `shotgunEvents/` directory entirely — upstream code is not ours to redistribute and it contains its own `.git/`.

Remove the now-moot `.gitignore` entry `/shotgunEvents/logs/`.

### 3. `.gitignore` — close the leak paths

Append to `.gitignore`:

```
# Secrets
.env
.env.local

# Python
__pycache__/
*.pyc

# Debug / scratch artifacts
NUL
state_debug.json
```

(Keep existing entries for `logs/`, `node_modules`, `dist`, `*.db*`, `coverage/`, `.claude/`, `.trae/`.)

### 4. `.env.example` — document required env vars

Create `.env.example` at project root with placeholder values and the exact variable names `sg_bootstrap.py` and the three plugins read:

```
# ShotGrid site (bootstrap script only)
SG_URL=https://your-site.shotgrid.autodesk.com
SCRIPT_NAME=your_script_name
API_KEY=your_api_key
ADMIN_PASSWORD=admin2026

# Shared secret between app server and sgEvent daemon plugins
SG_INTERNAL_SECRET=change-me-to-a-random-string
APP_API_URL=http://localhost:3001

# Per-plugin daemon credentials (from SG admin → Scripts)
SGDAEMON_TICKET_NAME=
SGDAEMON_TICKET_KEY=
SGDAEMON_HUMANUSER_NAME=
SGDAEMON_HUMANUSER_KEY=
SGDAEMON_PROJECT_NAME=
SGDAEMON_PROJECT_KEY=

# Frontend fallback for outbound SG sync (optional; defaults to dev secret)
VITE_SG_INTERNAL_SECRET=
```

Variables cross-checked against `sg_bootstrap.py`, `shotgunEvents/src/sg_common.py`, and the three plugin files.

### 5. `README.md` — rewrite ShotGrid setup section

Edit `README.md` lines 61–74 ("Setup") to replace the current steps with:

```
1. Install upstream sgEvent daemon:
   git clone https://github.com/shotgunsoftware/shotgunEvents
   pip install -r shotgunEvents/requirements.txt
2. Copy our plugins into it:
   cp sg-events-plugins/*.py shotgunEvents/src/
   cp sg-events-plugins/shotgunEventDaemon.conf.example shotgunEvents/src/shotgunEventDaemon.conf
   # Edit shotgunEvents/src/shotgunEventDaemon.conf paths for your system
3. Configure env vars:
   cp .env.example .env   # then fill in real values
4. Bootstrap (first time only):
   pip install shotgun_api3
   python sg_bootstrap.py
5. Start servers:
   npm run dev:all
   python shotgunEvents/src/shotgunEventDaemon.py foreground
```

Also in README.md line 183, remove the stale "No test framework is configured" line — the project now has Vitest + Playwright. Replace with a short Testing section listing `npm run test`, `npm run test:coverage`, `npm run test:e2e`.

### 6. Scrub hardcoded Windows paths from internal docs

- `SG_SYNC_SUMMARY.md:108` — replace `D:\dev\...` absolute path with a project-relative path.

(The offending hardcoded paths in `shotgunEvents/README_TICKET_PLUGIN.md` and `shotgunEvents/shotgunEventDaemon.conf` disappear automatically when we delete the folder in step 2.)

### 7. `CLAUDE.md` — update plugin path references

Edit `CLAUDE.md` section "ShotGrid Sync System → 2. Live daemon sync":

- Update the table's "Plugin" column paths from `shotgunEvents/src/ticket_plugin.py` → `sg-events-plugins/ticket_plugin.py` (same for the other two plugins and `sg_common.py`).
- Add a one-line note: "Users must clone upstream `shotgunEvents` separately and copy plugins from `sg-events-plugins/` into `shotgunEvents/src/`."

### 8. Fix stale `package-lock.json` name

Run `npm install` once to regenerate `package-lock.json` with the correct `"name": "ticket-dependency-graph"` at lines 2 & 8 (currently `task-tech-tree-temp`). This is the safest way — hand-editing the lock file risks desync with `package.json`.

## Files touched

| Action | Path |
|--------|------|
| Create | `sg-events-plugins/ticket_plugin.py` (copy) |
| Create | `sg-events-plugins/human_user_plugin.py` (copy) |
| Create | `sg-events-plugins/project_plugin.py` (copy) |
| Create | `sg-events-plugins/sg_common.py` (copy) |
| Create | `sg-events-plugins/shotgunEventDaemon.conf.example` |
| Create | `sg-events-plugins/README.md` |
| Create | `.env.example` |
| Delete | `shotgunEvents/` (entire folder) |
| Edit | `.gitignore` |
| Edit | `README.md` |
| Edit | `CLAUDE.md` |
| Edit | `SG_SYNC_SUMMARY.md` |
| Regenerate | `package-lock.json` (via `npm install`) |

## Verification

1. **Build + tests still pass** — `npm run build`, `npm run test:run` (expect 112/112 pass like before).
2. **Lint baseline unchanged** — `npm run lint` should show the same 37 pre-existing errors (not introduced by this change).
3. **Git hygiene** — `git status --ignored` should show `.env`, `state_debug.json`, `NUL`, `__pycache__/`, `data.db*` all under "Ignored files"; `git ls-files | grep -E "^\.env$|state_debug|__pycache__|^NUL$"` should return nothing.
4. **No stale references** — `rg "task-tech-tree" .` should return zero hits after `npm install` regenerates the lock file (excluding `node_modules/` and `.git/`); `rg "d:\\\\dev" .` should return zero hits.
5. **README instructions work end-to-end** — from a clean clone, following the new README steps should produce a working app + daemon. Smoke-test: verify the four plugin files in `sg-events-plugins/` still have working imports (`python -c "import ast; ast.parse(open('sg-events-plugins/ticket_plugin.py').read())"`).
6. **Dev server still runs** — `npm run dev:all` starts Vite on :5173 and Express on :3001 without errors.
