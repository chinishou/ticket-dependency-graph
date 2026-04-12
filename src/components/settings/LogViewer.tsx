import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../store/useStore';

interface LogContext {
  mutation?: string;
  userName?: string;
  entityId?: string;
  success?: boolean;
  humanMessage?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  sgEntity?: string;
  sgId?: string | number;
  action?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: LogContext;
  error?: {
    message: string;
    stack?: string;
  };
}

const levelColors: Record<string, string> = {
  DEBUG: '#38bdf8',
  INFO: '#22c55e',
  WARN: '#f59e0b',
  ERROR: '#ef4444',
};

function formatTimestamp(ts: string): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return ts;
  }
}

function formatDate(ts: string): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return ts;
  }
}

export function LogViewer() {
  const adminPassword = useStore(s => s.adminPassword);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<'readable' | 'compact'>('readable');
  const limit = 50;

  const fetchLogs = useCallback(async (off = 0) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/logs?limit=${limit}&offset=${off}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(offset);
  }, [fetchLogs, offset]);

  const handleClearLogs = async () => {
    if (!adminPassword) return;
    if (!confirm('Clear all logs? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/logs/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword }),
      });
      if (res.ok) {
        setLogs([]);
        setTotal(0);
        setOffset(0);
      }
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  const filteredLogs = filter
    ? logs.filter(l =>
        l.level.toLowerCase().includes(filter.toLowerCase()) ||
        l.message.toLowerCase().includes(filter.toLowerCase())
      )
    : logs;

  const hasMore = offset + logs.length < total;

  const sectionStyle: React.CSSProperties = {
    padding: '20px 24px',
    borderRadius: 10,
    backgroundColor: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
              Application Logs
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
              {total} total entries
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ display: 'flex', borderRadius: 6, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
              <button
                onClick={() => setViewMode('readable')}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  backgroundColor: viewMode === 'readable' ? 'var(--color-bg-tertiary)' : 'transparent',
                  color: viewMode === 'readable' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Readable
              </button>
              <button
                onClick={() => setViewMode('compact')}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  backgroundColor: viewMode === 'compact' ? 'var(--color-bg-tertiary)' : 'transparent',
                  color: viewMode === 'compact' ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Compact
              </button>
            </div>
            <input
              type="text"
              placeholder="Filter logs..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-primary)',
                fontSize: 12,
                width: 150,
              }}
            />
            <button
              onClick={() => fetchLogs(0)}
              disabled={loading}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-secondary)',
                fontSize: 12,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              Refresh
            </button>
            {adminPassword && (
              <button
                onClick={handleClearLogs}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #ef4444',
                  backgroundColor: 'transparent',
                  color: '#ef4444',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Clear Logs
              </button>
            )}
          </div>
        </div>

        {loading && logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>
            Loading logs...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>
            No log entries
          </div>
        ) : (
          <>
            <div style={{
              maxHeight: 500,
              overflow: 'auto',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-bg-tertiary)',
              fontFamily: 'ui-monospace, monospace',
              fontSize: 11,
            }}>
              {filteredLogs.map((log, i) => {
                const ctx = log.context;
                const humanMsg = ctx?.humanMessage || log.message;

                return (
                <div
                  key={i}
                  style={{
                    padding: viewMode === 'compact' ? '4px 8px' : '8px 12px',
                    borderBottom: i < filteredLogs.length - 1 ? '1px solid var(--color-border)' : 'none',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  {viewMode === 'readable' ? (
                    <>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 10, minWidth: 80 }}>
                        {formatDate(log.timestamp)}<br/>
                        <span style={{ fontSize: 11 }}>{formatTimestamp(log.timestamp)}</span>
                      </span>
                      <span style={{
                        color: levelColors[log.level] || '#fff',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        fontSize: 10,
                        minWidth: 40,
                        textAlign: 'center',
                      }}>
                        {log.level}
                      </span>
                      <span style={{ color: 'var(--color-text-secondary)', flex: 1 }}>
                        {humanMsg}
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 10, minWidth: 70 }}>
                        {formatTimestamp(log.timestamp)}
                      </span>
                      <span style={{
                        color: levelColors[log.level] || '#fff',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        fontSize: 9,
                        minWidth: 35,
                        textAlign: 'center',
                      }}>
                        {log.level}
                      </span>
                      <span style={{ color: 'var(--color-text-secondary)', flex: 1, fontSize: 10 }}>
                        {humanMsg}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Showing {offset + 1}-{offset + filteredLogs.length} of {total}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setOffset(o => Math.max(0, o - limit))}
                  disabled={offset === 0}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-tertiary)',
                    color: offset === 0 ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
                    fontSize: 12,
                    cursor: offset === 0 ? 'not-allowed' : 'pointer',
                    opacity: offset === 0 ? 0.5 : 1,
                  }}
                >
                  Previous
                </button>
                <button
                  onClick={() => setOffset(o => o + limit)}
                  disabled={!hasMore}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-tertiary)',
                    color: !hasMore ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
                    fontSize: 12,
                    cursor: !hasMore ? 'not-allowed' : 'pointer',
                    opacity: !hasMore ? 0.5 : 1,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
