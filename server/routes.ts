import { Router } from 'express';
import {
  getAllEntities, getLastModified, getChangedEntitiesSince,
  acquireLock, releaseLock, getAllLocks,
  heartbeatPresence, removePresence, getPresence,
  createUser, getUsers, getUserByName, updateUserRole,
} from './db';
import {
  updateTask, updateMilestone, updateGoal,
  updateDepartment, updateProject, updateWorker,
  addGoal, addMilestone,
  addTaskToGoal, removeTaskFromGoal,
} from './mutations';

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
  'addGoal', 'addMilestone', 'addTaskToGoal', 'removeTaskFromGoal',
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
      case 'addMilestone':
        result = addMilestone(body.milestone);
        break;
      case 'addTaskToGoal':
        result = addTaskToGoal(body.goalId, body.task);
        break;
      case 'removeTaskFromGoal':
        result = removeTaskFromGoal(body.goalId, body.taskId);
        break;
      default:
        res.status(400).json({ error: `Unknown mutation type: ${type}` });
        return;
    }
    // Return full state after mutation so client stays in sync
    const entities = getAllEntities();
    res.json({ result, entities, lastModified: getLastModified() });
  } catch (err) {
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
