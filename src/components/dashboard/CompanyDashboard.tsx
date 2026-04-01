import React, { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { ProgressBar } from '../shared/ProgressBar';
import type { Project, Department, Worker, StrategicPriority } from '../../types';
import { usePermission } from '../../hooks/usePermission';

interface CompanyDashboardProps {
  onSelectProject: (projectId: string) => void;
  onSelectDepartment: (deptId: string) => void;
}

export const CompanyDashboard: React.FC<CompanyDashboardProps> = ({
  onSelectProject,
  onSelectDepartment,
}) => {
  const company = useStore((s) => s.company);
  const projects = useStore((s) => s.projects);
  const departments = useStore((s) => s.departments);
  const goals = useStore((s) => s.goals);
  const tasks = useStore((s) => s.tasks);
  const milestones = useStore((s) => s.milestones);
  const workers = useStore((s) => s.workers);
  const updateProject = useStore((s) => s.updateProject);
  const updateDepartment = useStore((s) => s.updateDepartment);
  const { canEditPriorities } = usePermission();

  // Hover state for cards
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Compute project stats
  const projectStats = useMemo(() => {
    const stats = new Map<
      string,
      {
        project: Project;
        totalTasks: number;
        completedTasks: number;
        blockedTasks: number;
        pausedTasks: number;
        activeWorkerIds: Set<string>;
        totalMilestones: number;
        unlockedMilestones: number;
      }
    >();

    for (const [projectId, project] of projects) {
      let totalTasks = 0;
      let completedTasks = 0;
      let blockedTasks = 0;
      let pausedTasks = 0;
      const activeWorkerIds = new Set<string>();
      let totalMilestones = 0;
      let unlockedMilestones = 0;

      for (const goalId of project.goalIds) {
        const goal = goals.get(goalId);
        if (!goal) continue;

        for (const taskId of goal.taskIds) {
          const task = tasks.get(taskId);
          if (!task) continue;
          totalTasks++;
          if (task.status === 'completed') completedTasks++;
          if (task.status === 'blocked') blockedTasks++;
          if (task.status === 'paused') pausedTasks++;
          for (const wId of task.assignedWorkerIds) {
            const worker = workers.get(wId);
            if (worker && worker.activeTaskIds?.length > 0) {
              activeWorkerIds.add(wId);
            }
          }
        }

        for (const msId of goal.milestoneIds) {
          const ms = milestones.get(msId);
          if (!ms) continue;
          totalMilestones++;
          if (ms.unlocked) unlockedMilestones++;
        }
      }

      // Also count project-level milestones
      for (const msId of project.milestoneIds) {
        const ms = milestones.get(msId);
        if (!ms) continue;
        // Avoid double counting if milestone is also in a goal
        if (!project.goalIds.some((gId) => goals.get(gId)?.milestoneIds.includes(msId))) {
          totalMilestones++;
          if (ms.unlocked) unlockedMilestones++;
        }
      }

      stats.set(projectId, {
        project,
        totalTasks,
        completedTasks,
        blockedTasks,
        pausedTasks,
        activeWorkerIds,
        totalMilestones,
        unlockedMilestones,
      });
    }

    return stats;
  }, [projects, goals, tasks, milestones, workers]);

  // P1 critical summary
  const p1Summary = useMemo(() => {
    let blocked = 0;
    let atRisk = 0;
    let onTrack = 0;

    for (const [, stat] of projectStats) {
      if (stat.project.strategicPriority !== 'P1') continue;
      blocked += stat.blockedTasks;
      atRisk += stat.pausedTasks;
      onTrack += stat.totalTasks - stat.blockedTasks - stat.pausedTasks;
    }

    return { blocked, atRisk, onTrack };
  }, [projectStats]);

  // Department stats
  const departmentStats = useMemo(() => {
    const stats = new Map<
      string,
      {
        department: Department;
        totalWorkers: number;
        activeWorkers: number;
        goalCount: number;
        totalMilestones: number;
        unlockedMilestones: number;
      }
    >();

    for (const [deptId, dept] of departments) {
      let activeWorkers = 0;
      const deptWorkers: Worker[] = [];

      for (const wId of dept.workerIds) {
        const worker = workers.get(wId);
        if (!worker) continue;
        deptWorkers.push(worker);
        if (worker.activeTaskIds?.length > 0) activeWorkers++;
      }

      let totalMilestones = 0;
      let unlockedMilestones = 0;

      for (const goalId of dept.goalIds) {
        const goal = goals.get(goalId);
        if (!goal) continue;
        for (const msId of goal.milestoneIds) {
          const ms = milestones.get(msId);
          if (!ms) continue;
          totalMilestones++;
          if (ms.unlocked) unlockedMilestones++;
        }
      }

      stats.set(deptId, {
        department: dept,
        totalWorkers: deptWorkers.length,
        activeWorkers,
        goalCount: dept.goalIds.length,
        totalMilestones,
        unlockedMilestones,
      });
    }

    return stats;
  }, [departments, workers, goals, milestones]);

  // Sort projects: P1 first, then P2, etc.
  const sortedProjects = useMemo(() => {
    return Array.from(projectStats.values()).sort((a, b) => {
      const pa = a.project.strategicPriority;
      const pb = b.project.strategicPriority;
      if (pa !== pb) return pa.localeCompare(pb);
      return a.project.name.localeCompare(b.project.name);
    });
  }, [projectStats]);

  const sortedDepartments = useMemo(() => {
    return Array.from(departmentStats.values()).sort((a, b) =>
      a.department.name.localeCompare(b.department.name),
    );
  }, [departmentStats]);

  function formatDeadline(isoDate: string): string {
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <div style={scrollContainerStyle}>
      <div style={contentStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <h1 style={companyNameStyle}>{company.name}</h1>
          <div style={dateStyle}>{currentDate}</div>
        </div>

        {/* P1 Critical Items */}
        <div style={p1CardStyle}>
          <div style={sectionTitleStyle}>P1 CRITICAL ITEMS</div>
          <div style={p1GridStyle}>
            <div style={p1StatStyle}>
              <div style={{ ...p1ValueStyle, color: 'var(--color-blocked, #ef4444)' }}>
                {p1Summary.blocked}
              </div>
              <div style={p1LabelStyle}>Blocked</div>
            </div>
            <div style={p1DividerStyle} />
            <div style={p1StatStyle}>
              <div style={{ ...p1ValueStyle, color: 'var(--color-milestone)' }}>
                {p1Summary.atRisk}
              </div>
              <div style={p1LabelStyle}>At Risk</div>
            </div>
            <div style={p1DividerStyle} />
            <div style={p1StatStyle}>
              <div style={{ ...p1ValueStyle, color: 'var(--color-done)' }}>
                {p1Summary.onTrack}
              </div>
              <div style={p1LabelStyle}>On Track</div>
            </div>
          </div>
        </div>

        {/* Projects Section */}
        <div style={{ marginTop: 32 }}>
          <div style={sectionTitleStyle}>PROJECTS</div>
          <div style={projectGridStyle}>
            {sortedProjects.map(
              ({
                project,
                totalTasks,
                completedTasks,
                activeWorkerIds,
                totalMilestones,
                unlockedMilestones,
              }) => {
                const progress =
                  totalTasks > 0
                    ? Math.round((completedTasks / totalTasks) * 100)
                    : 0;
                const isHovered = hoveredCard === `proj-${project.id}`;

                return (
                  <div
                    key={project.id}
                    style={{
                      ...cardStyle,
                      borderColor: isHovered
                        ? 'var(--color-text-muted)'
                        : 'var(--color-border)',
                    }}
                    onClick={() => onSelectProject(project.id)}
                    onMouseEnter={() => setHoveredCard(`proj-${project.id}`)}
                    onMouseLeave={() => setHoveredCard(null)}
                  >
                    <div style={cardHeaderStyle}>
                      <div style={cardTitleStyle}>{project.name}</div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {canEditPriorities ? (['P1', 'P2', 'P3'] as StrategicPriority[]).map((p) => (
                          <button
                            key={p}
                            onClick={(e) => { e.stopPropagation(); updateProject(project.id, { strategicPriority: p }); }}
                            style={{
                              fontSize: 10, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                              border: project.strategicPriority === p ? '1px solid #ef4444' : '1px solid var(--color-border)',
                              backgroundColor: project.strategicPriority === p ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                              color: project.strategicPriority === p ? '#ef4444' : 'var(--color-text-muted)',
                              fontWeight: project.strategicPriority === p ? 700 : 400,
                            }}
                          >
                            {p}
                          </button>
                        )) : (
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, border: '1px solid #ef4444', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 700 }}>
                            {project.strategicPriority}
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <ProgressBar
                        value={progress}
                        size="sm"
                        showLabel
                      />
                    </div>

                    <div style={cardMetaGridStyle}>
                      <div style={cardMetaItemStyle}>
                        <span style={metaLabelStyle}>Deadline</span>
                        <span style={metaValueStyle}>
                          {formatDeadline(project.deadline)}
                        </span>
                      </div>
                      <div style={cardMetaItemStyle}>
                        <span style={metaLabelStyle}>Active Workers</span>
                        <span style={metaValueStyle}>
                          {activeWorkerIds.size}
                        </span>
                      </div>
                      <div style={cardMetaItemStyle}>
                        <span style={metaLabelStyle}>Milestones</span>
                        <span style={metaValueStyle}>
                          {unlockedMilestones}/{totalMilestones}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </div>

        {/* Departments Section */}
        <div style={{ marginTop: 32 }}>
          <div style={sectionTitleStyle}>DEPARTMENTS</div>
          <div style={deptGridStyle}>
            {sortedDepartments.map(
              ({
                department,
                totalWorkers,
                activeWorkers,
                goalCount,
                totalMilestones,
                unlockedMilestones,
              }) => {
                const utilization =
                  totalWorkers > 0
                    ? Math.round((activeWorkers / totalWorkers) * 100)
                    : 0;
                const isHovered = hoveredCard === `dept-${department.id}`;

                return (
                  <div
                    key={department.id}
                    style={{
                      ...cardStyle,
                      borderColor: isHovered
                        ? 'var(--color-text-muted)'
                        : 'var(--color-border)',
                    }}
                    onClick={() => onSelectDepartment(department.id)}
                    onMouseEnter={() =>
                      setHoveredCard(`dept-${department.id}`)
                    }
                    onMouseLeave={() => setHoveredCard(null)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={cardTitleStyle}>{department.name}</div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {canEditPriorities ? (['P1', 'P2', 'P3'] as StrategicPriority[]).map((p) => (
                          <button
                            key={p}
                            onClick={(e) => { e.stopPropagation(); updateDepartment(department.id, { priority: p }); }}
                            style={{
                              fontSize: 10, padding: '2px 7px', borderRadius: 4, cursor: 'pointer',
                              border: department.priority === p ? '1px solid #f59e0b' : '1px solid var(--color-border)',
                              backgroundColor: department.priority === p ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                              color: department.priority === p ? '#f59e0b' : 'var(--color-text-muted)',
                              fontWeight: department.priority === p ? 700 : 400,
                            }}
                          >
                            {p}
                          </button>
                        )) : (
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, border: '1px solid #f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontWeight: 700 }}>
                            {department.priority}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={deptHeadStyle}>{department.headName}</div>

                    <div style={{ marginTop: 10 }}>
                      <div style={utilizationLabelStyle}>
                        Utilization {activeWorkers}/{totalWorkers}
                      </div>
                      <ProgressBar
                        value={utilization}
                        size="sm"
                        showLabel
                      />
                    </div>

                    <div style={cardMetaGridStyle}>
                      <div style={cardMetaItemStyle}>
                        <span style={metaLabelStyle}>Goals</span>
                        <span style={metaValueStyle}>{goalCount}</span>
                      </div>
                      <div style={cardMetaItemStyle}>
                        <span style={metaLabelStyle}>Milestones</span>
                        <span style={metaValueStyle}>
                          {unlockedMilestones}/{totalMilestones}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyDashboard;

// === Styles ===

const scrollContainerStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  overflowY: 'auto',
  backgroundColor: 'var(--color-bg-primary)',
  color: 'var(--color-text-primary)',
};

const contentStyle: React.CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto',
  padding: '32px 24px 48px',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 24,
};

const companyNameStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  margin: 0,
  color: 'var(--color-text-primary)',
};

const dateStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--color-text-muted)',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 12,
};

const p1CardStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  padding: 20,
};

const p1GridStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 32,
  marginTop: 12,
};

const p1StatStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
};

const p1ValueStyle: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 700,
  lineHeight: 1,
};

const p1LabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-text-secondary)',
  fontWeight: 500,
};

const p1DividerStyle: React.CSSProperties = {
  width: 1,
  height: 40,
  backgroundColor: 'var(--color-border)',
};

const projectGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: 16,
};

const deptGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 16,
};

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  padding: 20,
  cursor: 'pointer',
  transition: 'border-color 0.15s ease',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const deptHeadStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-text-secondary)',
  marginTop: 2,
};

const utilizationLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--color-text-muted)',
  marginBottom: 4,
};

const cardMetaGridStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  marginTop: 14,
  flexWrap: 'wrap',
};

const cardMetaItemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const metaLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 500,
};

const metaValueStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
};
