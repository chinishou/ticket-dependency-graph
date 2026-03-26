import { Router } from 'express';
import {
  getAllEntities, getLastModified, getChangedEntitiesSince,
  acquireLock, releaseLock, getAllLocks,
  heartbeatPresence, removePresence, getPresence,
  createUser, getUsers,
} from './db';
import {
  updateTask, updateMilestone, updateGoal,
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

router.post('/mutations/:type', (req, res) => {
  const { type } = req.params;
  const body = req.body;

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
    res.json(createUser(name.trim()));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
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
