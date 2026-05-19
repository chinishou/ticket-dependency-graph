import { useState } from 'react';
import type React from 'react';
import { usePermission } from '../../hooks/usePermission';
import type { DeleteResult } from '../../store/useStore';

interface Props {
  /** Short label like "worker", "project" — used in the confirm prompt. */
  entityKind: string;
  /** Display name shown in the confirm prompt and toast. */
  entityName: string;
  /** Store delete method — e.g. `useStore.getState().removeWorker`. */
  onDelete: () => Promise<DeleteResult>;
  /** Optional callback after a successful delete (e.g. navigate away). */
  onDeleted?: () => void;
  /** Display variant. */
  variant?: 'button' | 'inline';
}

/**
 * Admin-only inline delete button with confirmation + blocker-list display.
 *
 * Renders nothing for non-admins. When clicked, prompts for confirmation; on
 * confirm, fires onDelete() and if the server rejects with a 409 blockers list
 * (e.g. "worker still assigned to N tasks"), surfaces those reasons inline so
 * the user knows what to detach before re-trying.
 */
export function DeleteEntityButton({ entityKind, entityName, onDelete, onDeleted, variant = 'button' }: Props) {
  const { canManageRoles } = usePermission();
  const [phase, setPhase] = useState<'idle' | 'confirming' | 'running' | 'error'>('idle');
  const [blockers, setBlockers] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  if (!canManageRoles) return null;

  const run = async () => {
    setPhase('running');
    setBlockers([]);
    setErrorMsg('');
    const result = await onDelete();
    if (result.success) {
      // Component will typically unmount via onDeleted — no idle reset needed.
      setPhase('idle');
      onDeleted?.();
    } else {
      setBlockers(result.blockers ?? []);
      setErrorMsg(result.error ?? 'Delete failed');
      setPhase('error');
    }
  };

  const reset = () => {
    setPhase('idle');
    setBlockers([]);
    setErrorMsg('');
  };

  if (phase === 'idle') {
    return (
      <button onClick={() => setPhase('confirming')} style={variant === 'inline' ? inlineStyle : btnStyle}>
        Delete
      </button>
    );
  }

  return (
    <div style={panelStyle}>
      {phase === 'confirming' && (
        <>
          <span style={{ fontSize: 12, color: '#ef4444' }}>
            Delete {entityKind} <strong>{entityName}</strong>?
          </span>
          <button onClick={reset} style={secondaryBtnStyle}>Cancel</button>
          <button onClick={run} style={btnStyle}>Confirm Delete</button>
        </>
      )}
      {phase === 'running' && (
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Deleting…</span>
      )}
      {phase === 'error' && (
        <>
          <div style={{ flex: '1 1 100%' }}>
            <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginBottom: 4 }}>
              {blockers.length > 0
                ? `Can't delete — still referenced by ${blockers.length} entit${blockers.length === 1 ? 'y' : 'ies'}:`
                : `Delete failed: ${errorMsg}`}
            </div>
            {blockers.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: 'var(--color-text-muted)', maxHeight: 140, overflowY: 'auto' }}>
                {blockers.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
          </div>
          <button onClick={reset} style={secondaryBtnStyle}>Dismiss</button>
        </>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 6,
  border: '1px solid #ef4444', backgroundColor: 'transparent',
  color: '#ef4444', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
};

const inlineStyle: React.CSSProperties = {
  ...btnStyle,
  padding: '3px 8px',
  fontSize: 11,
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 6,
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-secondary)',
  color: 'var(--color-text-primary)',
  fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
};

const panelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid rgba(239,68,68,0.3)',
  backgroundColor: 'rgba(239,68,68,0.05)',
};
