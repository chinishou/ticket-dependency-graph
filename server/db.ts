import 'dotenv/config';
import Database from 'better-sqlite3';
import path from 'path';
import {
  company, departments, projects, goals, tasks, milestones, workers,
} from '../src/data/mockData';
import { logger } from './utils/logger';

const DB_PATH = path.join(import.meta.dirname, '..', 'data.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS entities (
    table_name TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (table_name, id)
  );

  CREATE TABLE IF NOT EXISTS users (
    name TEXT PRIMARY KEY,
    role TEXT DEFAULT 'worker',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS edit_locks (
    scope TEXT PRIMARY KEY,
    locked_by TEXT NOT NULL,
    locked_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS presence (
    scope TEXT NOT NULL,
    user_name TEXT NOT NULL,
    last_seen TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (scope, user_name)
  );

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Migrate: add role column if missing
try {
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'worker'`);
} catch {
  // Column already exists
}

// Admin is session-only — downgrade any persisted admin roles to worker
db.prepare(`UPDATE users SET role = 'worker' WHERE role = 'admin'`).run();

// Track last-modified for polling
db.exec(`
  INSERT OR IGNORE INTO meta (key, value) VALUES ('last_modified', datetime('now'));
`);

function touchLastModified() {
  db.prepare(`UPDATE meta SET value = datetime('now') WHERE key = 'last_modified'`).run();
}

// Seed data if empty
const count = db.prepare('SELECT COUNT(*) as c FROM entities').get() as { c: number };
if (count.c === 0) {
  const insert = db.prepare('INSERT INTO entities (table_name, id, data) VALUES (?, ?, ?)');
  const seedAll = db.transaction(() => {
    // Company
    insert.run('companies', company.id, JSON.stringify(company));
    // Departments
    for (const d of departments) insert.run('departments', d.id, JSON.stringify(d));
    // Projects
    for (const p of projects) insert.run('projects', p.id, JSON.stringify(p));
    // Goals
    for (const g of goals) insert.run('goals', g.id, JSON.stringify(g));
    // Tasks
    for (const t of tasks) insert.run('tasks', t.id, JSON.stringify(t));
    // Milestones
    for (const m of milestones) insert.run('milestones', m.id, JSON.stringify(m));
    // Workers
    for (const w of workers) insert.run('workers', w.id, JSON.stringify(w));
  });
  seedAll();
  logger.info('Database seeded with mock data');
}

// --- Query helpers ---

export function getAllEntities() {
  const rows = db.prepare('SELECT table_name, id, data FROM entities ORDER BY table_name, id').all() as {
    table_name: string; id: string; data: string;
  }[];

  const result: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    if (!result[row.table_name]) result[row.table_name] = {};
    result[row.table_name][row.id] = JSON.parse(row.data);
  }
  return result;
}

export function getEntity(tableName: string, id: string): unknown | null {
  const row = db.prepare('SELECT data FROM entities WHERE table_name = ? AND id = ?').get(tableName, id) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}

export function upsertEntity(tableName: string, id: string, data: unknown) {
  db.prepare(
    'INSERT OR REPLACE INTO entities (table_name, id, data, updated_at) VALUES (?, ?, ?, datetime(\'now\'))'
  ).run(tableName, id, JSON.stringify(data));
}

export function deleteEntity(tableName: string, id: string) {
  db.prepare('DELETE FROM entities WHERE table_name = ? AND id = ?').run(tableName, id);
}

export function getLastModified(): string {
  const row = db.prepare('SELECT value FROM meta WHERE key = \'last_modified\'').get() as { value: string };
  return row.value;
}

export function getChangedEntitiesSince(since: string) {
  const rows = db.prepare(
    'SELECT table_name, id, data FROM entities WHERE updated_at > ? ORDER BY table_name, id'
  ).all(since) as { table_name: string; id: string; data: string }[];

  const result: Record<string, Record<string, unknown>> = {};
  for (const row of rows) {
    if (!result[row.table_name]) result[row.table_name] = {};
    result[row.table_name][row.id] = JSON.parse(row.data);
  }
  return result;
}

// --- Lock helpers ---

export function acquireLock(scope: string, userName: string): { success: boolean; lockedBy?: string } {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // Check existing lock
  const existing = db.prepare('SELECT locked_by, expires_at FROM edit_locks WHERE scope = ?').get(scope) as {
    locked_by: string; expires_at: string;
  } | undefined;

  if (existing && existing.locked_by !== userName && existing.expires_at > now) {
    return { success: false, lockedBy: existing.locked_by };
  }

  // Acquire or refresh
  db.prepare(
    'INSERT OR REPLACE INTO edit_locks (scope, locked_by, locked_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(scope, userName, now, expiresAt);

  return { success: true };
}

export function releaseLock(scope: string, userName: string): boolean {
  const result = db.prepare('DELETE FROM edit_locks WHERE scope = ? AND locked_by = ?').run(scope, userName);
  return result.changes > 0;
}

export function getAllLocks() {
  const now = new Date().toISOString();
  // Clean expired locks
  db.prepare('DELETE FROM edit_locks WHERE expires_at <= ?').run(now);
  return db.prepare('SELECT scope, locked_by, locked_at, expires_at FROM edit_locks').all() as {
    scope: string; locked_by: string; locked_at: string; expires_at: string;
  }[];
}

// --- Presence helpers ---

const PRESENCE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

export function heartbeatPresence(scope: string, userName: string) {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT OR REPLACE INTO presence (scope, user_name, last_seen) VALUES (?, ?, ?)'
  ).run(scope, userName, now);
}

export function removePresence(scope: string, userName: string) {
  db.prepare('DELETE FROM presence WHERE scope = ? AND user_name = ?').run(scope, userName);
}

export function getPresence(scope?: string): { scope: string; userName: string; lastSeen: string }[] {
  const cutoff = new Date(Date.now() - PRESENCE_TIMEOUT_MS).toISOString();
  // Clean stale entries
  db.prepare('DELETE FROM presence WHERE last_seen < ?').run(cutoff);

  type Row = { scope: string; user_name: string; last_seen: string };
  const toResult = (rows: Row[]) => rows.map((r) => ({ scope: r.scope, userName: r.user_name, lastSeen: r.last_seen }));

  if (scope) {
    const rows = db.prepare('SELECT scope, user_name, last_seen FROM presence WHERE scope = ?').all(scope) as Row[];
    return toResult(rows);
  }
  const rows = db.prepare('SELECT scope, user_name, last_seen FROM presence').all() as Row[];
  return toResult(rows);
}

// --- User helpers ---

export function createUser(name: string) {
  db.prepare('INSERT OR IGNORE INTO users (name) VALUES (?)').run(name);
  const user = db.prepare('SELECT name, role, created_at FROM users WHERE name = ?').get(name) as {
    name: string; role: string; created_at: string;
  };
  return user;
}

export function getUsers() {
  return db.prepare('SELECT name, role, created_at FROM users ORDER BY name').all() as {
    name: string; role: string; created_at: string;
  }[];
}

export function getUserByName(name: string) {
  return db.prepare('SELECT name, role, created_at FROM users WHERE name = ?').get(name) as {
    name: string; role: string; created_at: string;
  } | undefined;
}

export function updateUserRole(name: string, role: string) {
  db.prepare('UPDATE users SET role = ? WHERE name = ?').run(role, name);
  return getUserByName(name);
}

// --- Transaction wrapper ---
export function runTransaction<T>(fn: () => T): T {
  const txn = db.transaction(fn);
  const result = txn();
  touchLastModified();
  return result;
}

export { db };
