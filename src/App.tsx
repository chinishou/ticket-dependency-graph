import { useCallback, useEffect } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { GoalSelector } from './components/layout/GoalSelector';
import { ParentDropdown } from './components/layout/ParentDropdown';
import { ViewSwitcher } from './components/layout/ViewSwitcher';
import type { TopView } from './components/layout/ViewSwitcher';
import { LoginPage } from './components/layout/LoginPage';
import { TechTreeView } from './components/tech-tree/TechTreeView';
import { GoalMapView } from './components/tech-tree/GoalMapView';
import { CompanyDashboard } from './components/dashboard/CompanyDashboard';
import { ProjectDashboard } from './components/dashboard/ProjectDashboard';
import { DeptDashboard } from './components/dashboard/DeptDashboard';
import { CrossView } from './components/dashboard/CrossView';
import { TimelineView } from './components/timeline/TimelineView';
import { WorkerView } from './components/worker/WorkerView';
import { SettingsView } from './components/settings/SettingsView';
import { MyTasksView } from './components/worker/MyTasksView';
import { useStore } from './store/useStore';
import { useNotificationStore } from './store/useNotificationStore';
import { FloatingTaskDetailPanel } from './components/shared/FloatingTaskDetailPanel';
import { NotificationCenter } from './components/shared/NotificationCenter';
import { NotificationToast } from './components/shared/NotificationToast';
import type { UserRole } from './types';

// Poll interval - configurable via VITE_POLL_INTERVAL env var (default 30 seconds)
const POLL_INTERVAL_MS = parseInt(import.meta.env.VITE_POLL_INTERVAL || '30000', 10);

type SubViewA = 'goal-map' | 'tech-tree';
type SubViewB = 'company' | 'project' | 'department' | 'cross';

// ---------------------------------------------------------------------------
// URL ↔ navigation state mapping
// ---------------------------------------------------------------------------
//
// Routes (rendered by a single catch-all so we keep the existing big JSX
// switch — see below):
//   /                            role-based redirect
//   /my-tasks                    View F
//   /graph                       View A → first dept (auto-redirect)
//   /graph/dept/:deptId          View A goal-map for a department
//   /graph/project/:projectId    View A goal-map for a project
//   /graph/goal/:goalId          View A tech-tree drilled into a goal
//                                  ?task=:taskId highlights/opens that task
//   /dashboard                   View B company root
//   /dashboard/project/:id       View B project detail
//   /dashboard/dept/:id          View B department detail
//   /dashboard/cross             View B cross matrix
//   /timeline                    View C
//   /workers                     View D
//   /settings                    View E

interface RouteState {
  topView: TopView;
  subViewA: SubViewA;
  subViewB: SubViewB;
  goalId?: string;
  projectId?: string;
  deptId?: string;
  goalMapParent?: { type: 'department' | 'project'; id: string };
  taskIdFromUrl?: string;
}

function parseRoute(pathname: string, searchParams: URLSearchParams): RouteState {
  const parts = pathname.split('/').filter(Boolean);
  const taskIdFromUrl = searchParams.get('task') ?? undefined;
  const base: RouteState = { topView: 'F', subViewA: 'goal-map', subViewB: 'company' };
  if (parts.length === 0) return base;

  switch (parts[0]) {
    case 'my-tasks':
      return { ...base, topView: 'F', taskIdFromUrl };
    case 'graph': {
      if (parts[1] === 'goal' && parts[2]) {
        return { ...base, topView: 'A', subViewA: 'tech-tree', goalId: parts[2], taskIdFromUrl };
      }
      if (parts[1] === 'dept' && parts[2]) {
        return { ...base, topView: 'A', subViewA: 'goal-map', goalMapParent: { type: 'department', id: parts[2] } };
      }
      if (parts[1] === 'project' && parts[2]) {
        return { ...base, topView: 'A', subViewA: 'goal-map', goalMapParent: { type: 'project', id: parts[2] } };
      }
      return { ...base, topView: 'A', subViewA: 'goal-map' };
    }
    case 'dashboard': {
      if (parts[1] === 'project' && parts[2]) return { ...base, topView: 'B', subViewB: 'project', projectId: parts[2] };
      if (parts[1] === 'dept' && parts[2])    return { ...base, topView: 'B', subViewB: 'department', deptId: parts[2] };
      if (parts[1] === 'cross')               return { ...base, topView: 'B', subViewB: 'cross' };
      return { ...base, topView: 'B', subViewB: 'company' };
    }
    case 'timeline':
      return { ...base, topView: 'C', taskIdFromUrl };
    case 'workers':
      return { ...base, topView: 'D', taskIdFromUrl };
    case 'settings':
      return { ...base, topView: 'E' };
  }
  return base;
}

function defaultPathForRole(role: UserRole): string {
  switch (role) {
    case 'worker':      return '/my-tasks';
    case 'coordinator': return '/graph';
    case 'admin':       return '/dashboard';
  }
}

function defaultPathForView(view: TopView): string {
  switch (view) {
    case 'F': return '/my-tasks';
    case 'A': return '/graph';
    case 'B': return '/dashboard';
    case 'C': return '/timeline';
    case 'D': return '/workers';
    case 'E': return '/settings';
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
  const fetchState = useStore((s) => s.fetchState);
  const pollForUpdates = useStore((s) => s.pollForUpdates);
  const isConnected = useStore((s) => s.isConnected);
  const userRole = useStore((s) => s.userRole);
  const userName = useStore((s) => s.userName);

  // Fetch state from server on mount
  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Initialize notifications after store is ready, and reinitialize when user or connection changes
  useEffect(() => {
    useNotificationStore.getState().initNotifications();
  }, [userName, isConnected]);

  // Poll for updates when connected
  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(pollForUpdates, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isConnected, pollForUpdates]);

  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Login gate — must come before any route-derived logic so unauthenticated
  // users always land on the login screen regardless of the URL they hit.
  if (!userName) return <LoginPage />;

  // Role-based default redirect — only fires on the bare root path so shared
  // deep links survive (e.g. someone sends /graph/goal/X to a worker; we don't
  // hijack to /my-tasks).
  if (location.pathname === '/') {
    return <Navigate to={defaultPathForRole(userRole)} replace />;
  }

  const route = parseRoute(location.pathname, searchParams);
  return <AppContent route={route} />;
}

// ---------------------------------------------------------------------------
// Routed app body — split out so we can short-circuit on login / root above
// without consuming the route-driven hooks.
// ---------------------------------------------------------------------------

function AppContent({ route }: { route: RouteState }) {
  const userRole = useStore((s) => s.userRole);
  const company = useStore((s) => s.company);
  const goalsMap = useStore((s) => s.goals);
  const departmentsMap = useStore((s) => s.departments);
  const projectsMap = useStore((s) => s.projects);
  const setSelectedTask = useStore((s) => s.setSelectedTask);
  const setSelectedMilestone = useStore((s) => s.setSelectedMilestone);
  const selectedTaskId = useStore((s) => s.selectedTaskId);

  const navigate = useNavigate();

  // URL-derived navigation state — these used to be useState; now they're
  // read from the parsed route.
  const { topView, subViewA, subViewB } = route;
  const selectedGoalId = route.goalId ?? '';
  const selectedProjectId = route.projectId ?? '';
  const selectedDeptId = route.deptId ?? '';

  // Goal-map parent. When the user is drilled into a goal (/graph/goal/G), we
  // still want the ParentDropdown to reflect that goal's parent so clicking
  // "Goal Map" returns to the right place. Derive from the URL first, then
  // fall back to the current goal's stored parent.
  let goalMapParentType: 'department' | 'project' = 'department';
  let goalMapParentId = '';
  if (route.goalMapParent) {
    goalMapParentType = route.goalMapParent.type;
    goalMapParentId = route.goalMapParent.id;
  } else if (route.goalId) {
    const g = goalsMap.get(route.goalId);
    if (g) {
      goalMapParentType = g.parentType;
      goalMapParentId = g.parentId;
    }
  }

  // Sync the URL's ?task=… into the Zustand store. We treat the URL as the
  // entry point — first render after navigating sets the task; subsequent
  // task clicks update the store directly without touching the URL.
  useEffect(() => {
    if (route.taskIdFromUrl && route.taskIdFromUrl !== selectedTaskId) {
      setSelectedTask(route.taskIdFromUrl);
    }
  }, [route.taskIdFromUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // /graph with no specific parent → redirect to the first available
  // department so the URL is always canonical. Only kicks in after entities
  // load, to avoid landing on /graph/dept/ (empty id).
  useEffect(() => {
    if (topView === 'A' && subViewA === 'goal-map' && !route.goalMapParent && departmentsMap.size > 0) {
      const firstDept = Array.from(departmentsMap.keys())[0];
      if (firstDept) navigate(`/graph/dept/${firstDept}`, { replace: true });
    }
  }, [topView, subViewA, route.goalMapParent, departmentsMap, navigate]);

  const goal = goalsMap.get(selectedGoalId);
  const parent = goal
    ? goal.parentType === 'department'
      ? departmentsMap.get(goal.parentId)
      : projectsMap.get(goal.parentId)
    : null;

  // ----- Handlers ----------------------------------------------------------
  // Each handler clears any open selection panel and navigates. The browser's
  // back/forward buttons now drive history, so we no longer need the old
  // EntrySource discriminated union.

  const clearSelection = useCallback(() => {
    setSelectedTask(null);
    setSelectedMilestone(null);
  }, [setSelectedTask, setSelectedMilestone]);

  const handleGoalChange = useCallback((goalId: string) => {
    clearSelection();
    navigate(`/graph/goal/${goalId}`);
  }, [clearSelection, navigate]);

  const handleGoalMapSelect = useCallback((goalId: string) => {
    clearSelection();
    navigate(`/graph/goal/${goalId}`);
  }, [clearSelection, navigate]);

  const handleGoToGoalMap = useCallback(() => {
    clearSelection();
    // Prefer the current goal's parent so "Goal Map" always lands on the
    // right department/project — works whether the user came from goal-map
    // earlier in the session or via a shared deep link.
    const current = goalsMap.get(selectedGoalId);
    if (current) {
      const seg = current.parentType === 'department' ? 'dept' : 'project';
      navigate(`/graph/${seg}/${current.parentId}`);
    } else {
      navigate('/graph');
    }
  }, [clearSelection, goalsMap, selectedGoalId, navigate]);

  const handleGoToTechTree = useCallback((goalId: string, taskId: string) => {
    clearSelection();
    navigate(`/graph/goal/${goalId}?task=${encodeURIComponent(taskId)}`);
  }, [clearSelection, navigate]);

  const handleCloseFloatingPanel = useCallback(() => {
    setSelectedTask(null);
  }, [setSelectedTask]);

  const handleParentChange = useCallback((type: 'department' | 'project', id: string) => {
    const seg = type === 'department' ? 'dept' : 'project';
    navigate(`/graph/${seg}/${id}`);
  }, [navigate]);

  const handleSelectProject = useCallback((projectId: string) => {
    navigate(`/dashboard/project/${projectId}`);
  }, [navigate]);

  const handleSelectDepartment = useCallback((deptId: string) => {
    navigate(`/dashboard/dept/${deptId}`);
  }, [navigate]);

  const handleBackToCompany = useCallback(() => {
    navigate('/dashboard');
  }, [navigate]);

  const handleSelectCrossView = useCallback(() => {
    navigate('/dashboard/cross');
  }, [navigate]);

  // Dashboard → tech-tree is the same flow as any other goal navigation now —
  // browser back returns the user to the dashboard naturally.
  const handleDashboardGoalSelect = handleGoalChange;

  const handleViewSwitch = useCallback((view: TopView) => {
    navigate(defaultPathForView(view));
  }, [navigate]);

  const handleBreadcrumbBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // ----- Breadcrumbs -------------------------------------------------------

  const buildBreadcrumbs = () => {
    if (topView === 'F') {
      return [{ label: company.name }, { label: 'My Tasks' }];
    }

    if (topView === 'A') {
      if (subViewA === 'goal-map') {
        const p = route.goalMapParent
          ? (route.goalMapParent.type === 'department'
              ? departmentsMap.get(route.goalMapParent.id)
              : projectsMap.get(route.goalMapParent.id))
          : null;
        return [
          { label: company.name },
          ...(p ? [{ label: p.name }] : []),
          { label: 'Goals' },
        ];
      }
      // tech-tree
      return [
        { label: company.name, href: '#', onClick: handleBreadcrumbBack },
        ...(parent ? [{ label: parent.name, href: '#', onClick: handleGoToGoalMap }] : []),
        ...(goal ? [{ label: goal.name }] : []),
      ];
    }

    if (topView === 'B') {
      if (subViewB === 'company') {
        return [{ label: company.name }, { label: 'Dashboard' }];
      }
      if (subViewB === 'cross') {
        return [
          { label: company.name, href: '#', onClick: handleBackToCompany },
          { label: 'Cross-View' },
        ];
      }
      if (subViewB === 'project') {
        const proj = projectsMap.get(selectedProjectId);
        return [
          { label: company.name, href: '#', onClick: handleBackToCompany },
          { label: 'Projects', href: '#', onClick: handleBackToCompany },
          ...(proj ? [{ label: proj.name }] : []),
        ];
      }
      if (subViewB === 'department') {
        const dept = departmentsMap.get(selectedDeptId);
        return [
          { label: company.name, href: '#', onClick: handleBackToCompany },
          { label: 'Departments', href: '#', onClick: handleBackToCompany },
          ...(dept ? [{ label: dept.name }] : []),
        ];
      }
    }

    if (topView === 'C') return [{ label: company.name }, { label: 'Timeline' }];
    if (topView === 'D') return [{ label: company.name }, { label: 'Workers' }];
    if (topView === 'E') return [{ label: company.name }, { label: 'Settings' }];

    return [{ label: company.name }];
  };

  // Note on permissions: the URL is the source of truth for which view to
  // render. If a worker lands on /settings via a shared link, the URL stays
  // /settings but the permission-protected components inside SettingsView
  // enforce access. ViewSwitcher's role-filtered tab list still hides
  // unreachable entries from the picker.

  return (
    <AppShell
      breadcrumbs={buildBreadcrumbs()}
      rightContent={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <NotificationCenter />
          {topView === 'A' && subViewA === 'tech-tree' && (
            <button
              onClick={handleGoToGoalMap}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-tertiary)',
                color: 'var(--color-text-secondary)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Goal Map
            </button>
          )}
          {topView === 'A' && subViewA === 'goal-map' && (
            <ParentDropdown
              parentType={goalMapParentType}
              parentId={goalMapParentId}
              onChange={handleParentChange}
            />
          )}
          {topView === 'A' && subViewA === 'tech-tree' && (
            <GoalSelector
              selectedGoalId={selectedGoalId}
              onSelectGoal={handleGoalChange}
            />
          )}
          <ViewSwitcher activeView={topView} onSwitch={handleViewSwitch} role={userRole} />
        </div>
      }
    >
      {/* View F: My Tasks */}
      {topView === 'F' && (
        <div key="my-tasks" className="view-enter" style={{ width: '100%', height: '100%', position: 'relative' }}>
          <MyTasksView onSelectGoal={handleGoalChange} onSelectTask={(taskId) => { setSelectedTask(taskId); }} />
          {selectedTaskId && <FloatingTaskDetailPanel onGoToTechTree={handleGoToTechTree} onClose={handleCloseFloatingPanel} />}
        </div>
      )}

      {/* View A: Dependency Graph */}
      {topView === 'A' && subViewA === 'goal-map' && goalMapParentId && (
        <div key={`goal-map-${goalMapParentType}-${goalMapParentId}`} className="view-enter" style={{ width: '100%', height: '100%' }}>
          <GoalMapView
            parentType={goalMapParentType}
            parentId={goalMapParentId}
            onSelectGoal={handleGoalMapSelect}
          />
        </div>
      )}
      {topView === 'A' && subViewA === 'tech-tree' && (
        <div key={`tree-${selectedGoalId}`} className="view-enter" style={{ width: '100%', height: '100%' }}>
          <TechTreeView goalId={selectedGoalId} />
        </div>
      )}

      {/* View B: Dashboard */}
      {topView === 'B' && subViewB === 'company' && (
        <div key="company" className="view-enter" style={{ width: '100%', height: '100%' }}>
          <CompanyDashboard
            onSelectProject={handleSelectProject}
            onSelectDepartment={handleSelectDepartment}
            onSelectCrossView={handleSelectCrossView}
          />
        </div>
      )}
      {topView === 'B' && subViewB === 'cross' && (
        <div key="cross" className="view-enter" style={{ width: '100%', height: '100%' }}>
          <CrossView onSelectGoal={handleDashboardGoalSelect} onBack={handleBackToCompany} />
        </div>
      )}
      {topView === 'B' && subViewB === 'project' && selectedProjectId && (
        <div key={`proj-${selectedProjectId}`} className="view-enter" style={{ width: '100%', height: '100%' }}>
          <ProjectDashboard
            projectId={selectedProjectId}
            onSelectGoal={handleDashboardGoalSelect}
            onBack={handleBackToCompany}
          />
        </div>
      )}
      {topView === 'B' && subViewB === 'department' && selectedDeptId && (
        <div key={`dept-${selectedDeptId}`} className="view-enter" style={{ width: '100%', height: '100%' }}>
          <DeptDashboard
            departmentId={selectedDeptId}
            onSelectGoal={handleDashboardGoalSelect}
            onBack={handleBackToCompany}
          />
        </div>
      )}

      {/* View C: Timeline */}
      {topView === 'C' && (
        <div key="timeline" className="view-enter" style={{ width: '100%', height: '100%', position: 'relative' }}>
          <TimelineView onSelectGoal={handleGoalChange} />
          {selectedTaskId && <FloatingTaskDetailPanel onGoToTechTree={handleGoToTechTree} onClose={handleCloseFloatingPanel} />}
        </div>
      )}

      {/* View D: Workers */}
      {topView === 'D' && (
        <div key="workers" className="view-enter" style={{ width: '100%', height: '100%', position: 'relative' }}>
          <WorkerView onSelectGoal={handleGoalChange} onSelectTask={(taskId) => { setSelectedTask(taskId); }} />
          {selectedTaskId && <FloatingTaskDetailPanel onGoToTechTree={handleGoToTechTree} onClose={handleCloseFloatingPanel} />}
        </div>
      )}

      {/* View E: Settings */}
      {topView === 'E' && (
        <div key="settings" className="view-enter" style={{ width: '100%', height: '100%' }}>
          <SettingsView />
        </div>
      )}
      <NotificationToast />
    </AppShell>
  );
}

export default App;
