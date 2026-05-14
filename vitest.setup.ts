// Force tests onto an isolated SQLite file so the `DELETE FROM entities`
// in beforeEach hooks can never touch the production data.db.
// This file runs BEFORE any test imports `server/db.ts`, which reads DB_PATH
// at module load.
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.DB_PATH = path.join(__dirname, 'data.test.db');

// Belt-and-suspenders: tests must never trigger outbound SG writes.
process.env.SG_WRITE_DISABLED = '1';
