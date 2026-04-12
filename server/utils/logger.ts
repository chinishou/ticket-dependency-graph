import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_LEVEL_NAMES = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

const CURRENT_LEVEL = LogLevel[process.env.LOG_LEVEL?.toUpperCase() as keyof typeof LogLevel] ?? LogLevel.INFO;

const LOG_DIR = path.join(import.meta.dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

// Poll summary tracking - logs daily summary instead of every /poll 304
let poll304Count = 0;
let lastSummaryDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

function checkAndLogDailySummary() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastSummaryDate) {
    // New day - log yesterday's summary if there were any polls
    if (poll304Count > 0) {
      logger.info(`Poll summary: ${poll304Count} /poll 304 (no changes) requests in the last 24h`);
      poll304Count = 0;
    }
    lastSummaryDate = today;
  }
}

// Ensure log directory exists
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
  };
}

function formatLog(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function writeToFile(entry: LogEntry) {
  ensureLogDir();
  fs.appendFileSync(LOG_FILE, formatLog(entry) + '\n');
}

function createLogEntry(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  error?: Error
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: LOG_LEVEL_NAMES[level],
    message,
    context,
  };

  if (error) {
    entry.error = {
      message: error.message,
      stack: error.stack,
    };
  }

  return entry;
}

function shouldLog(level: LogLevel): boolean {
  return level >= CURRENT_LEVEL;
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error) {
  if (!shouldLog(level)) return;

  const entry = createLogEntry(level, message, context, error);

  // Console output with color coding for development
  const reset = '\x1b[0m';
  const colors: Record<string, string> = {
    DEBUG: '\x1b[36m',   // Cyan
    INFO: '\x1b[32m',    // Green
    WARN: '\x1b[33m',    // Yellow
    ERROR: '\x1b[31m',   // Red
  };
  const color = colors[entry.level] || '';

  if (process.env.NODE_ENV === 'production') {
    console.log(formatLog(entry));
  } else {
    console.log(`${color}[${entry.timestamp}] [${entry.level}]${reset} ${message}${context ? ` ${JSON.stringify(context)}` : ''}${error ? `\n  ${error.stack}` : ''}`);
  }

  // Write to file (always, for audit trail)
  writeToFile(entry);
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>) {
    log(LogLevel.DEBUG, message, context);
  },

  info(message: string, context?: Record<string, unknown>) {
    log(LogLevel.INFO, message, context);
  },

  warn(message: string, context?: Record<string, unknown>) {
    log(LogLevel.WARN, message, context);
  },

  error(message: string, error?: Error, context?: Record<string, unknown>) {
    log(LogLevel.ERROR, message, context, error);
  },
};

export function logRequest(method: string, path: string, statusCode: number, durationMs: number, userName?: string) {
  const context = {
    method,
    path,
    statusCode,
    durationMs,
    userName,
  };

  // Skip logging /poll 304 (no changes) - track for daily summary instead
  if (method === 'GET' && path === '/poll' && statusCode === 304) {
    poll304Count++;
    checkAndLogDailySummary();
    return;
  }

  if (statusCode >= 500) {
    logger.error(`HTTP ${method} ${path} ${statusCode} ${durationMs}ms`, undefined, context);
  } else if (statusCode >= 400) {
    logger.warn(`HTTP ${method} ${path} ${statusCode} ${durationMs}ms`, context);
  } else {
    logger.info(`HTTP ${method} ${path} ${statusCode} ${durationMs}ms`, context);
  }
}

export function logMutation(type: string, userName: string | undefined, entityId: string | undefined, success: boolean, error?: Error, humanMessage?: string) {
  const context = { mutation: type, userName, entityId, success, humanMessage };
  if (error) {
    logger.error(`Mutation failed: ${type}`, error, context);
  } else {
    logger.info(humanMessage || `Mutation: ${type}`, context);
  }
}

export function logSgSync(entityType: string, sgId: number | string, action: 'sync' | 'archive', success: boolean, error?: Error) {
  const context = { sgEntity: entityType, sgId, action, success };
  if (error) {
    logger.error(`SG ${action} failed: ${entityType} ${sgId}`, error, context);
  } else {
    logger.info(`SG ${action}: ${entityType} ${sgId}`, context);
  }
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
  };
}

export function getLogs(limit = 100, offset = 0): { logs: LogEntry[]; total: number } {
  ensureLogDir();
  if (!fs.existsSync(LOG_FILE)) {
    return { logs: [], total: 0 };
  }
  const content = fs.readFileSync(LOG_FILE, 'utf-8');
  const lines = content.split('\n').filter(Boolean);
  const total = lines.length;
  const entries = lines.slice(-limit - offset, lines.length - offset || undefined).map(line => {
    try {
      return JSON.parse(line) as LogEntry;
    } catch {
      return { timestamp: '', level: 'ERROR', message: `Failed to parse log line: ${line.slice(0, 100)}` } as LogEntry;
    }
  });
  return { logs: entries.reverse(), total };
}

export function clearLogs(): void {
  ensureLogDir();
  if (fs.existsSync(LOG_FILE)) {
    fs.unlinkSync(LOG_FILE);
  }
}
