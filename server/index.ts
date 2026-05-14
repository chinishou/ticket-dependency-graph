import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import { router } from './routes';
import { requestLogger } from './middleware/requestLogger';
import { logger } from './utils/logger';
import { db } from './db';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(requestLogger);
app.use('/api', router);

// In container / production deployments where Express also serves the built
// frontend, set SERVE_STATIC=1 (the Dockerfile does this by default). The dev
// workflow (npm run dev:all) leaves it unset so Vite handles the frontend
// directly on :5173 and proxies /api to this process.
if (process.env.SERVE_STATIC === '1' || process.env.NODE_ENV === 'production') {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const distDir = path.resolve(here, '..', 'dist');
  app.use(express.static(distDir));
  // SPA fallback: anything that isn't an /api request gets index.html so
  // client-side routing works on hard refresh.
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
  logger.info(`Serving static frontend from ${distDir}`);
}

const server = app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`, { port: PORT });
});

// Graceful shutdown. Container orchestrators (Docker, Podman, k8s) send
// SIGTERM and wait ~10s before SIGKILL. Without this handler, in-flight
// requests are dropped and SQLite's WAL file may not be checkpointed cleanly.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`Received ${signal}, shutting down`);

  // Hard cap on shutdown duration. Orchestrators kill us at ~10s anyway —
  // exit cleanly at 8s so any final-write logs reach the file before SIGKILL.
  const forceExit = setTimeout(() => {
    logger.warn('Force-exit after 8s — some connections did not close cleanly');
    process.exit(1);
  }, 8_000);
  forceExit.unref();

  // Stop accepting new connections, let existing ones drain, then close the
  // DB (better-sqlite3 is synchronous so we do it after server.close to avoid
  // racing in-flight handlers).
  server.close((err) => {
    if (err) {
      logger.error('Error during server.close', err);
      process.exit(1);
    }
    try {
      db.close();
    } catch {
      // Already closed or never opened — fine.
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
