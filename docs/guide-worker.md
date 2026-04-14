# Worker User Guide

This guide covers everything you need to know as a **Worker** in the Pipeline Tech Tree app -- your go-to tool for managing pipeline tasks, tracking dependencies, and staying on top of priorities across projects.

---

## Table of Contents

- [Getting Started](#getting-started)
  - [Logging In](#logging-in)
  - [Your Profile and Menu](#your-profile-and-menu)
- [My Tasks](#my-tasks)
  - [Active Tasks](#active-tasks)
  - [Up Next](#up-next)
  - [Unlocks](#unlocks)
  - [Full Queue](#full-queue)
  - [Filtering](#filtering)
- [Tech Tree](#tech-tree)
  - [Goal Map](#goal-map)
  - [Task Dependency Graph](#task-dependency-graph)
- [Dashboard](#dashboard)
  - [Company Overview](#company-overview)
  - [Project Cards](#project-cards)
  - [Department Cards](#department-cards)
  - [Cross-View Matrix](#cross-view-matrix)
- [Timeline](#timeline)
- [Task Details](#task-details)
- [Notifications](#notifications)
- [Task Status Workflow](#task-status-workflow)
- [Tips and FAQ](#tips-and-faq)

---

## Getting Started

### Logging In

When you open the app, you will see a login screen showing worker profiles. Find your name in the list and click it to sign in. You can use the role filter at the top to show only Worker profiles if the list is long.

### Your Profile and Menu

Once signed in, look at the **top-right corner** of the screen. You will see your name alongside a "Worker" role badge.

Clicking your name opens a small menu with these options:

- **Upgrade to Admin** -- If you have the admin password, you can temporarily elevate your permissions for the current session. This resets when you sign out.
- **Sign Out** -- Logs you out and returns to the login screen.

![User menu](./screenshots/worker-user-menu.png)

---

## My Tasks

**My Tasks** is your home screen -- the first thing you see after logging in. It gives you a single, organized view of everything on your plate.

![My Tasks view](./screenshots/worker-my-tasks.png)

At the top of the page you will see your **profile header** showing your avatar, name, department, and availability badge (e.g., "full").

### Active Tasks

The **Active Tasks** section shows the tasks you are currently working on. Each task card displays:

- **Priority score badge** (e.g., P72) -- higher means more urgent
- **Task name**
- **Project and department** context
- **Status indicator**
- **Estimated duration**

You have two action buttons on each active task:

- **Pause** -- Temporarily shelves the task. It moves back into your queue and can be resumed later.
- **Complete** -- Marks the task as finished. This may unlock downstream tasks for you or other team members.

![Active task card](./screenshots/worker-active-task.png)

### Up Next

The **Up Next** section shows your top 5 highest-priority queued tasks that are ready to be started. The system automatically sorts these by priority score so the most important work floats to the top.

Each task has a **Start** button. Clicking it moves the task into your Active Tasks section and sets its status to "in progress."

### Unlocks

The **Unlocks** section shows you what becomes available when you finish your current active tasks. This helps you understand the downstream impact of your work -- completing a task might unblock work for you or for teammates.

### Full Queue

Below the main sections, you can expand the **Full Queue** to see every task assigned to you, sorted by priority. This is useful for getting a big-picture view of your total workload.

### Filtering

At the top of the My Tasks view, two dropdown filters let you narrow down what you see:

- **Project** -- Show only tasks from a specific project
- **Department** -- Show only tasks from a specific department

These filters apply to all sections on the page.

---

## Tech Tree

The **Tech Tree** view gives you a visual map of how tasks relate to each other through dependencies. As a Worker, this view is **read-only** -- you can browse and inspect but not make changes.

![Tech Tree view](./screenshots/worker-tech-tree.png)

### Goal Map

When you first open the Tech Tree, you see the **Goal Map** -- an overview of all goals organized by department or project. Use the **pill bar** at the top to switch between grouping goals by Department or by Project.

Each goal appears as a node on the map. Double-click a goal to drill into its task dependency graph.

![Goal Map](./screenshots/worker-goal-map.png)

### Task Dependency Graph

Inside a specific goal, you see a **top-down dependency graph** where:

- Tasks are shown as rectangular nodes
- Milestones are shown as distinct marker nodes
- Arrows between nodes indicate dependencies (a task must be completed before the tasks it points to can begin)

Use the **goal selector dropdown** at the top (grouped by Department or Project) to switch between different goals without going back to the Goal Map.

Clicking any task node opens the [Task Details](#task-details) panel on the right side of the screen.

---

## Dashboard

The **Dashboard** gives you a high-level overview of what is happening across the company, all projects, and all departments.

![Dashboard view](./screenshots/worker-dashboard.png)

### Company Overview

At the top of the Dashboard, a **P1 Critical Items** summary shows counts for:

- **Blocked** -- High-priority items that are stuck
- **At Risk** -- Items that may miss their targets
- **On Track** -- Items proceeding as planned

### Project Cards

Each project has a card showing:

- Project name
- Priority badge (P1, P2, or P3)
- Progress bar
- Deadline
- Number of active workers
- Milestone status

### Department Cards

Each department has a card showing:

- Department name
- Priority badge
- Team utilization percentage
- Number of goals
- Worker statistics

### Cross-View Matrix

Click the **Cross-View Matrix** button to see a grid showing how departments contribute to different projects. This is a handy way to understand where resources are allocated.

> **Note:** As a Worker, you can see all Dashboard information but you cannot change project or department priority levels. The P1/P2/P3 buttons on cards are only available to Coordinators and Admins.

---

## Timeline

The **Timeline** view presents your tasks and goals as a **Gantt-style chart** laid out along a horizontal time axis.

![Timeline view](./screenshots/worker-timeline.png)

Key features:

- **Month axis** across the top for time reference
- **"Today" marker** -- a vertical line showing the current date
- **Task bars** sized to their estimated duration
- **Dependency arrows** connecting related tasks
- **Group by** toggle to organize rows by Goal or by Department
- **Filter dropdowns** for Project and Department

Click any task bar to open the [Task Details](#task-details) panel.

---

## Task Details

Whenever you click a task from any view (My Tasks, Tech Tree, Timeline), a **floating detail panel** slides in from the right side of the screen.

![Task detail panel](./screenshots/worker-task-detail.png)

The panel shows:

- **Task name** and **description**
- **Status** (locked, available, in progress, paused, completed, blocked)
- **Goal** the task belongs to
- **Department** and **Project**
- **Priority score** with breakdown
- **Assigned workers**
- **Estimated duration / ETA**

At the bottom of the panel, a **"Go to Tech Tree"** button jumps you directly to that task's position in the Tech Tree dependency graph. This is a quick way to see a task in context -- what it depends on and what it unlocks.

---

## Notifications

A **bell icon** in the header bar keeps you informed about important events. A badge on the bell shows how many unread notifications you have.

![Notification center](./screenshots/worker-notifications.png)

Click the bell to open the **Notification Center** dropdown. You will see notifications for:

| Notification | When it appears |
|---|---|
| **Task Assigned** | A task has been assigned to you |
| **Task Status Changed** | One of your tasks has changed status |
| **Dependency Completed** | An upstream task finished, unlocking something for you |
| **Milestone Unlocked** | A milestone has been reached |

In the notification dropdown you can:

- Click a notification to view details
- **Mark as read** on individual notifications
- **Mark all as read** to clear the unread count
- **Clear all** to remove old notifications

---

## Task Status Workflow

Tasks follow a specific lifecycle. Here is what each status means and what actions you can take:

```
locked --> available --> in_progress --> completed
                            |
                            +--> paused
                            +--> blocked
```

| Status | Meaning | Your actions |
|---|---|---|
| **Locked** | Waiting on dependencies to finish | None -- this unlocks automatically |
| **Available** | Ready to be picked up | Click **Start** to begin work |
| **In Progress** | Actively being worked on | Click **Pause** or **Complete** |
| **Paused** | Temporarily on hold | Click **Start** to resume |
| **Completed** | Finished | None -- downstream tasks may unlock |
| **Blocked** | Stuck on an external issue | Contact your Coordinator |

When you complete a task, the system automatically checks if any downstream tasks become available. Those tasks (and their assigned workers) receive notifications.

---

## Tips and FAQ

**How is my task priority score calculated?**
The priority score (P1-P100) is computed automatically based on several factors: project priority, department priority, goal priority, who created the task, and where the task sits in the dependency graph. Higher scores mean higher urgency. You do not need to set this yourself.

**Why can I not see the Workers or Settings tabs?**
These views are restricted to Coordinators and Admins. If you need information from those views, ask your Coordinator or team lead.

**Can I reassign a task or change its details?**
No. Workers can only change the status of their own tasks (Start, Pause, Complete). For any other changes, reach out to a Coordinator or Admin.

**What does it mean when a task is "locked"?**
A locked task is waiting for one or more upstream tasks to be completed first. You will see these in the Tech Tree with their dependency arrows. Once all upstream dependencies are finished, the task automatically becomes "available" and you can start it.

**I finished a task but nothing new appeared in my queue. Why?**
The tasks you unlock may be assigned to other workers, or there may be additional dependencies that are not yet complete. Check the Unlocks section in My Tasks or look at the Tech Tree to see the full picture.

**How do I get Admin access temporarily?**
Click your name in the top-right corner and select "Upgrade to Admin." You will need the admin password from your team lead. Admin access lasts only for your current session and resets when you sign out.

**What if a task is blocked and I cannot make progress?**
If a task is blocked by something outside your control, let your Coordinator know. They can update the task status and work on resolving the blocker.
