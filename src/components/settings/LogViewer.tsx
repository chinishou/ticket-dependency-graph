import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../../store/useStore';

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
    const interval = setInterval(() => fetchLogs(0), 5000);
    return () => clearInterval(interval);
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
                width: 180,
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
              {filteredLogs.map((log, i) => (
                <div
                  key={i}
                  style={{
                    padding: '6px 12px',
                    borderBottom: i < filteredLogs.length - 1 ? '1px solid var(--color-border)' : 'none',
                    display: 'grid',
                    gridTemplateColumns: '100px 50px 1fr',
                    gap: 12,
                    alignItems: 'start',
                  }}
                >
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {formatDate(log.timestamp)} {formatTimestamp(log.timestamp)}
                  </span>
                  <span style={{
                    color: levelColors[log.level] || '#fff',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}>
                    {log.level}
                  </span>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{log.message}</span>
                    {log.context && Object.keys(log.context).length > 0 && (
                      <pre style={{
                        margin: '4px 0 0',
                        fontSize: 10,
                        color: 'var(--color-text-muted)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                      }}>
                        {JSON.stringify(log.context)}
                      </pre>
                    )}
                    {log.error && (
                      <pre style={{
                        margin: '4px 0 0',
                        fontSize: 10,
                        color: '#ef4444',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                      }}>
                        {log.error.message}
                        {log.error.stack && `\n${log.error.stack}`}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
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
