# Coordinator Guide -- Pipeline Tech Tree

This guide covers everything you need to know as a **Coordinator** in the Pipeline Tech Tree app. Coordinators have elevated permissions compared to Workers, with the ability to edit tasks, manage priorities, and oversee worker assignments.

For features shared with the Worker role (notifications basics, task status colors, floating detail panels), see the [Worker Guide](./guide-worker.md).

---

## Table of Contents

- [Logging In](#logging-in)
- [Your Views](#your-views)
- [Goal Map (Your Landing Page)](#goal-map-your-landing-page)
  - [Parent Selector](#parent-selector)
  - [Goal Nodes](#goal-nodes)
  - [Navigating Goals](#navigating-goals)
  - [Edit Mode](#edit-mode)
  - [Creating a Goal](#creating-a-goal)
  - [Unplaced Tickets Panel](#unplaced-tickets-panel)
- [Tech Tree View](#tech-tree-view)
  - [Reading the Graph](#reading-the-graph)
  - [Edit Mode (Tech Tree)](#edit-mode-tech-tree)
  - [Presence Awareness](#presence-awareness)
- [Dashboard](#dashboard)
  - [Priority Controls](#priority-controls)
  - [Cross-View Matrix](#cross-view-matrix)
  - [Drill-Down Navigation](#drill-down-navigation)
- [Workers View](#workers-view)
- [Timeline](#timeline)
- [Notifications](#notifications)
- [Navigation Patterns](#navigation-patterns)

---

## Logging In

When you open the app, you will see a list of worker profiles. Find your name and click it to sign in. Your profile will display a **Coordinator** role badge. There is no password for regular login -- your role is already set in the system.

---

## Your Views

As a Coordinator, the top navigation bar gives you access to four views:

| Tab | View | Description |
|-----|------|-------------|
| **A** | **Tech Tree** | Your default landing page. Visual goal and task dependency graphs. |
| **B** | **Dashboard** | Company, project, and department overview with priority controls. |
| **C** | **Timeline** | Gantt chart of tasks with dependency arrows. |
| **D** | **Workers** | Worker list with assignments and workload details. |

You will **not** see the Settings tab (Admin only) or a dedicated My Tasks tab in the navigation. If you are also assigned work as a contributor, your tasks are still visible through the Workers view and floating task panels.

---

## Goal Map (Your Landing Page)

When you log in, the Tech Tree view opens to the **Goal Map** sub-view. This is a visual graph showing all goals for a selected department or project.

![Goal Map overview](./screenshots/coordinator-goal-map.png)

### Parent Selector

At the top of the Goal Map is the **ParentSelector pill bar**, which controls which set of goals you are viewing.

- **Left side** -- Department pills, shown in purple/violet.
- **Right side** -- Project pills, shown in blue. Each project pill includes a priority badge prefix (P1, P2, or P3).
- A vertical divider separates departments from projects.
- The **active** pill is filled in solid color. Inactive pills show as bordered outlines.
- Click any pill to switch to that department's or project's goals.

![Parent Selector bar](./screenshots/coordinator-parent-selector.png)

### Goal Nodes

Each goal appears as a card on the graph. A goal node displays:

- **Priority badge** -- e.g., P01, P02, showing the goal's priority ranking.
- **Task count** -- completed tasks out of total (e.g., 3/8).
- **Completion percentage** -- how far along the goal is.
- **Goal name** -- the title of the goal.
- **Status badge** -- one of: Active, Completed, Blocked, or Empty.
- **Owner name** -- who owns this goal.
- **Progress bar** -- visual fill representing completion.
- **Cross-reference badges** -- if the goal is associated with both a department and a project, you will see a cross-reference badge: a folder icon with the project name, or a building icon with the department name.

### Navigating Goals

- **Single-click** a goal node to select it (highlights it).
- **Double-click** a goal node to drill into its tech tree, where you can see individual tasks and dependencies.
- A hint at the bottom of the screen reminds you: "Click to select -- Double-click to open tech tree."
- A **mini-map** in the bottom-right corner helps you orient within large goal graphs. Drag the viewport rectangle to pan around.

### Edit Mode

The toolbar above the goal map includes an **Edit** button. Clicking it enters edit mode.

- Entering edit mode **acquires an edit lock** for you. This lock lasts up to 5 minutes and prevents other users from making conflicting edits at the same time.
- While in edit mode, you can:
  - **Rearrange goal positions** by dragging goal nodes.
  - **Create new goals** using the + Goal button.
- Other users who are viewing the same goal map will see a **presence indicator** showing that you are editing.
- The lock is **released** when you click the Edit button again to toggle off, or automatically after the 5-minute timeout.

![Edit mode toolbar](./screenshots/coordinator-edit-mode.png)

### Creating a Goal

Click the **+ Goal** button in the toolbar to open the goal creation form.

- **Goal name** -- give the goal a descriptive title.
- **Primary parent** -- choose the department or project this goal belongs to.
- **Secondary parent (optional)** -- add a cross-reference to another department or project. This is useful when a goal spans organizational boundaries.
- The system automatically fills in the owner and timestamps.

### Unplaced Tickets Panel

Click the **Unplaced (N)** button in the Goal Map toolbar to open the unplaced tickets panel. The number in the badge shows how many ShotGrid-synced tickets have not yet been assigned to any goal.

- Tickets are **grouped by ShotGrid project name**, with collapsible sections. Each section header shows the project name and ticket count.
- Use the **search filter** at the top of the panel to find specific tickets by name.
- Each ticket has a **"Place in Goal..."** dropdown. The dropdown lists available goals, grouped by Department and Project, so you can quickly assign the ticket to the right goal.
- The badge count in the toolbar **updates immediately** as you place tickets.

![Unplaced tickets panel](./screenshots/coordinator-unplaced-panel.png)

---

## Tech Tree View

After double-clicking a goal in the Goal Map, you enter the **Tech Tree** for that goal. This shows the full dependency graph of tasks and milestones.

### Reading the Graph

- **Task nodes** are rectangular cards. Each shows:
  - Priority badge (color-coded).
  - Task name.
  - Status indicated by color coding (see the [Worker Guide](./guide-worker.md) for the full status color reference).
  - Assigned worker count.
- **Milestone nodes** are diamond-shaped markers representing key checkpoints.
- **Arrows** between nodes represent dependencies -- a task must be completed before its downstream tasks unlock.
- Archived tasks appear faded (reduced opacity) with a folder badge, but remain visible so you can see the full dependency chain.

![Tech Tree view](./screenshots/coordinator-tech-tree.png)

### Edit Mode (Tech Tree)

Just like in the Goal Map, click the **Edit** button to enter edit mode within a tech tree. This acquires an edit lock scoped to this goal.

In edit mode, you can:

- **Add dependency connections** -- draw arrows between tasks to define execution order.
- **Remove dependency connections** -- delete arrows that are no longer needed.
- **Delete tasks** from the goal.
- **Create milestones** to mark key checkpoints.
- **Drag-reposition nodes** to organize the visual layout.
- **Reset auto-layout** to let the system re-arrange nodes using the automatic layout algorithm.

The **UnplacedTasksPanel** sidebar shows tasks that belong to this goal's project but have not been placed into this specific goal's tree. You can drag them in from here.

### Presence Awareness

When someone else is viewing or editing the same goal's tech tree, you will see their presence indicator. This helps avoid conflicts and keeps the team aware of who is working where.

---

## Dashboard

The Dashboard provides a high-level overview of your organization, starting from the company level and drilling down into projects and departments.

![Dashboard view](./screenshots/coordinator-dashboard.png)

### Priority Controls

As a Coordinator, you have access to priority controls that Workers do not see:

- On each **project card** and **department card**, you will see **P1 / P2 / P3 buttons**.
- Click a priority button to change the strategic priority of that project or department.
  - **P1** -- highest priority.
  - **P2** -- medium priority.
  - **P3** -- lower priority.
- Changing a priority here cascades through the priority calculation system, automatically re-scoring all tasks that fall under that project or department.

### Cross-View Matrix

The Dashboard includes a **Cross-View Matrix** showing the intersection of Departments and Projects:

- Rows represent departments; columns represent projects (or vice versa).
- Each cell displays:
  - Task counts for that department-project intersection.
  - Progress percentage.
  - Goal pills linking to relevant goals.
- This matrix gives you a quick overview of where work is concentrated and how different teams contribute to different projects.

### Drill-Down Navigation

- Click any project or department card to drill into its detail view with more granular stats.
- From a detail view, you can navigate further into the Tech Tree for specific goals. When you do, a **breadcrumb trail** appears so you can retrace your steps (see [Navigation Patterns](#navigation-patterns) below).

---

## Workers View

The Workers view lets you see your team's workload and assignments.

![Workers view](./screenshots/coordinator-workers.png)

- **Left sidebar** -- lists all workers, grouped by department. Use the department dropdown at the top to filter the list.
- **Right panel** -- shows the selected worker's details:
  - Currently active tasks.
  - Full list of assigned tasks.
  - Availability status (full, partial, or unavailable).
- **Click a task** in the worker's assignment list to open the **floating task detail panel**. From there, you can view full task information or jump to its tech tree context.

---

## Timeline

The Timeline view displays a Gantt chart of tasks with dependency arrows connecting them.

- **Group by** Goal or Department to organize how tasks are displayed.
- **Filter by** Project or Department to narrow the view.
- Dependency arrows show the order in which tasks must be completed.
- A **today marker** line helps you see where the current date falls relative to scheduled work.
- Click any task bar to open the floating detail panel.

For more on reading the Timeline, see the [Worker Guide](./guide-worker.md).

---

## Notifications

You receive all the same notification types as Workers, plus additional ones related to edit locks:

| Notification | When It Fires |
|-------------|---------------|
| Task assigned | You or someone is assigned to a task. |
| Task status changed | A task transitions between statuses. |
| Task completed | A task is marked as completed. |
| Dependency completed | An upstream task completes, unlocking the next task. |
| Milestone unlocked | A milestone becomes unlocked. |
| Priority overridden | A manual priority override is set on a task. |
| Priority override lifted | A manual override is removed. |
| Calibration changed | Priority weight calibration is updated. |
| **Lock acquired** | Someone acquires an edit lock on a goal map or tech tree. |
| **Lock released** | An edit lock is released. |

The **bell icon** in the top-right corner of the header shows your unread notification count. Click it to open the Notification Center, where you can:

- Read individual notifications.
- Mark individual notifications as read.
- Mark all as read.
- Clear all notifications.

For more on how notifications work, see the [Worker Guide](./guide-worker.md).

---

## Navigation Patterns

The app provides several ways to move between views smoothly:

- **EntrySource breadcrumb** -- when you navigate from the Dashboard into a Tech Tree (e.g., by clicking a goal from a project detail view), a "Back" breadcrumb appears at the top. Click it to return to exactly where you came from.
- **Cross-view task selection** -- click any task in the Workers view or Timeline to open the floating task detail panel. The panel includes a **"Go to Tech Tree"** button that jumps you directly to that task's position in its goal's dependency graph, with the task highlighted.
- **Goal Map to Tech Tree** -- double-click a goal node in the Goal Map to drill into its tech tree. Use the breadcrumb or back navigation to return to the Goal Map.

---

*For features shared with the Worker role, including task status meanings and the floating detail panel, refer to the [Worker Guide](./guide-worker.md).*
