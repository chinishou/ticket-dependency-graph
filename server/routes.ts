import { Router } from 'express';
import type { RequestHandler } from 'express';
import { execFile } from 'child_process';
import path from 'path';
import {
  getAllEntities, getLastModified, getChangedEntitiesSince,
  acquireLock, releaseLock, getAllLocks,
  heartbeatPresence, removePresence, getPresence,
  createUser, getUsers, getUserByName, updateUserRole,
  getEntity, getMeta, setMeta,
  db,
} from './db';
import {
  updateTask, updateMilestone, updateGoal,
  updateDepartment, updateProject, updateWorker,
  addGoal, removeGoal, addMilestone,
  addTaskToGoal, removeTaskFromGoal, removeMilestoneFromGoal,
  removeWorker, removeProject, removeDepartment, removeTask, removeMilestone,
  bulkClearTickets, bulkClearWorkers,
  replaceDepartmentsFromSg,
  BlockedByReferencesError,
} from './mutations';
import type { SgDepartmentPayload } from './mutations';
import { logger, logMutation, logSgSync, getLogs, clearLogs } from './utils/logger';
import { getTask } from './db.js';
import type { Task } from './types.js';

// Look up an entity's name from the DB, returning it quoted or a fallback string
function entityName(table: string, id: string, fallback: string): string {
  if (!id) return fallback;
  const e = getEntity(table, id) as { name?: string } | null;
  return e?.name ? `"${e.name}"` : fallback;
}

// Build human-readable message from mutation type + body.
// Called BEFORE the mutation runs so entity names are still available for remove ops.
function buildHumanMessage(type: string, body: Record<string, unknown>): string {
  const user = body.userName ? `${body.userName} ` : '';
  const id = (body.entityId ?? '') as string;

  switch (type) {
    case 'updateTask': {
      const updates = body.updates as Record<string, unknown>;
      const label = id.startsWith('sg-')
        ? `ticket #${id.replace('sg-', '')}`
        : entityName('tasks', id, `task ${id.slice(0, 8)}`);
      if (updates.status) return `${user}set ${label} status → ${updates.status}`;
      if (updates.priorityOverride) return `${user}overrode priority of ${label}`;
      if (updates.name) return `${user}renamed ${label} → "${updates.name}"`;
      if ('assignedWorkerIds' in updates) return `${user}updated workers on ${label}`;
      if ('dependsOnTaskIds' in updates || 'unlocksTaskIds' in updates)
        return `${user}updated dependencies of ${label}`;
      return `${user}updated ${label}`;
    }
    case 'updateMilestone': {
      const updates = body.updates as Record<string, unknown>;
      const label = entityName('milestones', id, `milestone ${id.slice(0, 8)}`);
      if (updates.name) return `${user}renamed ${label} → "${updates.name}"`;
      if (updates.status) return `${user}set ${label} status → ${updates.status}`;
      return `${user}updated ${label}`;
    }
    case 'updateGoal': {
      const updates = body.updates as Record<string, unknown>;
      const label = entityName('goals', id, `goal ${id.slice(0, 8)}`);
      if (updates.name) return `${user}renamed ${label} → "${updates.name}"`;
      if (updates.departmentPriority !== undefined)
        return `${user}set ${label} priority → ${updates.departmentPriority}`;
      return `${user}updated ${label}`;
    }
    case 'updateProject': {
      const updates = body.updates as Record<string, unknown>;
      const label = entityName('projects', id, `project ${id.slice(0, 8)}`);
      if (updates.strategicPriority) return `${user}set ${label} priority → ${updates.strategicPriority}`;
      return `${user}updated ${label}`;
    }
    case 'updateDepartment':
      return `${user}updated ${entityName('departments', id, `department ${id.slice(0, 8)}`)}`;
    case 'updateWorker':
      return `${user}updated ${entityName('workers', id, `worker ${id.slice(0, 8)}`)}`;
    case 'addGoal': {
      const goal = body.goal as Record<string, unknown> | undefined;
      const name = goal?.name ? `"${goal.name}"` : 'new goal';
      return `${user}created goal ${name}`;
    }
    case 'removeGoal': {
      const gid = (body.goalId ?? '') as string;
      const label = entityName('goals', gid, `goal ${gid.slice(0, 8)}`);
      return `${user}removed ${label}`;
    }
    case 'addMilestone': {
      const ms = body.milestone as Record<string, unknown> | undefined;
      const name = ms?.name ? `"${ms.name}"` : 'milestone';
      const goalLabel = ms?.goalId
        ? entityName('goals', ms.goalId as string, '')
        : '';
      return `${user}created milestone ${name}${goalLabel ? ` in ${goalLabel}` : ''}`;
    }
    case 'addTaskToGoal': {
      const task = body.task as Record<string, unknown> | undefined;
      const taskLabel = task?.name
        ? `"${task.name}"`
        : entityName('tasks', (body.taskId ?? '') as string, String(body.taskId ?? ''));
      const goalLabel = entityName('goals', (body.goalId ?? '') as string, '');
      return `${user}added task ${taskLabel}${goalLabel ? ` to ${goalLabel}` : ''}`;
    }
    case 'removeTaskFromGoal': {
      const taskLabel = entityName('tasks', (body.taskId ?? '') as string, String(body.taskId ?? ''));
      const goalLabel = entityName('goals', (body.goalId ?? '') as string, '');
      return `${user}removed task ${taskLabel}${goalLabel ? ` from ${goalLabel}` : ''}`;
    }
    case 'removeMilestoneFromGoal': {
      const msLabel = entityName('milestones', (body.milestoneId ?? '') as string, String(body.milestoneId ?? ''));
      const goalLabel = entityName('goals', (body.goalId ?? '') as string, '');
      return `${user}removed milestone ${msLabel}${goalLabel ? ` from ${goalLabel}` : ''}`;
    }
    case 'removeWorker':
      return `${user}deleted ${entityName('workers', id, `worker ${id.slice(0, 8)}`)}`;
    case 'removeProject':
      return `${user}deleted ${entityName('projects', id, `project ${id.slice(0, 8)}`)}`;
    case 'removeDepartment':
      return `${user}deleted ${entityName('departments', id, `department ${id.slice(0, 8)}`)}`;
    case 'removeTask':
      return `${user}deleted ${entityName('tasks', id, `task ${id.slice(0, 8)}`)}`;
    case 'removeMilestone':
      return `${user}deleted ${entityName('milestones', id, `milestone ${id.slice(0, 8)}`)}`;
    default:
      return `${user}performed ${type}`;
  }
}

export const router = Router();

// --- State ---

router.get('/state', (_req, res) => {
  try {
    const entities = getAllEntities();
    const locks = getAllLocks();
    const presence = getPresence();
    res.json({ entities, locks, presence, lastModified: getLastModified() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Mutations ---

// Dev fallback admin password (override with ADMIN_PASSWORD env var)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2026';

// --- Auth ---

router.post('/auth/upgrade-admin', (req, res) => {
  const { userName, password } = req.body;
  if (!userName || !password) {
    res.status(400).json({ error: 'userName and password are required' });
    return;
  }
  if (password !== ADMIN_PASSWORD) {
    res.status(403).json({ success: false, error: 'Invalid password' });
    return;
  }
  // Admin is session-only — don't persist to DB. Just validate and respond.
  res.json({ success: true, role: 'admin' });
});

router.post('/users/:name/role', (req, res) => {
  const targetName = req.params.name;
  const { role, adminPassword } = req.body;
  if (!role) {
    res.status(400).json({ error: 'role is required' });
    return;
  }
  if (!['worker', 'coordinator'].includes(role)) {
    res.status(400).json({ error: 'Invalid role. Only worker and coordinator can be assigned.' });
    return;
  }
  // Admin is session-only, so require admin password to prove authorization
  if (adminPassword !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Admin password required to change roles' });
    return;
  }
  try {
    const user = updateUserRole(targetName, role);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Mutations ---

// Mutation types that require coordinator or admin
const EDITOR_MUTATIONS = new Set([
  'updateTask', 'updateMilestone', 'updateGoal',
  'addGoal', 'removeGoal', 'addMilestone', 'addTaskToGoal', 'removeTaskFromGoal', 'removeMilestoneFromGoal',
  'updateProject', 'updateDepartment', 'updateWorker',
  'removeWorker', 'removeProject', 'removeDepartment', 'removeTask', 'removeMilestone',
]);

// Fields a worker can update on their own tasks
const WORKER_ALLOWED_TASK_FIELDS = new Set(['status', 'startedAt', 'completedAt']);

function isWorkerAllowedMutation(type: string, body: Record<string, unknown>): boolean {
  if (type !== 'updateTask') return false;
  const updates = body.updates as Record<string, unknown> | undefined;
  if (!updates) return false;
  // All update keys must be in the allowed set
  return Object.keys(updates).every(k => WORKER_ALLOWED_TASK_FIELDS.has(k));
}

router.post('/mutations/:type', (req, res) => {
  const { type } = req.params;
  const body = req.body;

  // Role validation
  if (EDITOR_MUTATIONS.has(type) && body.userName) {
    // Admin is session-only (not in DB), so accept client-claimed role if admin
    // For worker/coordinator, verify against DB
    const clientRole = body.role ?? 'worker';
    const user = getUserByName(body.userName);
    const dbRole = user?.role ?? 'worker';
    // Use the higher-privilege role: admin from client (session) or DB role
    const effectiveRole = clientRole === 'admin' ? 'admin' : dbRole;
    if (effectiveRole === 'worker' && !isWorkerAllowedMutation(type, body)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
  }

  // Build message BEFORE mutation so entity names are still in DB for remove ops
  const humanMessage = buildHumanMessage(type, body);
  const logId = (body.entityId ?? body.goalId ?? body.taskId) as string | undefined;

  try {
    let result: unknown;
    switch (type) {
      case 'updateTask':
        result = updateTask(body.entityId, body.updates);
        break;
      case 'updateMilestone':
        result = updateMilestone(body.entityId, body.updates);
        break;
      case 'updateGoal':
        result = updateGoal(body.entityId, body.updates);
        break;
      case 'updateDepartment':
        result = updateDepartment(body.entityId, body.updates);
        break;
      case 'updateProject':
        result = updateProject(body.entityId, body.updates);
        break;
      case 'updateWorker':
        result = updateWorker(body.entityId, body.updates);
        break;
      case 'addGoal':
        result = addGoal(body.goal);
        break;
      case 'removeGoal':
        result = removeGoal(body.goalId as string);
        break;
      case 'addMilestone':
        result = addMilestone(body.milestone);
        break;
      case 'addTaskToGoal':
        result = addTaskToGoal(body.goalId, body.task);
        break;
      case 'removeTaskFromGoal':
        result = removeTaskFromGoal(body.goalId, body.taskId);
        break;
      case 'removeMilestoneFromGoal':
        result = removeMilestoneFromGoal(body.goalId, body.milestoneId);
        break;
      case 'removeWorker':
        result = removeWorker(body.entityId as string);
        break;
      case 'removeProject':
        result = removeProject(body.entityId as string);
        break;
      case 'removeDepartment':
        result = removeDepartment(body.entityId as string);
        break;
      case 'removeTask':
        result = removeTask(body.entityId as string);
        break;
      case 'removeMilestone':
        result = removeMilestone(body.entityId as string);
        break;
      default:
        res.status(400).json({ error: `Unknown mutation type: ${type}` });
        return;
    }
    // Return full state after mutation so client stays in sync
    const entities = getAllEntities();
    logMutation(type, body.userName, logId, true, undefined, humanMessage);
    res.json({ result, entities, lastModified: getLastModified() });
  } catch (err) {
    logMutation(type, body.userName, logId, false, err as Error, humanMessage);
    if (err instanceof BlockedByReferencesError) {
      res.status(409).json({ error: err.message, blockers: err.blockers });
      return;
    }
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Polling ---

router.get('/poll', (req, res) => {
  const since = req.query.since as string;
  try {
    const lastModified = getLastModified();
    if (since && since >= lastModified) {
      // No changes
      const locks = getAllLocks();
      const presence = getPresence();
      res.json({ changed: false, locks, presence, lastModified });
    } else {
      const entities = since ? getChangedEntitiesSince(since) : getAllEntities();
      const locks = getAllLocks();
      const presence = getPresence();
      res.json({ changed: true, entities, locks, presence, lastModified });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Users ---

router.get('/users', (_req, res) => {
  try {
    res.json(getUsers());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/users', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Name is required' });
    return;
  }
  try {
    const user = createUser(name.trim());
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/users/:name', (req, res) => {
  const user = getUserByName(req.params.name);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

// --- Locks ---

router.get('/locks', (_req, res) => {
  try {
    res.json(getAllLocks());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/locks/acquire', (req, res) => {
  const { scope, userName } = req.body;
  if (!scope || !userName) {
    res.status(400).json({ error: 'scope and userName are required' });
    return;
  }
  try {
    const result = acquireLock(scope, userName);
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(409).json({ success: false, lockedBy: result.lockedBy });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/locks/release', (req, res) => {
  const { scope, userName } = req.body;
  if (!scope || !userName) {
    res.status(400).json({ error: 'scope and userName are required' });
    return;
  }
  try {
    releaseLock(scope, userName);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Presence ---

router.post('/presence/heartbeat', (req, res) => {
  const { scope, userName } = req.body;
  if (!scope || !userName) {
    res.status(400).json({ error: 'scope and userName are required' });
    return;
  }
  try {
    heartbeatPresence(scope, userName);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/presence/leave', (req, res) => {
  const { scope, userName } = req.body;
  if (!scope || !userName) {
    res.status(400).json({ error: 'scope and userName are required' });
    return;
  }
  try {
    removePresence(scope, userName);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// === SG Sync Routes ===

import {
  upsertTaskFromSg,
  archiveTaskFromSg,
  upsertProjectFromSg,
  archiveProjectFromSg,
  upsertWorkerFromSg,
  archiveWorkerFromSg,
  replaceProjectsFromSg,
  replaceWorkersFromSg,
  setSgSiteName,
  SgTicketPayload,
  SgProjectPayload,
  SgUserPayload,
} from './mutations';

const SG_INTERNAL_SECRET = process.env.SG_INTERNAL_SECRET || 'sg-internal-dev-secret';

const requireSgSecret: RequestHandler = (req, res, next) => {
  if (req.headers['x-sg-secret'] !== SG_INTERNAL_SECRET) {
    res.status(403).json({ error: 'Forbidden: invalid SG internal secret' });
    return;
  }
  next();
}

router.post('/sg/sync/task', requireSgSecret, (req, res) => {
  const payload = req.body as SgTicketPayload & { goalId?: string };
  if (!payload || !payload.id) {
    res.status(400).json({ error: 'Invalid payload: id required' });
    return;
  }
  try {
    const result = upsertTaskFromSg(payload, payload.goalId);
    const entities = getAllEntities();
    logSgSync('task', payload.id, 'sync', true);
    res.json({ result, entities, lastModified: getLastModified() });
  } catch (err) {
    logSgSync('task', payload.id, 'sync', false, err as Error);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/sg/archive/task', requireSgSecret, (req, res) => {
  const { sgTicketId } = req.body as { sgTicketId: number };
  if (!sgTicketId) {
    res.status(400).json({ error: 'sgTicketId required' });
    return;
  }
  try {
    const result = archiveTaskFromSg(sgTicketId);
    const entities = getAllEntities();
    logSgSync('task', sgTicketId, 'archive', true);
    res.json({ result, entities, lastModified: getLastModified() });
  } catch (err) {
    logSgSync('task', sgTicketId, 'archive', false, err as Error);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/sg/sync/worker', requireSgSecret, (req, res) => {
  const payload = req.body as SgUserPayload;
  if (!payload || !payload.id) {
    res.status(400).json({ error: 'Invalid payload: id required' });
    return;
  }
  try {
    const result = upsertWorkerFromSg(payload);
    const entities = getAllEntities();
    logSgSync('worker', payload.id, 'sync', true);
    res.json({ result, entities, lastModified: getLastModified() });
  } catch (err) {
    logSgSync('worker', payload.id, 'sync', false, err as Error);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/sg/archive/worker', requireSgSecret, (req, res) => {
  const { sgUserId } = req.body as { sgUserId: number };
  if (!sgUserId) {
    res.status(400).json({ error: 'sgUserId required' });
    return;
  }
  try {
    const result = archiveWorkerFromSg(sgUserId);
    const entities = getAllEntities();
    logSgSync('worker', sgUserId, 'archive', true);
    res.json({ result, entities, lastModified: getLastModified() });
  } catch (err) {
    logSgSync('worker', sgUserId, 'archive', false, err as Error);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/sg/sync/project', requireSgSecret, (req, res) => {
  const payload = req.body as SgProjectPayload;
  if (!payload || !payload.id) {
    res.status(400).json({ error: 'Invalid payload: id required' });
    return;
  }
  try {
    const result = upsertProjectFromSg(payload);
    const entities = getAllEntities();
    logSgSync('project', payload.id, 'sync', true);
    res.json({ result, entities, lastModified: getLastModified() });
  } catch (err) {
    logSgSync('project', payload.id, 'sync', false, err as Error);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/sg/archive/project', requireSgSecret, (req, res) => {
  const { sgProjectId } = req.body as { sgProjectId: number };
  if (!sgProjectId) {
    res.status(400).json({ error: 'sgProjectId required' });
    return;
  }
  try {
    const result = archiveProjectFromSg(sgProjectId);
    const entities = getAllEntities();
    logSgSync('project', sgProjectId, 'archive', true);
    res.json({ result, entities, lastModified: getLastModified() });
  } catch (err) {
    logSgSync('project', sgProjectId, 'archive', false, err as Error);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Set SG_WRITE_DISABLED=1 in any environment that must not push back to the
// real ShotGrid site (test, staging, CI, local dev pointing at prod SG).
// The two endpoints below are the ONLY paths in the app that mutate SG.
const SG_WRITE_DISABLED = process.env.SG_WRITE_DISABLED === '1' || process.env.SG_WRITE_DISABLED === 'true';

// Defaults applied when no user override exists for a given TaskStatus. The
// admin can override these per site via Settings → SG → Status Mapping
// (Outbound); the saved values land in the `meta` table and merge on top.
//
// Values reflect the codes used on most live SG sites in this org:
//   res  = resolved   · ip  = in progress
//   rdy  = ready      · bkd = blocked
//   hld  = on hold    · opn = open
const DEFAULT_SG_STATUS_MAP: Record<string, string> = {
  completed:   'res',
  in_progress: 'ip',
  available:   'rdy',
  blocked:     'bkd',
  paused:      'hld',
  locked:      'opn',
};

function loadSgStatusMap(): Record<string, string> {
  const raw = getMeta('sg_status_map');
  if (!raw) return DEFAULT_SG_STATUS_MAP;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    // Fill in any missing keys from defaults so an incomplete saved map
    // can never produce undefined when looked up.
    return { ...DEFAULT_SG_STATUS_MAP, ...parsed };
  } catch {
    return DEFAULT_SG_STATUS_MAP;
  }
}

// Read the current TaskStatus → SG sg_status_list mapping.
// Open to all authenticated users so the frontend can populate
// mapTaskStatusToSg on load.
router.get('/sg/status-map', (_req, res) => {
  res.json({ map: loadSgStatusMap(), defaults: DEFAULT_SG_STATUS_MAP });
});

// Save a new mapping (admin only). Body: { adminPassword, map }.
router.post('/sg/status-map', (req, res) => {
  const { adminPassword, map } = req.body as { adminPassword?: string; map?: Record<string, string> };
  if (adminPassword !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Admin password required' });
    return;
  }
  if (!map || typeof map !== 'object') {
    res.status(400).json({ error: 'map object is required' });
    return;
  }
  // Validate: keys must be known TaskStatus values, values must be non-empty strings.
  const allowedKeys = Object.keys(DEFAULT_SG_STATUS_MAP);
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    if (!allowedKeys.includes(k)) continue;
    if (typeof v !== 'string' || !v.trim()) continue;
    clean[k] = v.trim();
  }
  setMeta('sg_status_map', JSON.stringify(clean));
  logSgSync('status-map', 'all', 'sync', true);
  res.json({ success: true, map: loadSgStatusMap() });
});

// --- Inbound SG status mapping (SG sg_status_list code → local TaskStatus) ---
// Stored as { [sgCode]: TaskStatus }. Unmapped codes fall through to keyword
// matching in mapSgStatusToTaskStatus(); unknown codes default to 'available'.
//
// Defaults reflect the SG codes most commonly seen in this org. The admin can
// override per site via Settings → SG → Status Mapping (Inbound); saved values
// merge on top so partial overrides still get the rest of the defaults.

const ALLOWED_TASK_STATUSES = new Set([
  'completed', 'in_progress', 'available', 'paused', 'blocked', 'locked',
]);

export const DEFAULT_SG_STATUS_MAP_INBOUND: Record<string, string> = {
  res:  'completed',
  ip:   'in_progress',
  cdrv: 'in_progress',  // code review
  kckb: 'in_progress',  // kick-back
  rev:  'in_progress',  // review
  wfb:  'in_progress',  // waiting for feedback
  rdy:  'available',
  tri:  'available',    // triage
  bkd:  'blocked',
  hld:  'paused',       // on hold
  opn:  'locked',
  omt:  'locked',       // omit
};

function loadInboundStatusMap(): Record<string, string> {
  const raw = getMeta('sg_status_map_inbound');
  if (!raw) return { ...DEFAULT_SG_STATUS_MAP_INBOUND };
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SG_STATUS_MAP_INBOUND };
    // User overrides merge on top of defaults so a partial save doesn't lose
    // unrelated mappings.
    return { ...DEFAULT_SG_STATUS_MAP_INBOUND, ...parsed };
  } catch {
    return { ...DEFAULT_SG_STATUS_MAP_INBOUND };
  }
}

router.get('/sg/status-map-inbound', (_req, res) => {
  res.json({ map: loadInboundStatusMap(), defaults: DEFAULT_SG_STATUS_MAP_INBOUND });
});

router.post('/sg/status-map-inbound', (req, res) => {
  const { adminPassword, map } = req.body as { adminPassword?: string; map?: Record<string, string> };
  if (adminPassword !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Admin password required' });
    return;
  }
  if (!map || typeof map !== 'object') {
    res.status(400).json({ error: 'map object is required' });
    return;
  }
  // Validate: keys are non-empty SG codes, values are known TaskStatus values.
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    if (typeof k !== 'string' || !k.trim()) continue;
    if (typeof v !== 'string' || !ALLOWED_TASK_STATUSES.has(v)) continue;
    clean[k.trim()] = v;
  }
  setMeta('sg_status_map_inbound', JSON.stringify(clean));
  logSgSync('status-map-inbound', 'all', 'sync', true);
  res.json({ success: true, map: clean });
});

// Update task status in ShotGrid (tech-tree → SG sync)
router.post('/sg/update-task-status', requireSgSecret, (req, res) => {
  const { sgTicketId, status } = req.body as { sgTicketId?: number; status?: string };
  if (!sgTicketId || !status) {
    res.status(400).json({ error: 'sgTicketId and status are required' });
    return;
  }
  if (SG_WRITE_DISABLED) {
    res.json({ success: true, skipped: true, reason: 'SG_WRITE_DISABLED' });
    return;
  }
  const projectRoot = path.resolve(import.meta.dirname, '..');
  const pythonCmd = process.env.PYTHON_CMD || 'python';
  execFile(
    pythonCmd,
    ['sg_client.py', 'update-ticket-status', `--id=${sgTicketId}`, `--status=${status}`],
    { cwd: projectRoot, timeout: 30_000, env: { ...process.env } },
    (err, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      if (err) {
        res.status(500).json({ error: output || err.message });
        return;
      }
      res.json({ success: true, output });
    },
  );
});

// Update task priority in ShotGrid (tech-tree → SG sync, priority 1-5)
router.post('/sg/update-task-priority', requireSgSecret, (req, res) => {
  const { sgTicketId, priority } = req.body as { sgTicketId?: number; priority?: number };
  if (!sgTicketId || priority == null) {
    res.status(400).json({ error: 'sgTicketId and priority are required' });
    return;
  }
  if (SG_WRITE_DISABLED) {
    res.json({ success: true, skipped: true, reason: 'SG_WRITE_DISABLED' });
    return;
  }
  const projectRoot = path.resolve(import.meta.dirname, '..');
  const pythonCmd = process.env.PYTHON_CMD || 'python';
  execFile(
    pythonCmd,
    ['sg_client.py', 'update-ticket-priority', `--id=${sgTicketId}`, `--priority=${priority}`],
    { cwd: projectRoot, timeout: 30_000, env: { ...process.env } },
    (err, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      if (err) {
        res.status(500).json({ error: output || err.message });
        return;
      }
      res.json({ success: true, output });
    },
  );
});

router.post('/sg/bootstrap', (req, res) => {
  const { adminPassword, siteName, projects, workers, tickets } = req.body as {
    adminPassword?: string;
    siteName?: string;
    projects?: SgProjectPayload[];
    workers?: SgUserPayload[];
    tickets?: (SgTicketPayload & { goalId?: string })[];
  };
  if (adminPassword !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Admin password required' });
    return;
  }
  try {
    // Replace the synthetic Company name with the SG site name so the breadcrumb
    // header reflects the actual source instead of the mock "Acme VFX".
    if (siteName) setSgSiteName(siteName);
    if (projects) replaceProjectsFromSg(projects);
    if (workers) replaceWorkersFromSg(workers);
    if (tickets) {
      for (const t of tickets) {
        upsertTaskFromSg(t, t.goalId);
      }
    }
    const entities = getAllEntities();
    res.json({ success: true, entities, lastModified: getLastModified() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Receive departments batch from Python sync script
router.post('/sg/sync-departments', (req, res) => {
  const { adminPassword, departments } = req.body as {
    adminPassword?: string;
    departments?: SgDepartmentPayload[];
  };
  if (adminPassword !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Admin password required' });
    return;
  }
  try {
    if (departments) replaceDepartmentsFromSg(departments);
    res.json({ success: true, synced: departments?.length ?? 0, entities: getAllEntities(), lastModified: getLastModified() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- SG Sync management ---

router.get('/sg/status', (_req, res) => {
  try {
    const url = process.env.SG_URL || '';
    const configured = !!(process.env.SG_URL && (process.env.API_KEY || process.env.SG_ED_API_KEY));
    const countSg = (table: string) =>
      (db.prepare(`SELECT COUNT(*) as n FROM entities WHERE table_name=? AND JSON_EXTRACT(data,'$.syncSource')='sg'`).get(table) as { n: number }).n;
    const counts = {
      projects: countSg('projects'),
      workers: countSg('workers'),
      tasks: countSg('tasks'),
    };
    res.json({ url, configured, counts, lastModified: getLastModified() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Fetch available project/ticket statuses from SG (runs Python subprocess)
router.post('/sg/list-statuses', (req, res) => {
  const { adminPassword } = req.body as { adminPassword?: string };
  if (adminPassword !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Admin password required' });
    return;
  }
  const projectRoot = path.resolve(import.meta.dirname, '..');
  const pythonCmd = process.env.PYTHON_CMD || 'python';
  execFile(
    pythonCmd,
    ['sg_client.py', 'list-statuses'],
    { cwd: projectRoot, timeout: 30_000, env: { ...process.env } },
    (err, stdout, stderr) => {
      if (err) {
        res.status(500).json({ error: stderr || err.message });
        return;
      }
      try {
        // stdout is the JSON line from cmd_list_statuses
        const jsonLine = stdout.trim().split('\n').find(l => l.startsWith('{'));
        const data = JSON.parse(jsonLine || stdout.trim());
        res.json(data);
      } catch {
        res.status(500).json({ error: 'Failed to parse status list', raw: stdout });
      }
    },
  );
});

// Fetch available SG projects (id, name, sg_status) for the import-filter picker.
// Same auth pattern as list-statuses.
router.post('/sg/list-projects', (req, res) => {
  const { adminPassword } = req.body as { adminPassword?: string };
  if (adminPassword !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Admin password required' });
    return;
  }
  const projectRoot = path.resolve(import.meta.dirname, '..');
  const pythonCmd = process.env.PYTHON_CMD || 'python';
  execFile(
    pythonCmd,
    ['sg_client.py', 'list-projects'],
    { cwd: projectRoot, timeout: 60_000, env: { ...process.env } },
    (err, stdout, stderr) => {
      if (err) {
        res.status(500).json({ error: stderr || err.message });
        return;
      }
      try {
        const jsonLine = stdout.trim().split('\n').find(l => l.startsWith('{'));
        const data = JSON.parse(jsonLine || stdout.trim());
        res.json(data);
      } catch {
        res.status(500).json({ error: 'Failed to parse project list', raw: stdout });
      }
    },
  );
});

// Trigger per-entity sync via Python subcommand
router.post('/sg/trigger-sync', (req, res) => {
  const { adminPassword, entity, statuses, projectIds, sgId } = req.body as {
    adminPassword?: string;
    entity: 'projects' | 'departments' | 'workers' | 'tickets' | 'ticket-by-id' | 'project-by-id' | 'worker-by-id' | 'bootstrap';
    statuses?: string[];
    projectIds?: number[];
    sgId?: number;
  };
  if (adminPassword !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Admin password required' });
    return;
  }
  if (entity === 'ticket-by-id' || entity === 'project-by-id' || entity === 'worker-by-id') {
    if (!sgId) {
      res.status(400).json({ error: 'sgId required' });
      return;
    }
    const subcmdMap: Record<string, string> = {
      'ticket-by-id': 'sync-ticket-by-id',
      'project-by-id': 'sync-project-by-id',
      'worker-by-id': 'sync-worker-by-id',
    };
    const projectRoot = path.resolve(import.meta.dirname, '..');
    const pythonCmd = process.env.PYTHON_CMD || 'python';
    execFile(
      pythonCmd,
      ['sg_client.py', subcmdMap[entity], `--id=${sgId}`],
      { cwd: projectRoot, timeout: 30_000, env: { ...process.env } },
      (err, stdout, stderr) => {
        const output = [stdout, stderr].filter(Boolean).join('\n').trim();
        const success = !err;
        res.json({ success, output, exitCode: err?.code ?? 0 });
      },
    );
    return;
  }
  const batchSubcmdMap: Record<string, string[]> = {
    projects:    [
      'sync-projects',
      ...(statuses?.length ? [`--statuses=${statuses.join(',')}`] : []),
      // Same convention as tickets: only narrow when the caller has explicitly
      // restricted to a subset of project IDs. Otherwise leave unbounded so
      // newly-created SG projects in the matching statuses are picked up
      // automatically on the next import.
      ...(projectIds?.length ? [`--project-ids=${projectIds.join(',')}`] : []),
    ],
    departments: ['sync-departments'],
    workers:     ['sync-workers'],
    tickets:     [
      'sync-tickets',
      ...(statuses?.length ? [`--statuses=${statuses.join(',')}`] : []),
      // Empty projectIds means "all projects" — don't pass the flag at all
      // so we match the existing no-filter behavior.
      ...(projectIds?.length ? [`--project-ids=${projectIds.join(',')}`] : []),
    ],
    bootstrap:   ['bootstrap'],
  };
  const args = batchSubcmdMap[entity];
  if (!args) {
    res.status(400).json({ error: `Unknown entity: ${entity}` });
    return;
  }
  const projectRoot = path.resolve(import.meta.dirname, '..');
  const pythonCmd = process.env.PYTHON_CMD || 'python';
  execFile(
    pythonCmd,
    ['sg_client.py', ...args],
    { cwd: projectRoot, timeout: 600_000, env: { ...process.env } },
    (err, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      const success = !err || err.code === 0;
      res.json({ success, output, exitCode: err?.code ?? 0, entities: getAllEntities(), lastModified: getLastModified() });
    },
  );
});

router.post('/sg/trigger-bootstrap', (req, res) => {
  const { adminPassword } = req.body as { adminPassword?: string };
  if (adminPassword !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Admin password required' });
    return;
  }
  const projectRoot = path.resolve(import.meta.dirname, '..');
  const pythonCmd = process.env.PYTHON_CMD || 'python';
  execFile(
    pythonCmd,
    ['sg_client.py'],
    { cwd: projectRoot, timeout: 600_000, env: { ...process.env } },
    (err, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      if (err && err.code !== 0) {
        res.json({ success: false, output, exitCode: err.code ?? 1, entities: getAllEntities(), lastModified: getLastModified() });
      } else {
        res.json({ success: true, output, exitCode: 0, entities: getAllEntities(), lastModified: getLastModified() });
      }
    },
  );
});

// Set the Studio / Company name shown in the top-left header. Admin-only.
// Reuses the same code path as SG bootstrap so the result is identical whether
// the name comes from the Settings input or from a fresh SG site import.
router.post('/company/name', (req, res) => {
  const { adminPassword, name } = req.body as { adminPassword?: string; name?: string };
  if (adminPassword !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Admin password required' });
    return;
  }
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  try {
    const company = setSgSiteName(name.trim());
    res.json({ success: true, company, entities: getAllEntities(), lastModified: getLastModified() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/sg/clear-sg-data', (req, res) => {
  const { adminPassword } = req.body as { adminPassword?: string };
  if (adminPassword !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Admin password required' });
    return;
  }
  try {
    const result = db.prepare(`DELETE FROM entities WHERE JSON_EXTRACT(data,'$.syncSource')='sg'`).run();
    res.json({ deleted: result.changes, entities: getAllEntities(), lastModified: getLastModified() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Bulk wipe of all tickets (or only SG-synced tickets when scope='sg').
// Drops references in workers/goals/milestones first so the DB never holds
// dangling task-IDs. Scope 'all' is the default and matches what the user
// sees in the "Clear all tickets" button.
router.post('/sg/clear-all-tickets', (req, res) => {
  const { adminPassword, scope } = req.body as { adminPassword?: string; scope?: 'all' | 'sg' };
  if (adminPassword !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Admin password required' });
    return;
  }
  try {
    const deleted = bulkClearTickets({ onlySg: scope === 'sg' });
    logMutation('bulkClearTickets', undefined, scope ?? 'all', true, undefined, `cleared ${deleted} tickets (scope=${scope ?? 'all'})`);
    res.json({ deleted, entities: getAllEntities(), lastModified: getLastModified() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/sg/clear-all-workers', (req, res) => {
  const { adminPassword, scope } = req.body as { adminPassword?: string; scope?: 'all' | 'sg' };
  if (adminPassword !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Admin password required' });
    return;
  }
  try {
    const deleted = bulkClearWorkers({ onlySg: scope === 'sg' });
    logMutation('bulkClearWorkers', undefined, scope ?? 'all', true, undefined, `cleared ${deleted} workers (scope=${scope ?? 'all'})`);
    res.json({ deleted, entities: getAllEntities(), lastModified: getLastModified() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// --- Logs ---

router.get('/logs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const offset = parseInt(req.query.offset as string) || 0;
  try {
    const result = getLogs(limit, offset);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/logs/clear', (req, res) => {
  const { adminPassword } = req.body as { adminPassword?: string };
  if (adminPassword !== ADMIN_PASSWORD) {
    res.status(403).json({ error: 'Admin password required' });
    return;
  }
  try {
    clearLogs();
    logger.info('Logs cleared by admin');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
