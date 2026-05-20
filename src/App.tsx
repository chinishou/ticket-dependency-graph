import { useState, useCallback, useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { GoalSelector } from './components/layout/GoalSelector';
import { ParentDropdown } from './components/layout/ParentDropdown';
import { ViewSwitcher, getDefaultView } from './components/layout/ViewSwitcher';
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

// Poll interval - configurable via VITE_POLL_INTERVAL env var (default 30 seconds)
const POLL_INTERVAL_MS = parseInt(import.meta.env.VITE_POLL_INTERVAL || '30000', 10);

type SubViewA = 'goal-map' | 'tech-tree';
type SubViewB = 'company' | 'project' | 'department' | 'cross';

type EntrySource =
  | { from: 'goal-map' }
  | { from: 'project-dashboard'; projectId: string }
  | { from: 'dept-dashboard'; deptId: string }
  | { from: 'cross-view' };

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

  // Poll for updates when connected (interval configurable via VITE_POLL_INTERVAL, default 30s)
  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(pollForUpdates, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isConnected, pollForUpdates]);

  const company = useStore((s) => s.company);
  const goalsMap = useStore((s) => s.goals);
  const departmentsMap = useStore((s) => s.departments);
  const projectsMap = useStore((s) => s.projects);
  const setSelectedTask = useStore((s) => s.setSelectedTask);
  const setSelectedMilestone = useStore((s) => s.setSelectedMilestone);
  const selectedTaskId = useStore((s) => s.selectedTaskId);

  const [topView, setTopView] = useState<TopView>(() => getDefaultView(userRole));
  const [subViewA, setSubViewA] = useState<SubViewA>(() => userRole === 'coordinator' ? 'goal-map' : 'tech-tree');
  const [subViewB, setSubViewB] = useState<SubViewB>('company');
  const [selectedGoalId, setSelectedGoalId] = useState('goal-demo');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [entrySource, setEntrySource] = useState<EntrySource>({ from: 'goal-map' });

  // Reset to default view whenever role changes (including re-login as different role)
  const [lastRole, setLastRole] = useState(userRole);
  useEffect(() => {
    if (userRole !== lastRole) {
      setLastRole(userRole);
      setTopView(getDefaultView(userRole));
      setSubViewA(userRole === 'coordinator' ? 'goal-map' : 'tech-tree');
    }
  }, [userRole, lastRole]);

  const goal = goalsMap.get(selectedGoalId);
  const parent = goal
    ? goal.parentType === 'department'
      ? departmentsMap.get(goal.parentId)
      : projectsMap.get(goal.parentId)
    : null;

  // User-controlled goal map parent (which dept/project to display in GoalMapView)
  const [goalMapParentType, setGoalMapParentType] = useState<'department' | 'project'>('department');
  const [goalMapParentId, setGoalMapParentId] = useState<string>('');

  // Initialize goalMapParentId once departments load
  useEffect(() => {
    if (!goalMapParentId && departmentsMap.size > 0) {
      setGoalMapParentId(Array.from(departmentsMap.keys())[0]);
    }
  }, [departmentsMap, goalMapParentId]);

  const handleParentChange = useCallback((type: 'department' | 'project', id: string) => {
    setGoalMapParentType(type);
    setGoalMapParentId(id);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTask(null);
    setSelectedMilestone(null);
  }, [setSelectedTask, setSelectedMilestone]);

  // --- View A handlers ---
  const handleGoalChange = useCallback((goalId: string) => {
    clearSelection();
    setSelectedGoalId(goalId);
    setSubViewA('tech-tree');
    setTopView('A');
  }, [clearSelection]);

  const handleGoalMapSelect = useCallback((goalId: string) => {
    clearSelection();
    setSelectedGoalId(goalId);
    setSubViewA('tech-tree');
    // Keep goalMap parent in sync with the selected goal's parent
    const selectedGoal = goalsMap.get(goalId);
    if (selectedGoal) {
      setGoalMapParentType(selectedGoal.parentType);
      setGoalMapParentId(selectedGoal.parentId);
    }
  }, [clearSelection, goalsMap]);

  const handleGoToGoalMap = useCallback(() => {
    clearSelection();
    setSubViewA('goal-map');
    setEntrySource({ from: 'goal-map' });
  }, [clearSelection]);

  const handleGoToTechTree = useCallback((goalId: string, taskId: string) => {
    clearSelection();
    setSelectedGoalId(goalId);
    setSubViewA('tech-tree');
    setTopView('A');
    setSelectedTask(taskId);
  }, [clearSelection, setSelectedTask]);

  const handleCloseFloatingPanel = useCallback(() => {
    setSelectedTask(null);
  }, [setSelectedTask]);

  // --- View B handlers ---
  const handleSelectProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    setSubViewB('project');
  }, []);

  const handleSelectDepartment = useCallback((deptId: string) => {
    setSelectedDeptId(deptId);
    setSubViewB('department');
  }, []);

  const handleBackToCompany = useCallback(() => {
    setSubViewB('company');
  }, []);

  const handleSelectCrossView = useCallback(() => {
    setSubViewB('cross');
  }, []);

  const handleDashboardGoalSelect = useCallback((goalId: string) => {
    clearSelection();
    setSelectedGoalId(goalId);
    setSubViewA('tech-tree');
    setTopView('A');
    // Record where we came from so breadcrumb can navigate back
    if (subViewB === 'project') setEntrySource({ from: 'project-dashboard', projectId: selectedProjectId });
    else if (subViewB === 'department') setEntrySource({ from: 'dept-dashboard', deptId: selectedDeptId });
    else if (subViewB === 'cross') setEntrySource({ from: 'cross-view' });
    else setEntrySource({ from: 'goal-map' });
  }, [clearSelection, subViewB, selectedProjectId, selectedDeptId]);

  // --- View switching ---
  const handleViewSwitch = useCallback((view: TopView) => {
    setTopView(view);
  }, []);

  // --- Breadcrumb back handler (context-aware) ---
  const handleBreadcrumbBack = useCallback(() => {
    if (entrySource.from === 'project-dashboard') {
      setSelectedProjectId(entrySource.projectId);
      setSubViewB('project');
      setTopView('B');
    } else if (entrySource.from === 'dept-dashboard') {
      setSelectedDeptId(entrySource.deptId);
      setSubViewB('department');
      setTopView('B');
    } else if (entrySource.from === 'cross-view') {
      setSubViewB('cross');
      setTopView('B');
    } else {
      handleGoToGoalMap();
    }
  }, [entrySource, handleGoToGoalMap]);

  // --- Breadcrumbs ---
  const buildBreadcrumbs = () => {
    if (topView === 'F') {
      return [{ label: company.name }, { label: 'My Tasks' }];
    }

    if (topView === 'A') {
      if (subViewA === 'goal-map') {
        return [
          { label: company.name },
          ...(parent ? [{ label: parent.name }] : []),
          { label: 'Goals' },
        ];
      }
      // tech-tree: breadcrumb parent uses entrySource to navigate back correctly
      const backLabel = entrySource.from === 'project-dashboard'
        ? (projectsMap.get(entrySource.projectId)?.name ?? 'Project')
        : entrySource.from === 'dept-dashboard'
          ? (departmentsMap.get(entrySource.deptId)?.name ?? 'Department')
          : (parent?.name ?? company.name);
      return [
        { label: company.name, href: '#', onClick: handleBreadcrumbBack },
        { label: backLabel, href: '#', onClick: handleBreadcrumbBack },
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

    if (topView === 'C') {
      return [{ label: company.name }, { label: 'Timeline' }];
    }

    if (topView === 'D') {
      return [{ label: company.name }, { label: 'Workers' }];
    }

    if (topView === 'E') {
      return [{ label: company.name }, { label: 'Settings' }];
    }

    return [{ label: company.name }];
  };

  // Show login page when no user is logged in
  if (!userName) {
    return <LoginPage />;
  }

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

      {/* View A: Dependency Graph (goal-map sub-view).
          Parent picker now lives in the top bar via ParentDropdown — the old
          horizontal pill bar above the map is gone. */}
      {topView === 'A' && subViewA === 'goal-map' && (
        <div key="goal-map" className="view-enter" style={{ width: '100%', height: '100%' }}>
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
