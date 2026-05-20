import { useState, useEffect, useRef } from 'react';
import type React from 'react';
import { useStore } from '../../store/useStore';

interface SgStatus {
  url: string;
  configured: boolean;
  counts: { projects: number; workers: number; tasks: number };
  lastModified: string;
}

interface Props {
  adminPassword: string;
}

export function SettingsSgSync({ adminPassword }: Props) {
  const fetchState = useStore((s) => s.fetchState);
  const [sgStatus, setSgStatus] = useState<SgStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Shared state between the Projects card and the Tickets card. The Projects
  // card writes its selected SG project statuses here; the Tickets card reads
  // them and resolves the matching SG project IDs at import time. This is what
  // makes the Tickets card import "only the projects currently being imported"
  // without the user having to maintain two parallel checklists.
  const [projectStatusFilter, setProjectStatusFilter] = useState<Set<string>>(new Set());

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/sg/status');
      if (res.ok) setSgStatus(await res.json());
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadStatus();
    intervalRef.current = setInterval(loadStatus, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const runSync = async (entity: string, statuses?: string[], projectIds?: number[]) => {
    const res = await fetch('/api/sg/trigger-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminPassword, entity, statuses, projectIds }),
    });
    const data = await res.json();
    if (data.success !== false) {
      await fetchState();
      await loadStatus();
    }
    return data;
  };

  const formattedDate = sgStatus?.lastModified
    ? new Date(sgStatus.lastModified + (sgStatus.lastModified.endsWith('Z') ? '' : 'Z')).toLocaleString()
    : '—';

  return (
    <div style={sectionStyle}>
      <h2 style={headingStyle}>SG Import</h2>
      <p style={descStyle}>Import data from ShotGrid / Flow Production Tracking.</p>

      {/* Connection status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{
          width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
          backgroundColor: sgStatus == null ? '#64748b' : sgStatus.configured ? '#22c55e' : '#ef4444',
        }} />
        <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
          {sgStatus?.url || '…'}
        </span>
        {sgStatus && !sgStatus.configured && (
          <span style={{ fontSize: 11, color: '#ef4444' }}>SG_URL or API_KEY not set in .env</span>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 2 }}>
        {sgStatus
          ? `Projects ${sgStatus.counts.projects} · Workers ${sgStatus.counts.workers} · Tasks ${sgStatus.counts.tasks}`
          : 'Loading counts…'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 20 }}>
        Last modified: {formattedDate}
      </div>

      {/* Per-entity sync cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <EntitySyncCard
          label="Projects"
          description="Select which project statuses to import."
          entity="projects"
          statusType="projectStatuses"
          adminPassword={adminPassword}
          onSync={runSync}
          onSelectedStatusesChange={setProjectStatusFilter}
        />
        <EntitySyncCard
          label="Departments"
          description="Import SG departments (no filter needed)."
          entity="departments"
          adminPassword={adminPassword}
          onSync={runSync}
        />
        <EntitySyncCard
          label="Workers"
          description="Import SG human users (no filter needed)."
          entity="workers"
          adminPassword={adminPassword}
          onSync={runSync}
        />
        <EntitySyncCard
          label="Tickets"
          description="Select which ticket statuses to import. The project picker is seeded from the Projects card above; click ↻ Refresh to re-sync, or hand-pick chips to override."
          entity="tickets"
          statusType="ticketStatuses"
          projectFilter
          inheritedProjectStatusFilter={projectStatusFilter}
          adminPassword={adminPassword}
          onSync={runSync}
          extra={<ResyncByIdRow adminPassword={adminPassword} />}
        />
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '16px 0' }} />

      {/* Data cleanup */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <BulkClearCard
          kind="tickets"
          title="Clear All Tickets"
          description="Permanently delete every ticket/task — both SG-imported and demo. Workers, goals, and milestones will be cleaned up automatically."
          onDone={async () => { await fetchState(); await loadStatus(); }}
        />
        <BulkClearCard
          kind="workers"
          title="Clear All Workers"
          description="Permanently delete every worker — both SG-imported and demo. Task assignments will be cleared automatically."
          onDone={async () => { await fetchState(); await loadStatus(); }}
        />
        <ClearCard adminPassword={adminPassword} onDone={async () => { await fetchState(); await loadStatus(); }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BulkClearCard — wipe every ticket or every worker (both demo + SG)
// ---------------------------------------------------------------------------

function BulkClearCard({ kind, title, description, onDone }: {
  kind: 'tickets' | 'workers';
  title: string;
  description: string;
  onDone: () => Promise<void>;
}) {
  const bulkClearTickets = useStore((s) => s.bulkClearTickets);
  const bulkClearWorkers = useStore((s) => s.bulkClearWorkers);
  const [phase, setPhase] = useState<'idle' | 'confirming' | 'running' | 'done' | 'error'>('idle');
  const [deleted, setDeleted] = useState(0);
  const [error, setError] = useState('');

  const run = async () => {
    setPhase('running');
    const result = kind === 'tickets' ? await bulkClearTickets('all') : await bulkClearWorkers('all');
    if (result.success) {
      setDeleted(result.deleted ?? 0);
      setPhase('done');
      await onDone();
    } else {
      setError(result.error ?? 'Unknown error');
      setPhase('error');
    }
  };

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>{description}</div>
      {phase === 'idle' && <button onClick={() => setPhase('confirming')} style={destructiveBtnStyle}>{title}</button>}
      {phase === 'confirming' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#ef4444' }}>Permanently delete all {kind}?</span>
          <button onClick={() => setPhase('idle')} style={secondaryBtnStyle}>Cancel</button>
          <button onClick={run} style={destructiveBtnStyle}>Confirm Delete</button>
        </div>
      )}
      {phase === 'running' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={spinnerStyle} />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Deleting…</span>
        </div>
      )}
      {(phase === 'done' || phase === 'error') && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: phase === 'done' ? '#22c55e' : '#ef4444' }}>
            {phase === 'done' ? `✓ Deleted ${deleted} ${kind}` : `✗ ${error}`}
          </span>
          <button onClick={() => { setPhase('idle'); setDeleted(0); setError(''); }} style={secondaryBtnStyle}>Reset</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default status selections
// ---------------------------------------------------------------------------
//
// The user almost always wants to filter SG status on import — importing every
// resolved/omitted/archived row creates noise that has to be cleaned up later.
// These defaults pre-select the most-useful subset; the user can still tick or
// untick any individual code before hitting Import.

/** Project statuses: only Active + Internal by default. Matched case-insensitively
 * since SG sites vary on whether they return short codes ('act', 'int') or
 * display labels ('Active', 'Internal'). */
const PROJECT_STATUS_DEFAULTS = ['active', 'internal', 'act', 'int'];

/** Ticket statuses: ALL except 'omt' (omit) and 'res' (resolved). Tickets in
 * those states are usually noise for the dependency graph view. */
const TICKET_STATUS_EXCLUDE = ['omt', 'res'];

function defaultSelectedStatuses(
  statusType: 'projectStatuses' | 'ticketStatuses' | undefined,
  available: string[],
): string[] {
  if (!statusType) return available;
  if (statusType === 'projectStatuses') {
    const wanted = new Set(PROJECT_STATUS_DEFAULTS);
    const matched = available.filter((s) => wanted.has(s.toLowerCase()));
    // If nothing matched (unusual SG configuration), fall back to all-selected
    // so the user still gets a usable starting point.
    return matched.length > 0 ? matched : available;
  }
  // ticketStatuses — invert: exclude the noisy codes
  const exclude = new Set(TICKET_STATUS_EXCLUDE);
  return available.filter((s) => !exclude.has(s.toLowerCase()));
}

/** Filter the SG project list down to those whose `sg_status` is in `statuses`.
 * Used by the Tickets card to derive its project-id list from the Projects
 * card's status selection. Empty input set → no projects match (sync runs
 * unbounded only if every project is selected, which can't happen via this
 * code path). */
function matchProjectsByStatus(projects: SgProjectOption[], statuses: Set<string>): SgProjectOption[] {
  if (statuses.size === 0) return [];
  return projects.filter((p) => p.sg_status && statuses.has(p.sg_status));
}

// ---------------------------------------------------------------------------
// EntitySyncCard — handles status-filter flow + sync for one entity type
// ---------------------------------------------------------------------------

interface SgProjectOption {
  id: number;
  name: string;
  sg_status: string;
}

interface EntitySyncCardProps {
  label: string;
  description: string;
  entity: string;
  statusType?: 'projectStatuses' | 'ticketStatuses';
  /** Show a project allow-list filter (currently only meaningful for tickets). */
  projectFilter?: boolean;
  /**
   * When provided, the per-project picker is hidden and project IDs to import
   * are derived at import time by filtering the fetched SG project list by
   * sg_status ∈ this set. Used by the Tickets card so the user only picks
   * project statuses once (on the Projects card) and the Tickets card stays
   * in sync automatically.
   */
  inheritedProjectStatusFilter?: Set<string>;
  /** Optional listener — fires whenever the user toggles a status chip. Lets
   * a parent component lift this card's selection into shared state. */
  onSelectedStatusesChange?: (statuses: Set<string>) => void;
  adminPassword: string;
  onSync: (entity: string, statuses?: string[], projectIds?: number[]) => Promise<{ success: boolean; output?: string; error?: string }>;
  extra?: React.ReactNode;
}

function EntitySyncCard({
  label, description, entity, statusType, projectFilter,
  inheritedProjectStatusFilter, onSelectedStatusesChange,
  adminPassword, onSync, extra,
}: EntitySyncCardProps) {
  const [loadingStatuses, setLoadingStatuses] = useState(false);
  const [availableStatuses, setAvailableStatuses] = useState<string[] | null>(null); // null = not yet loaded
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());

  const [loadingProjects, setLoadingProjects] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<SgProjectOption[] | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<number>>(new Set());

  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [resultPhase, setResultPhase] = useState<'none' | 'done' | 'error'>('none');
  const [error, setError] = useState('');

  // Auto-load filter options on mount
  useEffect(() => {
    if (statusType) fetchStatuses();
    if (projectFilter) fetchProjects();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStatuses = async () => {
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
      const statuses: string[] = data[statusType!] || [];
      setAvailableStatuses(statuses);
      const initial = new Set(defaultSelectedStatuses(statusType, statuses));
      setSelectedStatuses(initial);
      onSelectedStatusesChange?.(initial);
    } catch (e) {
      setError(String(e));
      setAvailableStatuses([]);
    } finally {
      setLoadingStatuses(false);
    }
  };

  const fetchProjects = async () => {
    setLoadingProjects(true);
    setError('');
    try {
      const res = await fetch('/api/sg/list-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch projects');
      const projects: SgProjectOption[] = data.projects || [];
      setAvailableProjects(projects);
      if (inheritedProjectStatusFilter) {
        // No visible picker — selection is always derived from the parent
        // card's status filter. Keep selectedProjectIds in sync with that so
        // canRun gates on a non-empty set.
        const matched = matchProjectsByStatus(projects, inheritedProjectStatusFilter);
        setSelectedProjectIds(new Set(matched.map((p) => p.id)));
      } else {
        // Standalone Projects picker — pre-select Active + Internal as a
        // sensible default. Fall back to all-selected if nothing matches.
        const wanted = new Set(PROJECT_STATUS_DEFAULTS);
        const preferred = projects.filter((p) => p.sg_status && wanted.has(p.sg_status.toLowerCase()));
        const initial = preferred.length > 0 ? preferred : projects;
        setSelectedProjectIds(new Set(initial.map((p) => p.id)));
      }
    } catch (e) {
      setError(String(e));
      setAvailableProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  };

  // Note: we intentionally do NOT auto-resync the project selection when the
  // parent card's status filter changes. The user may have manually deselected
  // specific projects after the initial seed; auto-syncing would clobber that.
  // Hitting ↻ Refresh on this card explicitly re-seeds from the parent.

  const runSync = async () => {
    setRunning(true);
    setOutput('');
    setError('');
    setResultPhase('none');
    const statuses = statusType ? Array.from(selectedStatuses) : undefined;
    // Only pass projectIds when the user has narrowed the set — if every
    // available project is selected, leave unbounded so newly-created SG
    // projects flow into future imports automatically.
    const projectIds = projectFilter && availableProjects && selectedProjectIds.size < availableProjects.length
      ? Array.from(selectedProjectIds)
      : undefined;
    const result = await onSync(entity, statuses, projectIds);
    setOutput(result.output || '');
    if (result.success !== false) {
      setResultPhase('done');
    } else {
      setError(result.error || `Import failed`);
      setResultPhase('error');
    }
    setRunning(false);
  };

  const toggleStatus = (s: string) => {
    setSelectedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      onSelectedStatusesChange?.(next);
      return next;
    });
  };

  const toggleProject = (id: number) => {
    setSelectedProjectIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllProjects = () => {
    if (availableProjects) setSelectedProjectIds(new Set(availableProjects.map(p => p.id)));
  };

  const clearAllProjects = () => setSelectedProjectIds(new Set());

  const canRun = !running
    && (!statusType || (availableStatuses !== null && selectedStatuses.size > 0))
    && (!projectFilter || (
      availableProjects !== null  // wait for the initial fetch to complete
      // Allow run if SG returned no projects (import unfiltered) or user picked at least one
      && (availableProjects.length === 0 || selectedProjectIds.size > 0)
    ));

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{description}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {running && <span style={spinnerStyle} />}
          {!running && (
            <button onClick={runSync} disabled={!canRun} style={{ ...accentBtnStyle, opacity: canRun ? 1 : 0.4 }}>
              Import
            </button>
          )}
        </div>
      </div>

      {/* Persistent status list for filterable entities */}
      {statusType && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Statuses</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flex: 1 }}>
              {loadingStatuses
                ? 'Loading…'
                : availableStatuses === null
                  ? 'Not loaded'
                  : `${selectedStatuses.size} / ${availableStatuses.length} selected`}
            </span>
            <button
              onClick={fetchStatuses}
              disabled={loadingStatuses}
              style={{ ...secondaryBtnStyle, padding: '3px 8px', fontSize: 11 }}
            >
              {loadingStatuses ? <span style={{ ...spinnerStyle, width: 10, height: 10 }} /> : '↻ Refresh'}
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {loadingStatuses && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>…</span>}
            {!loadingStatuses && availableStatuses?.map(s => (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                style={{
                  padding: '3px 10px', borderRadius: 12, border: '1px solid', fontSize: 11, cursor: 'pointer',
                  borderColor: selectedStatuses.has(s) ? '#a78bfa' : 'var(--color-border)',
                  backgroundColor: selectedStatuses.has(s) ? 'rgba(167,139,250,0.15)' : 'transparent',
                  color: selectedStatuses.has(s) ? '#a78bfa' : 'var(--color-text-muted)',
                }}
              >
                {s}
              </button>
            ))}
            {!loadingStatuses && availableStatuses?.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>No statuses found in SG</span>
            )}
          </div>
        </div>
      )}

      {/* Project allow-list. Always shows the per-project chip picker so the
          user can hand-pick projects. When `inheritedProjectStatusFilter` is
          supplied (Tickets card), the initial seed + the ↻ Refresh action
          select only those projects whose sg_status matches the parent
          card's selected statuses. Without it (standalone Projects picker),
          the seed is Active + Internal by default. After the seed lands the
          user is free to toggle individual chips; the auto-seed never runs
          again until the user explicitly hits ↻ Refresh. */}
      {projectFilter && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Projects</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flex: 1 }}>
              {loadingProjects
                ? 'Loading…'
                : availableProjects === null
                  ? 'Not loaded'
                  : availableProjects.length === 0
                    ? 'No projects in SG'
                    : selectedProjectIds.size === availableProjects.length
                      ? `All ${availableProjects.length} (no project filter applied)`
                      : `${selectedProjectIds.size} / ${availableProjects.length} selected${
                          inheritedProjectStatusFilter !== undefined ? ' — seeded from Projects card' : ''
                        }`}
            </span>
            <button onClick={selectAllProjects} disabled={loadingProjects || !availableProjects?.length}
              style={{ ...secondaryBtnStyle, padding: '3px 8px', fontSize: 11 }}>
              All
            </button>
            <button onClick={clearAllProjects} disabled={loadingProjects || !availableProjects?.length}
              style={{ ...secondaryBtnStyle, padding: '3px 8px', fontSize: 11 }}>
              None
            </button>
            <button
              onClick={fetchProjects}
              disabled={loadingProjects}
              style={{ ...secondaryBtnStyle, padding: '3px 8px', fontSize: 11 }}
              title={inheritedProjectStatusFilter !== undefined
                ? 'Re-fetch SG projects and re-seed selection from the Projects card status filter'
                : 'Re-fetch SG projects'}
            >
              {loadingProjects ? <span style={{ ...spinnerStyle, width: 10, height: 10 }} /> : '↻ Refresh'}
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {loadingProjects && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>…</span>}
            {!loadingProjects && availableProjects?.map(p => {
              const selected = selectedProjectIds.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleProject(p.id)}
                  title={`SG Project ID ${p.id}${p.sg_status ? ` · ${p.sg_status}` : ''}`}
                  style={{
                    padding: '3px 10px', borderRadius: 12, border: '1px solid', fontSize: 11, cursor: 'pointer',
                    borderColor: selected ? '#60a5fa' : 'var(--color-border)',
                    backgroundColor: selected ? 'rgba(96,165,250,0.15)' : 'transparent',
                    color: selected ? '#60a5fa' : 'var(--color-text-muted)',
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Result */}
      {resultPhase !== 'none' && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: resultPhase === 'done' ? '#22c55e' : '#ef4444', marginBottom: 4 }}>
            {resultPhase === 'done' ? `✓ ${label} imported` : `✗ Import failed`}
            {error && <span style={{ fontWeight: 400, marginLeft: 8 }}>{error}</span>}
          </div>
          {output && <pre style={logStyle}>{output}</pre>}
        </div>
      )}

      {/* Extra content (e.g. re-import-by-id row) */}
      {extra && (
        <>
          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '10px 0 8px' }} />
          {extra}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResyncByIdRow — re-sync a single entity (project, worker, or ticket) by SG ID
// ---------------------------------------------------------------------------

type EntityType = 'project-by-id' | 'worker-by-id' | 'ticket-by-id';

function ResyncByIdRow({ adminPassword }: { adminPassword: string }) {
  const fetchState = useStore((s) => s.fetchState);
  const [entityType, setEntityType] = useState<EntityType>('ticket-by-id');
  const [sgId, setSgId] = useState('');
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [result, setResult] = useState('');

  const entityLabels: Record<EntityType, string> = {
    'project-by-id': 'Project',
    'worker-by-id': 'Worker',
    'ticket-by-id': 'Ticket',
  };

  const run = async () => {
    const id = parseInt(sgId.trim(), 10);
    if (!id) return;
    setPhase('running');
    setResult('');
    try {
      const res = await fetch('/api/sg/trigger-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword, entity: entityType, sgId: id }),
      });
      const data = await res.json();
      if (data.success !== false) {
        await fetchState();
        setResult(data.output || `Imported ${entityLabels[entityType]} ${id}`);
        setPhase('done');
      } else {
        setResult(data.error || data.output || 'Failed');
        setPhase('error');
      }
    } catch (e) {
      setResult(String(e));
      setPhase('error');
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Re-import by SG ID:</span>
      <select
        value={entityType}
        onChange={e => { setEntityType(e.target.value as EntityType); setPhase('idle'); setResult(''); }}
        style={{
          padding: '4px 8px', borderRadius: 5,
          border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)',
          color: 'var(--color-text-primary)', fontSize: 12,
        }}
      >
        <option value="project-by-id">Project</option>
        <option value="worker-by-id">Worker</option>
        <option value="ticket-by-id">Ticket</option>
      </select>
      <input
        type="number"
        placeholder="e.g. 206"
        value={sgId}
        onChange={e => { setSgId(e.target.value); setPhase('idle'); setResult(''); }}
        onKeyDown={e => e.key === 'Enter' && run()}
        style={{
          width: 90, padding: '4px 8px', borderRadius: 5,
          border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)',
          color: 'var(--color-text-primary)', fontSize: 12,
        }}
      />
      {phase === 'running'
        ? <span style={spinnerStyle} />
        : (
          <button
            onClick={run}
            disabled={!sgId.trim()}
            style={{ ...accentBtnStyle, opacity: sgId.trim() ? 1 : 0.4, padding: '4px 10px' }}
          >
            Import
          </button>
        )
      }
      {result && (
        <span style={{ fontSize: 11, color: phase === 'done' ? '#22c55e' : '#ef4444', flex: '1 1 100%', marginTop: 2 }}>
          {phase === 'done' ? '✓ ' : '✗ '}{result}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FullBootstrapCard (reserved for future use)
// ---------------------------------------------------------------------------

export function FullBootstrapCard({ adminPassword: _adminPassword, onSync }: { adminPassword: string; onSync: (e: string) => Promise<{ success: boolean; output?: string; error?: string }> }) {
  const [phase, setPhase] = useState<'idle' | 'confirming' | 'running' | 'done' | 'error'>('idle');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  const run = async () => {
    setPhase('running');
    const result = await onSync('bootstrap');
    setOutput(result.output || '');
    if (result.success !== false) setPhase('done');
    else { setError(result.error || 'Failed'); setPhase('error'); }
  };

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Full Import</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
        Runs all import steps in sequence: departments → projects → workers → tickets (no status filters).
      </div>
      {phase === 'idle' && <button onClick={() => setPhase('confirming')} style={accentBtnStyle}>Run Full Import</button>}
      {phase === 'confirming' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Re-import all SG data?</span>
          <button onClick={() => setPhase('idle')} style={secondaryBtnStyle}>Cancel</button>
          <button onClick={run} style={accentBtnStyle}>Confirm</button>
        </div>
      )}
      {phase === 'running' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={spinnerStyle} />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Importing… (may take several minutes)</span>
        </div>
      )}
      {(phase === 'done' || phase === 'error') && (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: phase === 'done' ? '#22c55e' : '#ef4444' }}>
              {phase === 'done' ? '✓ Import complete' : `✗ ${error}`}
            </span>
            <button onClick={() => { setPhase('idle'); setOutput(''); setError(''); }} style={secondaryBtnStyle}>Run again</button>
          </div>
          {output && <pre style={logStyle}>{output}</pre>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClearCard
// ---------------------------------------------------------------------------

function ClearCard({ adminPassword, onDone }: { adminPassword: string; onDone: () => Promise<void> }) {
  const [phase, setPhase] = useState<'idle' | 'confirming' | 'running' | 'done' | 'error'>('idle');
  const [deleted, setDeleted] = useState(0);
  const [error, setError] = useState('');

  const run = async () => {
    setPhase('running');
    try {
      const res = await fetch('/api/sg/clear-sg-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setDeleted(data.deleted);
        setPhase('done');
        await onDone();
      } else {
        setError(data.error || 'Unknown error');
        setPhase('error');
      }
    } catch (e) {
      setError(String(e));
      setPhase('error');
    }
  };

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Clear SG Data</div>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
        Permanently delete all SG-synced entities from the local database.
      </div>
      {phase === 'idle' && <button onClick={() => setPhase('confirming')} style={destructiveBtnStyle}>Clear SG Data</button>}
      {phase === 'confirming' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#ef4444' }}>Permanently delete all SG entities?</span>
          <button onClick={() => setPhase('idle')} style={secondaryBtnStyle}>Cancel</button>
          <button onClick={run} style={destructiveBtnStyle}>Confirm Delete</button>
        </div>
      )}
      {phase === 'running' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={spinnerStyle} />
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Deleting…</span>
        </div>
      )}
      {(phase === 'done' || phase === 'error') && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: phase === 'done' ? '#22c55e' : '#ef4444' }}>
            {phase === 'done' ? `✓ Deleted ${deleted} entities` : `✗ ${error}`}
          </span>
          <button onClick={() => { setPhase('idle'); setDeleted(0); setError(''); }} style={secondaryBtnStyle}>Reset</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
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
  fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16,
};

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-tertiary)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: '12px 14px',
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

const destructiveBtnStyle: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 6,
  border: '1px solid #ef4444', backgroundColor: 'transparent',
  color: '#ef4444', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
};

const logStyle: React.CSSProperties = {
  backgroundColor: '#0f172a', border: '1px solid var(--color-border)',
  borderRadius: 6, padding: '8px 10px', fontSize: 11, fontFamily: 'monospace',
  color: '#94a3b8', maxHeight: 200, overflowY: 'auto',
  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
};

const spinnerStyle: React.CSSProperties = {
  display: 'inline-block', width: 13, height: 13, borderRadius: '50%',
  border: '2px solid var(--color-border)', borderTopColor: '#a78bfa',
  animation: 'spin 0.8s linear infinite', flexShrink: 0,
};
