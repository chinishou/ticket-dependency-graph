# Test Framework Tasks

Implementation checklist for Vitest + Playwright setup.
Reference: `plan.md` for rationale and scope.

---

## Phase 1 — Infrastructure

- [ ] **Install packages**
  ```bash
  npm install -D vitest @vitest/coverage-v8 jsdom @playwright/test
  npx playwright install chromium
  ```

- [ ] **`package.json`** — add 4 scripts
  ```json
  "test":          "vitest",
  "test:run":      "vitest run",
  "test:coverage": "vitest run --coverage",
  "test:e2e":      "playwright test"
  ```

- [ ] **`vitest.config.ts`** — create at project root
  - Two projects: `server` (node) and `client` (jsdom)
  - Server project env: `DB_PATH=:memory:`, `NODE_ENV=test`
  - Include: `server/__tests__/**/*.test.ts` and `src/**/__tests__/**/*.test.ts`

- [ ] **`playwright.config.ts`** — create at project root
  - `testDir: './e2e'`
  - `baseURL: 'http://localhost:5173'`, headless
  - `webServer`: auto-start `npm run server` (:3001) and `npm run dev` (:5173)
  - Single project: chromium

- [ ] **`server/db.ts`** — make DB path configurable
  - Change `DB_PATH` to `process.env.DB_PATH ?? path.join(...)` 
  - Wrap seed block: `if (count.count === 0 && process.env.NODE_ENV !== 'test')`

---

## Phase 2 — Vitest: Server Integration Tests

File: `server/__tests__/mutations.test.ts`

- [ ] Import `db` from `../db` and the mutation functions from `../mutations`
- [ ] `beforeEach`: clear all rows from `entities`, `users`, `meta` tables; re-seed minimal company + department
- [ ] **`mapSgStatusToTaskStatus`** tests (pure, no DB):
  - [ ] `'resolved'` → `completed`
  - [ ] `'in progress'` → `in_progress`
  - [ ] `'ready'` → `available`
  - [ ] `'blocked'` → `blocked`
  - [ ] `'paused'` → `paused`
  - [ ] unknown string → `locked`
- [ ] **`updateTask` bidirectional sync** tests:
  - [ ] Adding `dependsOnTaskIds` syncs other task's `unlocksTaskIds`
  - [ ] Removing from `dependsOnTaskIds` removes from other task's `unlocksTaskIds`
  - [ ] Adding `unlocksTaskIds` syncs other task's `dependsOnTaskIds`
  - [ ] Removing from `unlocksTaskIds` removes from other task's `dependsOnTaskIds`
- [ ] **`removeTaskFromGoal`** tests:
  - [ ] Task ID removed from `goal.taskIds`
  - [ ] Task ID removed from any milestone's `taskIds` within the goal
  - [ ] Task entity itself is deleted from DB
- [ ] **`upsertTaskFromSg`** tests:
  - [ ] First insert creates task with `sgTicketId`, `sgStatus`, correct mapped `status`
  - [ ] Re-sync with same `sgTicketId` does NOT overwrite `goalId` or `priorityOverride`
  - [ ] Worker assignment: new `sgAssignedTo` added to worker's `assignedTaskIds`
  - [ ] Worker removal: old assigned worker's `assignedTaskIds` cleaned up

---

## Phase 3 — Vitest: Client Unit Tests

### `src/utils/__tests__/priorityCalc.test.ts`

- [ ] **`strategicPriorityToRank`**:
  - [ ] `P1` → `1`, `P2` → `2`, `P3` → `3`
- [ ] **`computeProjectFactor`**:
  - [ ] P1 task → `100`, P2 → `67`, P3 → `33`, no projects → `0`
  - [ ] Uses max when task has multiple `relatedProjectIds`
- [ ] **`computeDeptFactor`**:
  - [ ] Same pattern as project factor
- [ ] **`computeGoalFactor`**:
  - [ ] `departmentPriority` 1 → `100`, 2 → `67`, 3 → `33`
- [ ] **`computeCreatorFactor`**:
  - [ ] `isLead: true` → `100`, `isLead: false` → `50`, no creator → `0`
- [ ] **`computeGraphFactors`**:
  - [ ] Isolated node: graph score = `0`
  - [ ] Linear chain A→B→C: C has higher score than B, B higher than A
  - [ ] Diamond: shared downstream node gets counted once
  - [ ] Completed task excluded from critical path score
- [ ] **`computeTaskPriorities`**:
  - [ ] Weighted sum matches expected value for a known input
  - [ ] Task with `priorityOverride` returns the override score, not computed score
  - [ ] Archived task is excluded from output map
  - [ ] `CalibrationWeights` missing `goal` key falls back to `DEFAULT_WEIGHTS`

### `src/types/__tests__/goalStatus.test.ts`

- [ ] **`computeGoalStatus`**:
  - [ ] Empty goal (no tasks) → `empty`
  - [ ] All tasks `locked` → `available` (no tasks are blocking progress)
  - [ ] At least one `in_progress` task → `in_progress`
  - [ ] All tasks `blocked` (none in progress) → `blocked`
  - [ ] All tasks `completed` → `completed`
  - [ ] Mix of `completed` + `in_progress` → `in_progress`

---

## Phase 4 — Playwright E2E Tests

### `e2e/auth.spec.ts`

- [ ] Navigate to app, see login page
- [ ] Click a worker card → logged in as that worker
- [ ] Open user menu → enter admin password → click Go → `[E] Settings` tab appears
- [ ] Click Sign Out → back to login page

### `e2e/task-update.spec.ts`

- [ ] Login as any worker
- [ ] Navigate to Workers view (`[D]`)
- [ ] Click on a worker → task list appears
- [ ] Click a task → `FloatingTaskDetailPanel` slides in
- [ ] Change status dropdown → toast notification appears in bottom-right
- [ ] Navigate to Settings → Logs
- [ ] Switch to Compact mode → find log entry containing `status →`

### `e2e/log-viewer.spec.ts`

- [ ] Login as admin, navigate to Settings → Logs
- [ ] Readable mode: empty state message "No mutations or events yet" visible
- [ ] Click Compact → HTTP request log entries visible (at least one row)
- [ ] Trigger a mutation via `page.evaluate` (direct fetch to `/api/mutations`)
- [ ] Click Refresh
- [ ] Switch to Readable mode → structured row with WHO/ENTITY chips visible

---

## Phase 5 — Verification

- [ ] `npm run test:run` — all Vitest tests pass (0 failures)
- [ ] `npm run test:coverage` — priorityCalc > 80%, mutations > 70%
- [ ] `npm run build` — TypeScript build still clean
- [ ] `npm run test:e2e` — all 3 Playwright specs pass (with dev servers running)
