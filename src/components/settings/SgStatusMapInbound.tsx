import { useEffect, useState } from 'react';
import type React from 'react';
import type { TaskStatus } from '../../types';

const TASK_STATUSES: TaskStatus[] = [
  'completed',
  'in_progress',
  'available',
  'paused',
  'blocked',
  'locked',
];

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  completed: 'Completed',
  in_progress: 'In Progress',
  available: 'Available',
  paused: 'Paused',
  blocked: 'Blocked',
  locked: 'Locked',
};

interface Props {
  adminPassword: string;
}

/**
 * Configure the SG sg_status_list code → local TaskStatus mapping used when a
 * ticket is imported. SG codes the user hasn't mapped fall through to keyword
 * matching (server-side), and unknown codes default to "available" so freshly
 * imported tickets aren't locked out of the box.
 */
export function SgStatusMapInbound({ adminPassword }: Props) {
  const [availableStatuses, setAvailableStatuses] = useState<string[] | null>(null);
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [saved, setSaved] = useState<Record<string, TaskStatus>>({});
  const [draft, setDraft] = useState<Record<string, TaskStatus>>({});
  const [loadingMap, setLoadingMap] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const loadMap = async () => {
    setLoadingMap(true);
    try {
      const res = await fetch('/api/sg/status-map-inbound');
      const data = await res.json();
      const map = (data.map || {}) as Record<string, TaskStatus>;
      setSaved(map);
      setDraft(map);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingMap(false);
    }
  };

  const fetchAvailable = async () => {
    setLoadingStatuses(true);
    setError('');
    try {
      const res = await fetch('/api/sg/list-statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch statuses');
      setAvailableStatuses((data.ticketStatuses || []) as string[]);
    } catch (e) {
      setError(String(e));
      setAvailableStatuses([]);
    } finally {
      setLoadingStatuses(false);
    }
  };

  useEffect(() => {
    void loadMap();
    void fetchAvailable();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Codes the admin already mapped but that no longer exist in SG — we still want
  // to show them so the admin can remove or relabel them.
  const staleCodes = Object.keys(draft).filter(
    (code) => availableStatuses !== null && !availableStatuses.includes(code),
  );
  const allCodes = [
    ...(availableStatuses ?? []),
    ...staleCodes,
  ];

  const onPick = (code: string, status: TaskStatus | '') => {
    setDraft((prev) => {
      const next = { ...prev };
      if (status === '') delete next[code];
      else next[code] = status;
      return next;
    });
    setSavedAt(null);
  };

  const dirty = (() => {
    const keys = new Set([...Object.keys(draft), ...Object.keys(saved)]);
    for (const k of keys) if (draft[k] !== saved[k]) return true;
    return false;
  })();

  const onSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/sg/status-map-inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword, map: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      const map = (data.map || {}) as Record<string, TaskStatus>;
      setSaved(map);
      setDraft(map);
      setSavedAt(Date.now());
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => {
    setDraft(saved);
    setSavedAt(null);
  };

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={headingStyle}>Status Mapping (Inbound)</h2>
          <p style={descStyle}>
            When a ticket is imported, the SG <code style={inlineCode}>sg_status_list</code> code
            on the right is mapped to the local task status on the left. Codes left as
            <em> auto</em> fall through to keyword matching and default to <code style={inlineCode}>available</code>.
          </p>
        </div>
        <button
          onClick={fetchAvailable}
          disabled={loadingStatuses}
          style={{ ...secondaryBtnStyle, opacity: loadingStatuses ? 0.5 : 1 }}
        >
          {loadingStatuses ? <span style={spinnerStyle} /> : '↻ Refresh from SG'}
        </button>
      </div>

      {error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 8 }}>{error}</div>}

      {availableStatuses !== null && availableStatuses.length === 0 && !loadingStatuses && (
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>
          No ticket statuses returned from SG. Check that{' '}
          <code style={inlineCode}>SG_URL</code>, <code style={inlineCode}>SCRIPT_NAME</code>,
          and <code style={inlineCode}>API_KEY</code> are configured in <code style={inlineCode}>.env</code>.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        {(loadingMap || loadingStatuses) && availableStatuses === null && (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Loading…</div>
        )}
        {allCodes.map((code) => {
          const stale = availableStatuses !== null && !availableStatuses.includes(code);
          const current = draft[code] ?? '';
          return (
            <div
              key={code}
              style={{
                display: 'grid',
                gridTemplateColumns: '180px 1fr auto',
                gap: 12,
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: 6,
                backgroundColor: 'var(--color-bg-tertiary)',
                border: `1px solid ${stale ? '#ef4444' : 'var(--color-border)'}`,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: 'var(--color-text-primary)' }}>
                  {code}
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                  SG status code
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>→</span>
                <select
                  value={current}
                  onChange={(e) => onPick(code, e.target.value as TaskStatus | '')}
                  style={{
                    padding: '5px 8px',
                    borderRadius: 5,
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    fontSize: 12,
                    minWidth: 180,
                  }}
                >
                  <option value="">auto (keyword match)</option>
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {TASK_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', minWidth: 60 }}>
                {stale && <span style={{ color: '#ef4444' }}>stale</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
          {savedAt && !dirty
            ? `✓ Saved ${new Date(savedAt).toLocaleTimeString()}`
            : dirty
              ? 'Unsaved changes'
              : Object.keys(saved).length === 0
                ? 'No overrides — using keyword fallback'
                : `${Object.keys(saved).length} override(s) saved`}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onReset} disabled={!dirty || saving} style={{ ...secondaryBtnStyle, opacity: !dirty || saving ? 0.4 : 1 }}>
            Reset
          </button>
          <button onClick={onSave} disabled={!dirty || saving} style={{ ...accentBtnStyle, opacity: !dirty || saving ? 0.4 : 1 }}>
            {saving ? <span style={spinnerStyle} /> : 'Save mapping'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Styles — keep aligned with SgStatusMap.tsx
const sectionStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  padding: '20px 24px',
};

const headingStyle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, marginBottom: 4, color: 'var(--color-text-primary)',
};

const descStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 0, maxWidth: 540, lineHeight: 1.5,
};

const inlineCode: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 11,
  padding: '1px 5px',
  borderRadius: 3,
  backgroundColor: 'var(--color-bg-tertiary)',
};

const accentBtnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, border: 'none',
  backgroundColor: '#a78bfa', color: '#0f172a',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 6,
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-secondary)',
  color: 'var(--color-text-primary)',
  fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
};

const spinnerStyle: React.CSSProperties = {
  display: 'inline-block', width: 13, height: 13, borderRadius: '50%',
  border: '2px solid var(--color-border)', borderTopColor: '#a78bfa',
  animation: 'spin 0.8s linear infinite', flexShrink: 0,
};
