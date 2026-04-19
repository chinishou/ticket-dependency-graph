# Test Framework Plan — Vitest + Playwright

## Why

No automated tests exist today. TypeScript type-checking is the only validation.
Two highest-risk areas are also the easiest to test:

- **Priority engine** (`src/utils/priorityCalc.ts`) — pure functions, zero side effects, complex weighted math
- **Bidirectional mutations** (`server/mutations.ts`) — SQLite transactions, both dependency sides must stay in sync

Adding Playwright on top covers the critical user flows end-to-end so regressions in the UI
layer (login, task status change, log viewer) are caught automatically.

---

## Scope

### Vitest — unit + integration

Two test environments in a single config:

| Project | Environment | Test Location | What it tests |
|---------|-------------|---------------|---------------|
| `server` | Node | `server/__tests__/` | DB mutations with in-memory SQLite |
| `client` | jsdom | `src/**/__tests__/` | Pure utility functions (no DOM needed) |

**Server tests** (`server/__tests__/mutations.test.ts`):
- `updateTask()` — bidirectional `dependsOnTaskIds ↔ unlocksTaskIds` sync (4 code paths)
- `removeTaskFromGoal()` — cascading cleanup of `goal.taskIds` and milestone references
- `upsertTaskFromSg()` — first insert, re-sync preserves local fields (`goalId`, `priorityOverride`), worker add/remove
- `mapSgStatusToTaskStatus()` — keyword match table (pure, no DB needed)

**Client tests** (`src/utils/__tests__/priorityCalc.test.ts`):
- `strategicPriorityToRank()` — P1→1, P2→2, P3→3
- `computeProjectFactor()` / `computeDeptFactor()` / `computeGoalFactor()` / `computeCreatorFactor()`
- `computeGraphFactors()` — linear chain, diamond, isolated node, critical path detection
- `computeTaskPriorities()` — weighted sum, override bypass, archived excluded, weight migration guard

**Client tests** (`src/types/__tests__/goalStatus.test.ts`):
- `computeGoalStatus()` — all 5 states: empty, available, in_progress, blocked, completed

### Playwright — E2E

Three spec files targeting the three most critical flows:

| Spec | Flow |
|------|------|
| `e2e/auth.spec.ts` | Login → admin upgrade → Settings tab visible → sign out |
| `e2e/task-update.spec.ts` | Open a task → change status → toast appears → log entry visible |
| `e2e/log-viewer.spec.ts` | Readable/Compact toggle, mutation entry appears after refresh |

---

## Infrastructure Changes

### `server/db.ts` — 2 small changes
1. `DB_PATH` reads from `process.env.DB_PATH` (falls back to `data.db`) — allows tests to use `:memory:`
2. Mock-data seed is skipped when `NODE_ENV === 'test'` — tests start from a clean DB

### `vitest.config.ts` — new file
Defines two projects (server + client) with per-project env vars (`DB_PATH=:memory:`, `NODE_ENV=test`).

### `playwright.config.ts` — new file
Chromium only, `webServer` config auto-starts both dev servers if not already running.

### `package.json` — 4 new scripts
```
test          → vitest (watch mode)
test:run      → vitest run (CI)
test:coverage → vitest run --coverage
test:e2e      → playwright test
```

---

## Coverage Targets

| File | Target |
|------|--------|
| `src/utils/priorityCalc.ts` | > 80% |
| `server/mutations.ts` | > 70% |
| `src/types/index.ts` (GoalStatus helpers) | > 90% |

---

## Not In Scope

- React component rendering tests (no React Testing Library — inline styles + CSS vars make snapshot tests brittle)
- ShotGrid integration tests (external dependency, tested via manual bootstrap)
- Store (Zustand) unit tests — covered indirectly by E2E
