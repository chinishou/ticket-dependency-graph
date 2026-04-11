import type { RequestHandler } from 'express';
import { logRequest } from '../utils/logger';

export const requestLogger: RequestHandler = (req, res, next) => {
  const start = Date.now();

  // Capture response finish
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const userName = (req.body as { userName?: string })?.userName;
    logRequest(req.method, req.path, res.statusCode, durationMs, userName);
  });

  next();
};
