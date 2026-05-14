# Admin User Guide

This guide covers features exclusive to the **Admin** role in the Pipeline Tech Tree app. Admins have full access to every view and capability, including the Settings panel where priority weights, lead assignments, user roles, and ShotGrid sync are managed.

For shared features (Tech Tree editing, Dashboard drill-down, Timeline, Workers view, notifications, and task management), see the [Coordinator Guide](./guide-coordinator.md). Everything a Coordinator can do, an Admin can also do.

---

## Table of Contents

- [Becoming an Admin](#becoming-an-admin)
- [Admin Navigation Tabs](#admin-navigation-tabs)
- [Dashboard -- Admin Features](#dashboard----admin-features)
- [Settings View](#settings-view)
  - [Priority Weights](#priority-weights)
    - [Manual Mode](#manual-mode)
    - [Calibration Wizard](#calibration-wizard)
  - [Formula Preview](#formula-preview)
  - [Lead List](#lead-list)
  - [Role Management](#role-management)
  - [SG Status Mapping (Outbound)](#sg-status-mapping-outbound)
  - [SG Import (ShotGrid Sync)](#sg-import-shotgrid-sync)
    - [Connection Status](#connection-status)
    - [Importing Entities](#importing-entities)
    - [Restricting Imports to Specific SG Projects](#restricting-imports-to-specific-sg-projects)
    - [Re-importing a Single Ticket](#re-importing-a-single-ticket)
    - [Clearing SG Data](#clearing-sg-data)
- [Important Notes](#important-notes)

---

## Becoming an Admin

Admin access is **session-only** -- it is not a permanent role stored in the database. Any Worker or Coordinator can upgrade to Admin during their current session by entering the admin password.

**Steps to upgrade:**

1. Log in by selecting your Worker or Coordinator profile on the login screen.
2. In the top-right corner of the header, click your **name and role badge** to open the user menu dropdown.
3. Click **"Upgrade to Admin"** in the dropdown.
4. A password field labeled **"Enter admin password:"** appears. Type the admin password and click **"Go"** (or press Enter).
5. If the password is correct, your role badge immediately changes from "Worker" or "Coordinator" to **"Admin"** (shown in red), and the **[E] Settings** tab appears in the navigation bar.
6. If the password is wrong, an "Invalid password" message appears -- try again.

![Upgrading to Admin](./screenshots/admin-upgrade.png)

**Admin session ends when you:**

- Sign out (via the user menu dropdown)
- Reload or close the browser tab

After either of these, you return to your base role (Worker or Coordinator) and must re-enter the password to regain Admin access.

---

## Admin Navigation Tabs

When logged in as Admin, the navigation bar shows five tabs:

| Tab | View | Description |
|-----|------|-------------|
| **[A]** | Tech Tree | Dependency graph for goals and tasks |
| **[B]** | Dashboard | Company/project/department overview (Admin landing page) |
| **[C]** | Timeline | Gantt-style schedule with dependency-based dates |
| **[D]** | Workers | Worker list, workload, and task assignments |
| **[E]** | Settings | Priority configuration, roles, SG sync (Admin-exclusive) |

The **Dashboard [B]** is the default landing page when you upgrade to or log in as Admin.

> Note: The **My Tasks [F]** view is not shown in the Admin navigation bar. If you need to see your own task queue, switch to the Workers view [D] and find your name.

---

## Dashboard -- Admin Features

The Dashboard works the same way as it does for Coordinators, with one key addition: **interactive priority buttons** on entity cards.

- **Project cards** display P1 / P2 / P3 buttons. Click a button to immediately change that project's strategic priority level. The active priority is highlighted.
- **Department cards** also display P1 / P2 / P3 buttons that work the same way.

Priority changes take effect immediately and are reflected across all views, including the computed priority scores for every task under that project or department.

See the [Coordinator Guide](./guide-coordinator.md) for details on Dashboard drill-down navigation and the Cross-View Matrix.

---

## Settings View

The Settings view is only accessible to Admins. It is organized into five sections, stacked vertically on a single scrollable page.

![Settings overview](./screenshots/admin-settings-overview.png)

---

### Priority Weights

The priority system computes a score (0--100) for every task based on five weighted factors. This section lets you control how much each factor contributes to the final score.

#### Manual Mode

In Manual mode, you adjust five colored sliders directly. The sliders are linked so they always sum to 100%.

| Slider | Color | Default | What it measures |
|--------|-------|---------|------------------|
| Project Priority | Red | 30% | The project's strategic priority (P1/P2/P3) |
| Department Priority | Orange | 10% | The department's priority level (P1/P2/P3) |
| Goal Priority | Green | 20% | The goal's priority within its department (1/2/3) |
| Creator Priority | Purple | 10% | Whether the task creator is a Lead |
| Graph Factor | Blue | 30% | How many tasks depend on this one and critical path position |

**How to use the sliders:**

1. Drag any slider left or right to change its percentage.
2. The other sliders automatically adjust proportionally to keep the total at 100%.
3. The **Total** indicator at the bottom always reads 100%.
4. When you are satisfied, click **"Save Weights"** to apply. A green confirmation message appears: "Weights applied to all priority calculations."
5. If you want to undo all changes and go back to the factory defaults, click **"Reset to Defaults"** (this button only appears when weights differ from defaults).

![Priority weight sliders](./screenshots/admin-settings-weights.png)

#### Calibration Wizard

If you are not sure how to set the sliders, switch to the **Calibration Wizard** by clicking the "Calibration Wizard" toggle button next to the "Priority Weights" heading.

The wizard presents **8 scenario-based questions**. Each question describes two competing tickets and asks you which one should be prioritized. For example:

> *"A lead creates a P3 ticket vs a non-lead creates a P1 ticket -- which should be prioritized?"*

Pick the option that matches your team's priorities. A progress bar at the top shows how far through the wizard you are. You can click any completed step in the progress bar to go back and change an answer.

The final question (question 8) asks about critical path importance and offers three choices instead of two:

- **"Critical path always wins"** -- graph factor gets a very high weight
- **"Somewhere in between"** -- graph factor stays moderate
- **"Critical path is just a tiebreaker"** -- graph factor gets a low weight

After answering the last question, the wizard automatically derives optimal weights from your answers and switches back to Manual mode with the new values pre-filled. If your answers contain logical conflicts (e.g., you said both Project and Department should dominate), a red **"Conflicts detected"** warning appears listing the contradictions.

Review the derived weights, adjust if needed, then click **"Save Weights"** to apply.

---

### Formula Preview

Below the weight sliders, a **Formula Preview** box shows the exact calculation in monospace text. It updates live as you change the sliders:

```
ComputedScore =
  30% x ProjectFactor (P1=100, P2=67, P3=33)
  + 10% x DeptFactor (P1=100, P2=67, P3=33)
  + 20% x GoalFactor (1=100, 2=67, 3=33)
  + 10% x CreatorFactor (lead=100, other=50)
  + 30% x GraphFactor (0-100, deps + critical path)
```

Each factor line is color-coded to match its slider. Use this preview to verify your weight configuration makes sense before saving.

---

### Lead List

Leads get a higher creator factor in priority calculations (100 instead of 50 for non-leads). This section lets you designate which workers are leads.

- A **search box** at the top filters the worker list by name.
- Workers appear as **clickable name pills** below the search box.
  - **Filled / highlighted pill** (purple) = Lead
  - **Unfilled pill** (gray) = Not a lead
- Click any pill to toggle that worker's lead status. The change is saved immediately.

Leads are sorted to the top of the list for easy identification.

---

### Role Management

This section controls the permanent database role for each user. There are two assignable roles:

| Role | Capabilities |
|------|-------------|
| **Coordinator** | Can edit tasks, set priorities, manage goals, and access the Workers view |
| **Worker** | Can view tasks and update the status of their own assigned tasks |

Each user is listed with their name and two toggle buttons: **"worker"** and **"coordinator"**. The currently active role is highlighted. Click the other button to change their role. The change takes effect immediately.

> Note: Admin access is not listed here because it is session-only and granted via the password upgrade flow, not assigned as a permanent role.

If a user is currently logged in when you change their role, they will see the updated permissions the next time they sign in.

![Role management](./screenshots/admin-settings-roles.png)

---

### SG Status Mapping (Outbound)

When a task status changes in the tech tree, the app pushes the change back to the matching ShotGrid `sg_status_list` code. **This section lets you configure which SG status code corresponds to each tech-tree status**, with the code options pulled live from your SG site so they always match what your site accepts.

Each row shows one tech-tree status (Completed, In Progress, Available, Paused, Blocked, Locked) on the left and a dropdown of SG codes on the right. The dropdown is populated by querying your SG site for the statuses currently in use on any ticket.

**How to configure:**

1. The mapping loads automatically when you open the section. The dropdowns show the current saved mapping; built-in defaults (`res`, `ip`, `opn`, `hold`, `wtg`) are used if no mapping has been saved yet.
2. Click a dropdown to pick a different SG code for that tech-tree status.
3. Click **"↻ Refresh from SG"** at the top to re-fetch the available codes (e.g., after your SG admin adds a new status).
4. Click **"Save mapping"** to persist. Subsequent task status changes will use the new mapping immediately.
5. Click **"Reset"** to discard unsaved edits.

**Stale codes:** If a saved code is no longer present in SG (because someone removed it from the SG site), its row is flagged with a red border and a "stale" label. The dropdown will still show the stale value so you can see what was saved, but you should pick a new code and save.

> Note: Status sync **back to SG** can be globally disabled by setting the `SG_WRITE_DISABLED=1` environment variable on the app server. This is recommended for staging deployments that read SG but should never write to it. When disabled, your status changes still propagate locally but never reach SG.

### SG Import (ShotGrid Sync)

This section lets you import and manage data from ShotGrid (Flow Production Tracking). It appears at the bottom of the Settings page.

![SG Import section](./screenshots/admin-settings-sg-import.png)

#### Connection Status

At the top of the section:

- A **colored dot** shows the connection state:
  - Green = ShotGrid credentials are configured and connected
  - Red = SG_URL or API_KEY is not set (contact your system administrator)
  - Gray = Still loading
- The **SG site URL** is displayed next to the dot.
- **Entity counts** show how many SG-synced entities exist locally (e.g., "Projects 6 / Workers 12 / Tasks 117").
- **Last modified** shows the timestamp of the most recent sync.

#### Importing Entities

Four import cards are available, one for each entity type:

**Projects**
- Status filter pills let you select which project statuses to import (e.g., "Active").
- Click **"Import"** to pull matching projects from ShotGrid.
- Click the **refresh icon** to reload the available status list from SG.

**Departments**
- No filter needed. Click **"Import"** to pull all departments.

**Workers**
- No filter needed. Click **"Import"** to pull all human users from SG.

**Tickets**
- Two filter rows: **Statuses** (purple pills) and **Projects** (blue pills).
- Status filter pills let you select which ticket statuses to import (e.g., ip, open, res, rev, wtg).
- Project filter pills let you select which SG projects' tickets to import. **All / None** buttons toggle the whole list. When every project is selected, no filter is applied — so new SG projects you add later will automatically flow into future imports.
- Click **"Import"** to pull matching tickets.
- Click the **refresh icon** next to either filter to reload from SG.

After each import completes, a green success message appears (e.g., "Projects imported") or a red error message if something went wrong. The entity counts update automatically.

#### Restricting Imports to Specific SG Projects

The Projects filter on the Tickets card is the import-time scope for which SG projects you want to bring into the tech tree. Use it when your SG site has many projects but your pipeline team only cares about a subset.

- The list is fetched **live from SG** (via the same connection used by Connection Status), so it always reflects what your SG site contains.
- Selecting fewer projects means subsequent ticket imports skip tickets in unselected projects.
- This is **not** a live filter — the sgEvent daemon still forwards every ticket event to the app regardless of project. If a ticket from an excluded project appears, run another filtered import (or use **Clear SG Data**) to remove it.
- Workers / HumanUsers are global in SG and are not project-scoped, so the Workers card does not have this filter.

#### Re-importing a Single Ticket

Below the Tickets import card, there is a **"Re-import by SG ID"** field. Enter a ShotGrid ticket ID number (e.g., 206) and click **"Import"** to re-sync just that one ticket. This is useful when a specific ticket is out of date and you do not want to re-import everything.

#### Clearing SG Data

At the very bottom of the SG Import section, a red **"Clear SG Data"** button permanently deletes all SG-synced entities from the local database.

1. Click **"Clear SG Data"**.
2. A confirmation prompt appears: "Permanently delete all SG entities?"
3. Click **"Confirm Delete"** to proceed, or **"Cancel"** to abort.
4. A success message shows how many entities were deleted.

> Warning: This action cannot be undone. You will need to re-import from ShotGrid to restore the data.

---

## Important Notes

- **Admin is temporary.** Your admin session ends on sign-out or page reload. Always finish your admin tasks before navigating away.
- **Priority changes propagate everywhere.** When you change weights, lead assignments, or project/department priorities, the computed score for every task in the system is recalculated. Other users will see updated priority ordering the next time their view refreshes.
- **Role changes are permanent.** Unlike admin status, changing a user from Worker to Coordinator (or vice versa) is saved to the database and persists across sessions.
- **SG imports are additive.** Importing from ShotGrid creates or updates entities but does not remove local-only data. Use "Clear SG Data" only if you need a clean slate.
- **Notifications are sent automatically.** When you change calibration weights, a notification is broadcast to all users. Priority override changes also trigger targeted notifications.
