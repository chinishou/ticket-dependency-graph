# Cleanup Todo Tasks

Implementation checklist for the GitHub-ready cleanup. See [cleanup_plan.md](cleanup_plan.md) for full context.

- [ ] **Create `sg-events-plugins/` folder with copied plugin files, conf.example, and README**
  - Copy `shotgunEvents/src/ticket_plugin.py` → `sg-events-plugins/ticket_plugin.py`
  - Copy `shotgunEvents/src/human_user_plugin.py` → `sg-events-plugins/human_user_plugin.py`
  - Copy `shotgunEvents/src/project_plugin.py` → `sg-events-plugins/project_plugin.py`
  - Copy `shotgunEvents/src/sg_common.py` → `sg-events-plugins/sg_common.py`
  - Create `sg-events-plugins/shotgunEventDaemon.conf.example` (sanitized, no hardcoded paths)
  - Create `sg-events-plugins/README.md` (install guide for users)

- [ ] **Delete `shotgunEvents/` folder**
  - Remove the entire `shotgunEvents/` directory (third-party embedded clone)
  - Remove `/shotgunEvents/logs/` entry from `.gitignore`

- [ ] **Update `.gitignore` for secrets, Python artifacts, debug files**
  - Add `.env` and `.env.local`
  - Add `__pycache__/` and `*.pyc`
  - Add `NUL` and `state_debug.json`

- [ ] **Create `.env.example` with placeholder env vars**
  - Include all vars from `sg_bootstrap.py`, `sg_common.py`, and plugin files
  - Use placeholder values only (no real credentials)

- [ ] **Rewrite `README.md` ShotGrid setup and Testing sections**
  - Replace Setup section (lines 61–74) with new 5-step install flow referencing `sg-events-plugins/`
  - Remove "No test framework is configured" line (~183); add Testing section with `npm run test`, `npm run test:coverage`, `npm run test:e2e`

- [ ] **Scrub hardcoded paths in `SG_SYNC_SUMMARY.md`**
  - Replace `D:\dev\...` absolute paths on line 108 with project-relative paths

- [ ] **Update `CLAUDE.md` plugin paths**
  - Update plugin table paths in "ShotGrid Sync System → 2. Live daemon sync"
  - Change `shotgunEvents/src/ticket_plugin.py` → `sg-events-plugins/ticket_plugin.py` (and siblings)
  - Add a note about cloning upstream `shotgunEvents` separately

- [ ] **Regenerate `package-lock.json` via `npm install`**
  - Run `npm install` to refresh the lock file with correct `"name": "ticket-dependency-graph"` (currently `task-tech-tree-temp` at lines 2 & 8)

- [ ] **Verify build, tests, lint, git hygiene, and stale refs**
  - `npm run build` — TypeScript build passes
  - `npm run test:run` — all 112 tests pass
  - `npm run lint` — same 37 pre-existing errors (no new ones)
  - `git status --ignored` — confirms `.env`, `state_debug.json`, `NUL`, `__pycache__/`, `data.db*` are ignored
  - `rg "task-tech-tree" .` — zero hits outside `node_modules/` and `.git/`
  - `rg "d:\\\\dev" .` — zero hits
  - `python -c "import ast; ast.parse(open('sg-events-plugins/ticket_plugin.py').read())"` — plugins still parse
  - `npm run dev:all` — dev servers start without errors
