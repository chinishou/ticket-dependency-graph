import { useStore } from '../../store/useStore';

interface ParentSelectorProps {
  parentType: 'department' | 'project';
  parentId: string;
  onChange: (type: 'department' | 'project', id: string) => void;
}

const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2 };

export function ParentSelector({ parentType, parentId, onChange }: ParentSelectorProps) {
  const departmentsMap = useStore((s) => s.departments);
  const projectsMap = useStore((s) => s.projects);

  const departments = Array.from(departmentsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const projects = Array.from(projectsMap.values())
    .filter((p) => p.status === 'active')
    .sort((a, b) => {
      const pDiff = (PRIORITY_ORDER[a.strategicPriority] ?? 9) - (PRIORITY_ORDER[b.strategicPriority] ?? 9);
      return pDiff !== 0 ? pDiff : a.name.localeCompare(b.name);
    });

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

  const activePill: React.CSSProperties = {
    ...pillBase,
    backgroundColor: '#a78bfa',
    color: '#0f172a',
    borderColor: '#a78bfa',
    fontWeight: 600,
  };

  const inactivePill: React.CSSProperties = {
    ...pillBase,
    backgroundColor: 'var(--color-bg-tertiary)',
    color: 'var(--color-text-secondary)',
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 12px',
      overflowX: 'auto',
      // Hide scrollbar cross-browser
      msOverflowStyle: 'none',
      scrollbarWidth: 'none',
    } as React.CSSProperties}>
      {/* Departments */}
      {departments.map((dept) => {
        const isActive = parentType === 'department' && parentId === dept.id;
        return (
          <button
            key={dept.id}
            onClick={() => onChange('department', dept.id)}
            style={isActive ? activePill : inactivePill}
          >
            {dept.name}
          </button>
        );
      })}

      {/* Separator */}
      {departments.length > 0 && projects.length > 0 && (
        <div style={{
          width: 1,
          height: 20,
          backgroundColor: 'var(--color-border)',
          flexShrink: 0,
          margin: '0 4px',
        }} />
      )}

      {/* Projects */}
      {projects.map((proj) => {
        const isActive = parentType === 'project' && parentId === proj.id;
        return (
          <button
            key={proj.id}
            onClick={() => onChange('project', proj.id)}
            style={isActive ? { ...activePill, backgroundColor: '#60a5fa', borderColor: '#60a5fa' } : inactivePill}
            title={`${proj.strategicPriority} · ${proj.name}`}
          >
            <span style={{ fontSize: 9, opacity: 0.75, marginRight: 4 }}>{proj.strategicPriority}</span>
            {proj.name}
          </button>
        );
      })}
    </div>
  );
}
