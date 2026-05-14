import { useEffect, useState } from 'react';
import type React from 'react';
import { useStore } from '../../store/useStore';
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
 * Configure the TaskStatus → SG sg_status_list code mapping used when the app
 * writes a ticket status back to ShotGrid.
 *
 * The list of available SG codes is fetched live from the configured SG site
 * via /api/sg/list-statuses, so the dropdown always reflects what the user's
 * actual SG instance accepts — no hardcoded values.
 */
export function SgStatusMap({ adminPassword }: Props) {
  const sgStatusMap = useStore((s) => s.sgStatusMap);
  const loadSgStatusMap = useStore((s) => s.loadSgStatusMap);
  const saveSgStatusMap = useStore((s) => s.saveSgStatusMap);

  const [availableStatuses, setAvailableStatuses] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Record<TaskStatus, string>>(sgStatusMap);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Re-sync draft when the loaded map changes (e.g. after first fetchState)
  useEffect(() => {
    setDraft(sgStatusMap);
  }, [sgStatusMap]);

  const fetchAvailable = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/sg/list-statuses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch statuses');
      const list: string[] = data.ticketStatuses || [];
      setAvailableStatuses(list);
    } catch (e) {
      setError(String(e));
      setAvailableStatuses([]);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch on mount so the dropdowns are populated when the admin opens the page
  useEffect(() => {
    fetchAvailable();
    // Also re-sync the saved map from the server in case it was changed elsewhere
    void loadSgStatusMap();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onPick = (status: TaskStatus, code: string) => {
    setDraft((prev) => ({ ...prev, [status]: code }));
    setSavedAt(null);
  };

  const dirty = TASK_STATUSES.some((s) => draft[s] !== sgStatusMap[s]);

  const onSave = async () => {
    setSaving(true);
    setError('');
    const ok = await saveSgStatusMap(draft);
    setSaving(false);
    if (ok) {
      setSavedAt(Date.now());
    } else {
      setError('Save failed (admin password may be incorrect)');
    }
  };

  const onReset = () => {
    setDraft(sgStatusMap);
    setSavedAt(null);
  };

  // Highlight any currently-saved code that doesn't appear in the SG list — those
  // would fail when the app tries to push them to SG.
  const isStaleCode = (code: string) =>
    availableStatuses !== null && availableStatuses.length > 0 && !availableStatuses.includes(code);

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={headingStyle}>Status Mapping (Outbound)</h2>
          <p style={descStyle}>
            When a task status changes in the tech tree, the app writes back to the matching{' '}
            <code style={inlineCode}>sg_status_list</code> code on the SG ticket. The codes below
            are pulled live from your configured SG site.
          </p>
        </div>
        <button
          onClick={fetchAvailable}
          disabled={loading}
          style={{ ...secondaryBtnStyle, opacity: loading ? 0.5 : 1 }}
        >
          {loading ? <span style={spinnerStyle} /> : '↻ Refresh from SG'}
        </button>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: '#ef4444', marginTop: 8 }}>{error}</div>
      )}

      {availableStatuses !== null && availableStatuses.length === 0 && !loading && (
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>
          No ticket statuses returned from SG. Check that <code style={inlineCode}>SG_URL</code>,{' '}
          <code style={inlineCode}>SCRIPT_NAME</code>, and <code style={inlineCode}>API_KEY</code>{' '}
          are configured in <code style={inlineCode}>.env</code> and that the site has at least one
          ticket with a status set.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        {TASK_STATUSES.map((status) => {
          const current = draft[status] || '';
          const stale = isStaleCode(current);
          return (
            <div
              key={status}
              style={{
                display: 'grid',
                gridTemplateColumns: '160px 1fr auto',
                gap: 12,
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: 6,
                backgroundColor: 'var(--color-bg-tertiary)',
                border: `1px solid ${stale ? '#ef4444' : 'var(--color-border)'}`,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {TASK_STATUS_LABEL[status]}
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                  {status}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>→</span>
                {availableStatuses === null || loading ? (
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Loading…</span>
                ) : (
                  <select
                    value={current}
                    onChange={(e) => onPick(status, e.target.value)}
                    style={{
                      padding: '5px 8px',
                      borderRadius: 5,
                      border: `1px solid ${stale ? '#ef4444' : 'var(--color-border)'}`,
                      backgroundColor: 'var(--color-bg-secondary)',
                      color: 'var(--color-text-primary)',
                      fontSize: 12,
                      fontFamily: 'monospace',
                      minWidth: 180,
                    }}
                  >
                    {/* If current value isn't in the SG list, show it anyway so it's visible & stale-flagged */}
                    {current && !availableStatuses.includes(current) && (
                      <option value={current}>{current} (not in SG — stale)</option>
                    )}
                    <option value="">— pick a code —</option>
                    {availableStatuses.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'monospace', minWidth: 60 }}>
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
              : 'Saved mapping is in use'}
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

// ---------------------------------------------------------------------------
// Styles (kept inline to match the rest of the settings module)
// ---------------------------------------------------------------------------

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
