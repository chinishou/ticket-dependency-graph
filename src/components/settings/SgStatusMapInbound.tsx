import { useEffect, useMemo, useState } from 'react';
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

const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  completed: 'var(--color-done)',
  in_progress: 'var(--color-in-progress)',
  available: 'var(--color-available)',
  paused: 'var(--color-locked)',
  blocked: 'var(--color-blocked)',
  locked: 'var(--color-locked)',
};

interface Props {
  adminPassword: string;
}

/**
 * Inbound status mapping: SG sg_status_list code → local TaskStatus.
 *
 * The persisted data shape is `Record<sgCode, TaskStatus>` (per-code lookup
 * is what the server actually does). For display we invert it to
 * `Record<TaskStatus, sgCode[]>` so the admin sees one row per TaskStatus
 * with all the SG codes that resolve to it — making N-to-1 mappings obvious.
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

  // Build the inverse map for display: TaskStatus → [sgCode, sgCode, ...]
  const grouped: Record<TaskStatus, string[]> = useMemo(() => {
    const out: Record<TaskStatus, string[]> = {
      completed: [], in_progress: [], available: [], paused: [], blocked: [], locked: [],
    };
    for (const [code, status] of Object.entries(draft)) {
      if (status in out) out[status].push(code);
    }
    for (const s of TASK_STATUSES) out[s].sort();
    return out;
  }, [draft]);

  // SG codes that aren't yet assigned to any TaskStatus — they'll fall through
  // to keyword matching at import time. Showing them lets the admin pin a
  // status code that the keyword fallback gets wrong.
  const unmappedCodes = useMemo(() => {
    if (!availableStatuses) return [] as string[];
    const mapped = new Set(Object.keys(draft));
    return availableStatuses.filter((c) => !mapped.has(c)).sort();
  }, [availableStatuses, draft]);

  // SG codes the admin mapped but that SG no longer reports — stale aliases
  // that should be flagged for cleanup.
  const staleCodes = useMemo(() => {
    if (!availableStatuses) return [] as string[];
    const live = new Set(availableStatuses);
    return Object.keys(draft).filter((c) => !live.has(c)).sort();
  }, [availableStatuses, draft]);

  const dirty = useMemo(() => {
    const keys = new Set([...Object.keys(draft), ...Object.keys(saved)]);
    for (const k of keys) if (draft[k] !== saved[k]) return true;
    return false;
  }, [draft, saved]);

  const assignCode = (code: string, target: TaskStatus | null) => {
    setDraft((prev) => {
      const next = { ...prev };
      if (target === null) delete next[code];
      else next[code] = target;
      return next;
    });
    setSavedAt(null);
  };

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

  const initialLoading = loadingMap && availableStatuses === null;

  return (
    <div style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={headingStyle}>Status Mapping (Inbound)</h2>
          <p style={descStyle}>
            Each local task status can pull in <em>multiple</em> SG codes. E.g. both
            <code style={inlineCode}>waiting_feedback</code> and <code style={inlineCode}>pr_review</code>
            can land as <code style={inlineCode}>in_progress</code>. Codes in the
            <em>Unmapped</em> row fall through to keyword matching at import time and default to
            <code style={inlineCode}>available</code> if nothing matches.
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
          and <code style={inlineCode}>API_KEY</code> are set in <code style={inlineCode}>.env</code>.
        </div>
      )}

      {initialLoading && (
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 14 }}>Loading…</div>
      )}

      {!initialLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {TASK_STATUSES.map((status) => (
            <StatusRow
              key={status}
              status={status}
              assignedCodes={grouped[status]}
              availableCodes={availableStatuses ?? []}
              staleSet={new Set(staleCodes)}
              onAssign={(code) => assignCode(code, status)}
              onUnassign={(code) => assignCode(code, null)}
            />
          ))}

          {/* Unmapped row — informational. These codes will fall through to keyword matching. */}
          <UnmappedRow
            codes={unmappedCodes}
            onAssign={(code, target) => assignCode(code, target)}
          />
        </div>
      )}

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

// ---------------------------------------------------------------------------
// StatusRow — one TaskStatus + its assigned SG-code chips + an "add" picker
// ---------------------------------------------------------------------------

function StatusRow({
  status, assignedCodes, availableCodes, staleSet, onAssign, onUnassign,
}: {
  status: TaskStatus;
  assignedCodes: string[];
  availableCodes: string[];
  staleSet: Set<string>;
  onAssign: (code: string) => void;
  onUnassign: (code: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  // Codes available to assign: ones SG knows about that aren't already on this row.
  const candidates = availableCodes.filter((c) => !assignedCodes.includes(c));
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '180px 1fr',
      gap: 12,
      alignItems: 'start',
      padding: '10px 12px',
      borderRadius: 6,
      backgroundColor: 'var(--color-bg-tertiary)',
      border: '1px solid var(--color-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          backgroundColor: TASK_STATUS_COLOR[status],
        }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {TASK_STATUS_LABEL[status]}
          </div>
          <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
            {status}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>←</span>
        {assignedCodes.length === 0 && !adding && (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
            (no overrides)
          </span>
        )}
        {assignedCodes.map((code) => {
          const stale = staleSet.has(code);
          return (
            <span
              key={code}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 4px 2px 10px', borderRadius: 12,
                fontSize: 11, fontFamily: 'monospace',
                border: `1px solid ${stale ? '#ef4444' : 'var(--color-border)'}`,
                backgroundColor: stale ? 'rgba(239,68,68,0.08)' : 'var(--color-bg-secondary)',
                color: stale ? '#ef4444' : 'var(--color-text-primary)',
              }}
              title={stale ? 'This code is no longer reported by SG' : code}
            >
              {code}
              {stale && <span style={{ marginLeft: 2 }}>·stale</span>}
              <button
                onClick={() => onUnassign(code)}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: 'var(--color-text-muted)', fontSize: 13, padding: '0 4px',
                  lineHeight: 1,
                }}
                title="Remove this mapping"
              >×</button>
            </span>
          );
        })}
        {adding ? (
          <select
            autoFocus
            defaultValue=""
            onBlur={() => setAdding(false)}
            onChange={(e) => {
              const v = e.target.value;
              if (v) onAssign(v);
              setAdding(false);
            }}
            style={{
              padding: '3px 6px', borderRadius: 12,
              border: '1px solid var(--color-accent)',
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
              fontSize: 11, fontFamily: 'monospace', minWidth: 140,
            }}
          >
            <option value="">— pick SG code —</option>
            {candidates.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : (
          candidates.length > 0 && (
            <button
              onClick={() => setAdding(true)}
              style={{
                padding: '2px 10px', borderRadius: 12,
                border: '1px dashed var(--color-border)',
                backgroundColor: 'transparent',
                color: 'var(--color-text-muted)',
                fontSize: 11, cursor: 'pointer',
              }}
            >
              + add code
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UnmappedRow — SG codes with no explicit assignment (falling through to keyword)
// ---------------------------------------------------------------------------

function UnmappedRow({ codes, onAssign }: {
  codes: string[];
  onAssign: (code: string, target: TaskStatus) => void;
}) {
  if (codes.length === 0) return null;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '180px 1fr',
      gap: 12,
      alignItems: 'start',
      padding: '10px 12px',
      borderRadius: 6,
      backgroundColor: 'transparent',
      border: '1px dashed var(--color-border)',
    }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)' }}>
          Unmapped
        </div>
        <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
          keyword fallback
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {codes.map((code) => (
          <UnmappedChip key={code} code={code} onAssign={(target) => onAssign(code, target)} />
        ))}
      </div>
    </div>
  );
}

function UnmappedChip({ code, onAssign }: { code: string; onAssign: (target: TaskStatus) => void }) {
  const [picking, setPicking] = useState(false);
  if (picking) {
    return (
      <select
        autoFocus
        defaultValue=""
        onBlur={() => setPicking(false)}
        onChange={(e) => { const v = e.target.value as TaskStatus | ''; if (v) onAssign(v); setPicking(false); }}
        style={{
          padding: '3px 6px', borderRadius: 12,
          border: '1px solid var(--color-accent)',
          backgroundColor: 'var(--color-bg-secondary)',
          color: 'var(--color-text-primary)',
          fontSize: 11, minWidth: 160,
        }}
      >
        <option value="">{code} →</option>
        {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
      </select>
    );
  }
  return (
    <button
      onClick={() => setPicking(true)}
      style={{
        padding: '2px 10px', borderRadius: 12,
        border: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-tertiary)',
        color: 'var(--color-text-muted)',
        fontSize: 11, fontFamily: 'monospace', cursor: 'pointer',
      }}
      title="Click to assign this SG code to a local TaskStatus"
    >
      {code}
    </button>
  );
}

// Styles — kept aligned with SgStatusMap.tsx
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
