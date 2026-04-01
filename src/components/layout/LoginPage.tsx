import { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import type { Worker, UserRole } from '../../types';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  coordinator: 'Coordinator',
  worker: 'Worker',
};

const ROLE_COLORS: Record<UserRole, string> = {
  admin: '#ef4444',
  coordinator: '#f59e0b',
  worker: '#6b7280',
};

export function LoginPage() {
  const workersMap = useStore((s) => s.workers);
  const departmentsMap = useStore((s) => s.departments);
  const setUserName = useStore((s) => s.setUserName);
  const setUserWorkerId = useStore((s) => s.setUserWorkerId);
  const setUserRole = useStore((s) => s.setUserRole);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'worker' | 'coordinator'>('all');
  const [userRoles, setUserRoles] = useState<Map<string, UserRole>>(new Map());

  // Fetch predefined roles from DB
  useEffect(() => {
    fetch('/api/users')
      .then((r) => r.json())
      .then((users: { name: string; role: string }[]) => {
        const map = new Map<string, UserRole>();
        for (const u of users) {
          map.set(u.name, u.role as UserRole);
        }
        setUserRoles(map);
      })
      .catch(() => {});
  }, []);

  const workers = Array.from(workersMap.values());
  const filtered = workers.filter((w) => {
    if (!w.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter !== 'all') {
      const role = userRoles.get(w.name) ?? 'worker';
      if (role !== roleFilter) return false;
    }
    return true;
  });

  // Group by department
  const byDept = new Map<string, Worker[]>();
  for (const w of filtered) {
    const group = byDept.get(w.departmentId) || [];
    group.push(w);
    byDept.set(w.departmentId, group);
  }

  const handleSelectWorker = (worker: Worker) => {
    const role = userRoles.get(worker.name) ?? 'worker';
    setUserName(worker.name);
    setUserWorkerId(worker.id);
    setUserRole(role);
  };

  return (
    <div style={{
      height: '100vh', width: '100vw',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'var(--color-bg-primary)',
    }}>
      <div style={{
        width: 440, padding: 32, borderRadius: 12,
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
      }}>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
          Who are you?
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 20 }}>
          Select your profile to get started
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search workers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 6,
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-primary)', fontSize: 13,
            outline: 'none', marginBottom: 10, boxSizing: 'border-box',
          }}
        />

        {/* Role filter */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {(['all', 'worker', 'coordinator'] as const).map((f) => {
            const active = roleFilter === f;
            const color = f === 'coordinator' ? ROLE_COLORS.coordinator : f === 'worker' ? ROLE_COLORS.worker : 'var(--color-text-muted)';
            return (
              <button
                key={f}
                onClick={() => setRoleFilter(f)}
                style={{
                  padding: '4px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer',
                  border: active ? `1px solid ${color}` : '1px solid var(--color-border)',
                  backgroundColor: active ? `${f === 'all' ? 'var(--color-bg-tertiary)' : color + '15'}` : 'transparent',
                  color: active ? (f === 'all' ? 'var(--color-text-primary)' : color) : 'var(--color-text-muted)',
                  fontWeight: active ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {f === 'all' ? 'All' : ROLE_LABELS[f]}
              </button>
            );
          })}
        </div>

        {/* Worker list */}
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {Array.from(byDept.entries()).map(([deptId, deptWorkers]) => {
            const dept = departmentsMap.get(deptId);
            return (
              <div key={deptId} style={{ marginBottom: 12 }}>
                <div style={{
                  fontSize: 10, fontWeight: 600, color: 'var(--color-text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
                }}>
                  {dept?.name || deptId}
                </div>
                {deptWorkers.map((w) => {
                  const role = userRoles.get(w.name) ?? 'worker';
                  const roleColor = ROLE_COLORS[role];
                  return (
                    <div
                      key={w.id}
                      onClick={() => handleSelectWorker(w)}
                      style={{
                        padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 10,
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        backgroundColor: 'var(--color-bg-tertiary)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)',
                      }}>
                        {w.name.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{w.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                          {(w.activeTaskIds?.length ?? 0)} active &middot; {(w.assignedTaskIds?.length ?? 0)} assigned
                        </div>
                      </div>
                      <span style={{
                        fontSize: 9, padding: '2px 6px', borderRadius: 4,
                        backgroundColor: `${roleColor}15`, color: roleColor,
                        fontWeight: 600,
                      }}>
                        {ROLE_LABELS[role]}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 12 }}>
              No workers found
            </div>
          )}
        </div>

        <div style={{
          marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-border)',
          fontSize: 10, color: 'var(--color-text-muted)', textAlign: 'center',
        }}>
          Admin access can be unlocked after login via the user menu
        </div>
      </div>
    </div>
  );
}
