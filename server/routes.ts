import { Router } from 'express';
import type { RequestHandler } from 'express';
import { execFile } from 'child_process';
import path from 'path';
import {
  getAllEntities, getLastModified, getChangedEntitiesSince,
  acquireLock, releaseLock, getAllLocks,
  heartbeatPresence, removePresence, getPresence,
  createUser, getUsers, getUserByName, updateUserRole,
  db,
} from './db';
import {
  updateTask, updateMilestone, updateGoal,
  updateDepartment, updateProject, updateWorker,
  addGoal, removeGoal, addMilestone,
  addTaskToGoal, removeTaskFromGoal, removeMilestoneFromGoal,
  replaceDepartmentsFromSg,
} from './mutations';
import type { SgDepartmentPayload } from './mutations';
import { logger, logMutation, logSgSync, getLogs, clearLogs } from './utils/logger';

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
      default:
        res.status(400).json({ error: `Unknown mutation type: ${type}` });
        return;
    }
    // Return full state after mutation so client stays in sync
    const entities = getAllEntities();
    logMutation(type, body.userName, body.entityId ?? body.goalId ?? body.taskId, true);
    res.json({ result, entities, lastModified: getLastModified() });
  } catch (err) {
    logMutation(type, body.userName, body.entityId ?? body.goalId ?? body.taskId, false, err as Error);
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

// Update task status in ShotGrid (tech-tree → SG sync)
router.post('/sg/update-task-status', (req, res) => {
  const { sgTicketId, status } = req.body as { sgTicketId?: number; status?: string };
  if (!sgTicketId || !status) {
    res.status(400).json({ error: 'sgTicketId and status are required' });
    return;
  }
  const projectRoot = path.resolve(import.meta.dirname, '..');
  const pythonCmd = process.env.PYTHON_CMD || 'python';
  execFile(
    pythonCmd,
    ['sg_bootstrap.py', 'update-ticket-status', `--id=${sgTicketId}`, `--status=${status}`],
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
    ['sg_bootstrap.py', 'list-statuses'],
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

// Trigger per-entity sync via Python subcommand
router.post('/sg/trigger-sync', (req, res) => {
  const { adminPassword, entity, statuses, sgId } = req.body as {
    adminPassword?: string;
    entity: 'projects' | 'departments' | 'workers' | 'tickets' | 'ticket-by-id' | 'project-by-id' | 'worker-by-id' | 'bootstrap';
    statuses?: string[];
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
      ['sg_bootstrap.py', subcmdMap[entity], `--id=${sgId}`],
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
    projects:    ['sync-projects',    ...(statuses?.length ? [`--statuses=${statuses.join(',')}`] : [])],
    departments: ['sync-departments'],
    workers:     ['sync-workers'],
    tickets:     ['sync-tickets',     ...(statuses?.length ? [`--statuses=${statuses.join(',')}`] : [])],
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
    ['sg_bootstrap.py', ...args],
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
    ['sg_bootstrap.py'],
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
