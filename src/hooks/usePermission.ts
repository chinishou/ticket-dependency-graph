import { useStore } from '../store/useStore';

export function usePermission() {
  const role = useStore((s) => s.userRole);

  return {
    role,
    canEditTasks: role === 'admin' || role === 'coordinator',
    canEditPriorities: role === 'admin' || role === 'coordinator',
    canAccessSettings: role === 'admin',
    canManageRoles: role === 'admin',
    canEditLeads: role === 'admin',
    canViewWorkers: role === 'admin' || role === 'coordinator',
  };
}
