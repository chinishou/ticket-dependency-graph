import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';

interface ParentSelectorProps {
  parentType: 'department' | 'project';
  parentId: string;
  onChange: (type: 'department' | 'project', id: string) => void;
}

// Priority sort: P1 first, then P2, P3, then anything unrecognised. Both
// Department.priority and Project.strategicPriority use the same enum, so the
// same comparator works for both halves of the bar.
const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2 };

function comparePriority<T extends { name: string; priority?: string; strategicPriority?: string }>(a: T, b: T): number {
  const ap = a.priority ?? a.strategicPriority ?? '';
  const bp = b.priority ?? b.strategicPriority ?? '';
  const pDiff = (PRIORITY_ORDER[ap] ?? 9) - (PRIORITY_ORDER[bp] ?? 9);
  return pDiff !== 0 ? pDiff : a.name.localeCompare(b.name);
}

export function ParentSelector({ parentType, parentId, onChange }: ParentSelectorProps) {
  const departmentsMap = useStore((s) => s.departments);
  const projectsMap = useStore((s) => s.projects);

  // Live filter — case-insensitive substring match against name. Empty string
  // shows everything (original behaviour).
  const [filter, setFilter] = useState('');
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

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 12px',
      overflowX: 'auto',
      msOverflowStyle: 'none',
      scrollbarWidth: 'none',
    } as React.CSSProperties}>
      {/* Filter input */}
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter…"
        aria-label="Filter departments and projects"
        style={{
          width: 130,
          padding: '5px 10px',
          borderRadius: 20,
          border: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-bg-tertiary)',
          color: 'var(--color-text-primary)',
          fontSize: 12,
          outline: 'none',
          flexShrink: 0,
        }}
      />
      {filter && (
        <button
          onClick={() => setFilter('')}
          title="Clear filter"
          style={clearBtnStyle}
        >
          ×
        </button>
      )}

      {/* Departments */}
      {departments.map((dept) => {
        const isActive = parentType === 'department' && parentId === dept.id;
        return (
          <button
            key={dept.id}
            onClick={() => onChange('department', dept.id)}
            style={isActive ? activeDeptPill : inactivePill}
            title={`${dept.priority ?? ''} · ${dept.name}`}
          >
            {dept.priority && (
              <span style={{ fontSize: 9, opacity: 0.75, marginRight: 4 }}>{dept.priority}</span>
            )}
            {dept.name}
          </button>
        );
      })}

      {/* Separator — only when both halves have visible items */}
      {departments.length > 0 && projects.length > 0 && (
        <div style={{
          width: 1, height: 20,
          backgroundColor: 'var(--color-border)',
          flexShrink: 0, margin: '0 4px',
        }} />
      )}

      {/* Projects */}
      {projects.map((proj) => {
        const isActive = parentType === 'project' && parentId === proj.id;
        return (
          <button
            key={proj.id}
            onClick={() => onChange('project', proj.id)}
            style={isActive ? activeProjPill : inactivePill}
            title={`${proj.strategicPriority} · ${proj.name}`}
          >
            <span style={{ fontSize: 9, opacity: 0.75, marginRight: 4 }}>{proj.strategicPriority}</span>
            {proj.name}
          </button>
        );
      })}

      {/* Empty-state hint when filter matches nothing */}
      {q && departments.length === 0 && projects.length === 0 && (
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', paddingLeft: 4 }}>
          No matches
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const pillBase: React.CSSProperties = {
  padding: '5px 12px',
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  border: '1px solid var(--color-border)',
  whiteSpace: 'nowrap',
  transition: 'background-color 0.15s, color 0.15s, border-color 0.15s',
  flexShrink: 0,
};

const inactivePill: React.CSSProperties = {
  ...pillBase,
  backgroundColor: 'var(--color-bg-tertiary)',
  color: 'var(--color-text-secondary)',
};

const activeDeptPill: React.CSSProperties = {
  ...pillBase,
  backgroundColor: '#a78bfa',
  color: '#0f172a',
  borderColor: '#a78bfa',
  fontWeight: 600,
};

const activeProjPill: React.CSSProperties = {
  ...pillBase,
  backgroundColor: '#60a5fa',
  color: '#0f172a',
  borderColor: '#60a5fa',
  fontWeight: 600,
};

const clearBtnStyle: React.CSSProperties = {
  padding: '2px 7px',
  borderRadius: 12,
  border: '1px solid var(--color-border)',
  backgroundColor: 'transparent',
  color: 'var(--color-text-muted)',
  fontSize: 12,
  lineHeight: 1,
  cursor: 'pointer',
  flexShrink: 0,
};
