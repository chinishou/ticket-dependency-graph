const sql = require('better-sqlite3')('data.db');

const wrows = sql.prepare("SELECT id, data FROM entities WHERE table_name='workers'").all();
for (const r of wrows) {
  const d = JSON.parse(r.data);
  if (!d.id) d.id = r.id;
  if (!Array.isArray(d.activeTaskIds)) d.activeTaskIds = [];
  if (!Array.isArray(d.assignedTaskIds)) d.assignedTaskIds = [];
  if (!d.availability) d.availability = 'full';
  sql.prepare('UPDATE entities SET data=? WHERE table_name=? AND id=?').run(JSON.stringify(d), 'workers', r.id);
}

const prows = sql.prepare("SELECT id, data FROM entities WHERE table_name='projects'").all();
for (const r of prows) {
  const d = JSON.parse(r.data);
  if (!d.id) d.id = r.id;
  if (!Array.isArray(d.contributingDepartmentIds)) d.contributingDepartmentIds = [];
  if (!Array.isArray(d.goalIds)) d.goalIds = [];
  if (!Array.isArray(d.milestoneIds)) d.milestoneIds = [];
  if (!d.deadline) d.deadline = '';
  if (!d.description) d.description = '';
  sql.prepare('UPDATE entities SET data=? WHERE table_name=? AND id=?').run(JSON.stringify(d), 'projects', r.id);
}

const drows = sql.prepare("SELECT id, data FROM entities WHERE table_name='departments'").all();
for (const r of drows) {
  const d = JSON.parse(r.data);
  if (!d.id) d.id = r.id;
  if (!Array.isArray(d.workerIds)) d.workerIds = [];
  if (!Array.isArray(d.goalIds)) d.goalIds = [];
  if (!d.description) d.description = '';
  if (!d.headName) d.headName = '';
  if (!d.priority) d.priority = 'P2';
  sql.prepare('UPDATE entities SET data=? WHERE table_name=? AND id=?').run(JSON.stringify(d), 'departments', r.id);
}

// Set lastModified so the frontend polls and picks up the changes
sql.prepare("UPDATE meta SET value = datetime('now') WHERE key = 'last_modified'").run();

console.log('Patched workers, projects, departments');
