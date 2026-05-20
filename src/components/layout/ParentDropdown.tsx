import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';

interface ParentDropdownProps {
  parentType: 'department' | 'project';
  parentId: string;
  onChange: (type: 'department' | 'project', id: string) => void;
}

const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2 };

function comparePriority<T extends { name: string; priority?: string; strategicPriority?: string }>(a: T, b: T): number {
  const ap = a.priority ?? a.strategicPriority ?? '';
  const bp = b.priority ?? b.strategicPriority ?? '';
  const pDiff = (PRIORITY_ORDER[ap] ?? 9) - (PRIORITY_ORDER[bp] ?? 9);
  return pDiff !== 0 ? pDiff : a.name.localeCompare(b.name);
}

/**
 * Compact dept/project picker for the top bar. Replaces the horizontal pill
 * bar above GoalMapView so the header stays clean even when the studio has
 * dozens of departments. Click the button to open a popup with a search input
 * and a grouped list of departments (purple) + active projects (blue).
 */
export function ParentDropdown({ parentType, parentId, onChange }: ParentDropdownProps) {
  const departmentsMap = useStore((s) => s.departments);
  const projectsMap = useStore((s) => s.projects);

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus the filter input when the popup opens; reset filter on close.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setFilter('');
    }
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const q = filter.trim().toLowerCase();
  const departments = useMemo(() => {
    const all = Array.from(departmentsMap.values()).sort(comparePriority);
    return q ? all.filter((d) => d.name.toLowerCase().includes(q)) : all;
  }, [departmentsMap, q]);
  const projects = useMemo(() => {
    const all = Array.from(projectsMap.values())
      .filter((p) => p.status === 'active')
      .sort(comparePriority);
    return q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all;
  }, [projectsMap, q]);

  const current = parentType === 'department'
    ? departmentsMap.get(parentId)
    : projectsMap.get(parentId);
  const currentName = current?.name ?? '(none)';
  const currentPriority =
    parentType === 'department'
      ? (current as { priority?: string } | undefined)?.priority
      : (current as { strategicPriority?: string } | undefined)?.strategicPriority;
  const accent = parentType === 'department' ? '#a78bfa' : '#60a5fa';

  const handlePick = (type: 'department' | 'project', id: string) => {
    onChange(type, id);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: '6px 12px',
          borderRadius: 6,
          border: `1px solid ${accent}`,
          backgroundColor: `${accent}22`,
          color: 'var(--color-text-primary)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          maxWidth: 240,
          whiteSpace: 'nowrap',
        }}
        title="Switch department or project"
      >
        <span style={{ fontSize: 10, opacity: 0.75, color: accent }}>
          {parentType === 'department' ? 'Dept' : 'Proj'}
          {currentPriority ? ` ${currentPriority}` : ''}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentName}</span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            width: 280,
            maxHeight: 420,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 100,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter…"
            aria-label="Filter departments and projects"
            style={{
              margin: 8,
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-primary)',
              fontSize: 12,
              outline: 'none',
              flexShrink: 0,
            }}
          />

          <div style={{ overflowY: 'auto', padding: '0 4px 8px' }}>
            {departments.length > 0 && (
              <SectionHeader label="Departments" />
            )}
            {departments.map((d) => (
              <DropdownRow
                key={d.id}
                label={d.name}
                priority={d.priority}
                accent="#a78bfa"
                active={parentType === 'department' && parentId === d.id}
                onClick={() => handlePick('department', d.id)}
              />
            ))}

            {projects.length > 0 && (
              <SectionHeader label="Projects" />
            )}
            {projects.map((p) => (
              <DropdownRow
                key={p.id}
                label={p.name}
                priority={p.strategicPriority}
                accent="#60a5fa"
                active={parentType === 'project' && parentId === p.id}
                onClick={() => handlePick('project', p.id)}
              />
            ))}

            {departments.length === 0 && projects.length === 0 && (
              <div style={{ padding: 12, fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center' }}>
                No matches
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding: '6px 10px 2px',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: 'var(--color-text-muted)',
    }}>
      {label}
    </div>
  );
}

function DropdownRow({ label, priority, accent, active, onClick }: {
  label: string;
  priority?: string;
  accent: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '6px 10px',
        borderRadius: 4,
        border: '1px solid transparent',
        backgroundColor: active ? `${accent}22` : 'transparent',
        color: active ? accent : 'var(--color-text-primary)',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {priority && (
        <span style={{
          fontSize: 9, fontWeight: 700, opacity: 0.75,
          color: active ? accent : 'var(--color-text-muted)',
          minWidth: 18,
        }}>
          {priority}
        </span>
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </button>
  );
}
