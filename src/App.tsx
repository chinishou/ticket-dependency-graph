import { useState, useCallback, useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { GoalSelector } from './components/layout/GoalSelector';
import { ViewSwitcher } from './components/layout/ViewSwitcher';
import { TechTreeView } from './components/tech-tree/TechTreeView';
import { GoalMapView } from './components/tech-tree/GoalMapView';
import { CompanyDashboard } from './components/dashboard/CompanyDashboard';
import { ProjectDashboard } from './components/dashboard/ProjectDashboard';
import { DeptDashboard } from './components/dashboard/DeptDashboard';
import { TimelineView } from './components/timeline/TimelineView';
import { WorkerView } from './components/worker/WorkerView';
import { useStore } from './store/useStore';

// View A = Tech Tree (goal-map or tech-tree sub-views)
// View B = Dashboard (company, project, or department)
// View C = Timeline (future)
type TopView = 'A' | 'B' | 'C' | 'D';
type SubViewA = 'goal-map' | 'tech-tree';
type SubViewB = 'company' | 'project' | 'department';

function App() {
  const fetchState = useStore((s) => s.fetchState);
  const pollForUpdates = useStore((s) => s.pollForUpdates);
  const isConnected = useStore((s) => s.isConnected);

  // Fetch state from server on mount
  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Poll for updates every 5 seconds when connected
  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(pollForUpdates, 5000);
    return () => clearInterval(interval);
  }, [isConnected, pollForUpdates]);

  const company = useStore((s) => s.company);
  const goalsMap = useStore((s) => s.goals);
  const departmentsMap = useStore((s) => s.departments);
  const projectsMap = useStore((s) => s.projects);
  const setSelectedTask = useStore((s) => s.setSelectedTask);
  const setSelectedMilestone = useStore((s) => s.setSelectedMilestone);

  const [topView, setTopView] = useState<TopView>('A');
  const [subViewA, setSubViewA] = useState<SubViewA>('tech-tree');
  const [subViewB, setSubViewB] = useState<SubViewB>('company');
  const [selectedGoalId, setSelectedGoalId] = useState('goal-usd-pipeline');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');

  const goal = goalsMap.get(selectedGoalId);
  const parent = goal
    ? goal.parentType === 'department'
      ? departmentsMap.get(goal.parentId)
      : projectsMap.get(goal.parentId)
    : null;

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
  }, [clearSelection]);

  const handleGoToGoalMap = useCallback(() => {
    clearSelection();
    setSubViewA('goal-map');
  }, [clearSelection]);

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

  const handleDashboardGoalSelect = useCallback((goalId: string) => {
    clearSelection();
    setSelectedGoalId(goalId);
    setSubViewA('tech-tree');
    setTopView('A');
  }, [clearSelection]);

  // --- View switching ---
  const handleViewSwitch = useCallback((view: 'A' | 'B' | 'C' | 'D') => {
    setTopView(view);
  }, []);

  // --- Breadcrumbs ---
  const buildBreadcrumbs = () => {
    if (topView === 'A') {
      if (subViewA === 'goal-map') {
        return [
          { label: company.name },
          ...(parent ? [{ label: parent.name }] : []),
          { label: 'Goals' },
        ];
      }
      return [
        { label: company.name, href: '#', onClick: handleGoToGoalMap },
        ...(parent ? [{ label: parent.name, href: '#', onClick: handleGoToGoalMap }] : []),
        ...(goal ? [{ label: goal.name }] : []),
      ];
    }

    if (topView === 'B') {
      if (subViewB === 'company') {
        return [{ label: company.name }, { label: 'Dashboard' }];
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

    return [{ label: company.name }];
  };

  return (
    <AppShell
      breadcrumbs={buildBreadcrumbs()}
      rightContent={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
          {topView === 'A' && subViewA === 'tech-tree' && (
            <GoalSelector
              selectedGoalId={selectedGoalId}
              onSelectGoal={handleGoalChange}
            />
          )}
          <ViewSwitcher activeView={topView} onSwitch={handleViewSwitch} />
        </div>
      }
    >
      {/* View A: Tech Tree */}
      {topView === 'A' && subViewA === 'goal-map' && goal && parent && (
        <GoalMapView
          parentType={goal.parentType}
          parentId={goal.parentId}
          onSelectGoal={handleGoalMapSelect}
        />
      )}
      {topView === 'A' && subViewA === 'tech-tree' && (
        <TechTreeView goalId={selectedGoalId} />
      )}

      {/* View B: Dashboard */}
      {topView === 'B' && subViewB === 'company' && (
        <CompanyDashboard
          onSelectProject={handleSelectProject}
          onSelectDepartment={handleSelectDepartment}
        />
      )}
      {topView === 'B' && subViewB === 'project' && selectedProjectId && (
        <ProjectDashboard
          projectId={selectedProjectId}
          onSelectGoal={handleDashboardGoalSelect}
          onBack={handleBackToCompany}
        />
      )}
      {topView === 'B' && subViewB === 'department' && selectedDeptId && (
        <DeptDashboard
          departmentId={selectedDeptId}
          onSelectGoal={handleDashboardGoalSelect}
          onBack={handleBackToCompany}
        />
      )}

      {/* View C: Timeline */}
      {topView === 'C' && (
        <TimelineView onSelectGoal={handleGoalChange} />
      )}

      {/* View D: Workers */}
      {topView === 'D' && (
        <WorkerView onSelectGoal={handleGoalChange} />
      )}
    </AppShell>
  );
}

export default App;
