# Task Tech Tree System

A game-inspired task visualization and management system for VFX production (or any organization).

---

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Data Hierarchy](#data-hierarchy)
4. [Priority System](#priority-system)
5. [Priority Calculation](#priority-calculation)
6. [Dependency Model](#dependency-model)
7. [Data Model](#data-model)
8. [UI Design](#ui-design)
9. [Role-Based Views](#role-based-views)
10. [Data Collection Strategy](#data-collection-strategy)
11. [Database Schema](#database-schema)

---

## Overview

### Problem Statement

Leaders need to make decisions about resource allocation, but existing ticket systems don't show:
- What completing a task unlocks
- What resources are needed
- How tasks relate to strategic goals
- Cross-department dependencies

### Solution

A "tech tree" visualization system inspired by strategy games, where:
- Each task shows its **cost** (time, skills, tools)
- Each task shows its **prerequisites** (what must be done first)
- Each task shows its **rewards** (what it unlocks)
- Leaders can see the critical path to any goal

### Key Features

| Feature | Description |
|---------|-------------|
| Multi-level hierarchy | Company → Department/Project → Goal → Task |
| Multi-parent/child | Tasks can depend on many tasks and unlock many tasks |
| Priority layers | Strategic, Department, and Worker priorities |
| Cross-functional projects | Projects span multiple departments |
| Dynamic ETA | More workers = faster completion (with diminishing returns) |
| Milestone tracking | Achievements unlocked by completing task groups |

---

## Core Concepts

### The Tech Tree Analogy

In games, tech trees work because each node has clear:

```
┌─────────────────────────────────────────────────────────────────┐
│                         GAME TECH NODE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   PREREQUISITES          NODE              REWARDS              │
│   (what you need)       (the work)        (what you get)        │
│                                                                 │
│   ┌─────────┐         ┌─────────┐         ┌─────────┐          │
│   │Research │         │ TANKS   │         │ Tank    │          │
│   │ Lab II  │────────▶│         │────────▶│ Units   │          │
│   └─────────┘         │Cost:    │         └─────────┘          │
│   ┌─────────┐         │• 500 gold│        ┌─────────┐          │
│   │ Steel   │────────▶│• 2 turns │────────▶│ Heavy   │          │
│   │ Working │         │         │         │ Armor   │          │
│   └─────────┘         └─────────┘         └─────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Translated to Work Tasks

```
┌─────────────────────────────────────────────────────────────────┐
│                         WORK TASK NODE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   PREREQUISITES          NODE              REWARDS              │
│   (blocking tasks)      (the work)        (unlocked tasks)      │
│                                                                 │
│   ┌─────────┐         ┌─────────┐         ┌─────────┐          │
│   │ USD     │         │ SUBLAYER│         │ Shot    │          │
│   │ Setup   │────────▶│ CACHING │────────▶│ Assembly│          │
│   └─────────┘         │         │         └─────────┘          │
│   ┌─────────┐         │Cost:    │         ┌─────────┐          │
│   │ Houdini │────────▶│• 10 days │────────▶│ Parallel│          │
│   │ 20 Lic. │         │• Python  │         │ Render  │          │
│   └─────────┘         │• USD     │         └─────────┘          │
│                       │         │         ┌─────────┐          │
│                       │         │────────▶│ ⭐ USD  │          │
│                       │         │         │ Ready   │          │
│                       └─────────┘         └─────────┘          │
│                                            (Milestone)          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Hierarchy

### Visual Overview

```
                         ┌──────────────┐
                         │   COMPANY    │
                         │              │
                         │ • Priorities │
                         │ • Settings   │
                         └──────┬───────┘
                                │
           ┌────────────────────┼────────────────────┐
           │                    │                    │
           ▼                    ▼                    ▼
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │  DEPARTMENT  │    │  DEPARTMENT  │    │   PROJECT    │
   │  (Pipeline)  │    │  (Lighting)  │    │ (Show: XYZ)  │
   │              │    │              │    │              │
   │  Permanent   │    │  Permanent   │    │  Temporary   │
   │  Single-team │    │  Single-team │    │  Cross-team  │
   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
          │                   │                   │
          ▼                   ▼                   ▼
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │    GOALS     │    │    GOALS     │    │    GOALS     │
   │              │    │              │    │              │
   │ • USD Pipe   │    │ • Light Rig  │    │ • Hero Char  │
   │ • Deadline   │    │ • ACES Setup │    │ • Env Setup  │
   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
          │                   │                   │
          ▼                   ▼                   ▼
   ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
   │    TASKS     │    │    TASKS     │    │      TASKS       │
   │              │    │              │    │                  │
   │ From tickets │    │ From tickets │    │ Multiple depts   │
   │              │    │              │    │ contribute tasks │
   └──────────────┘    └──────────────┘    └──────────────────┘
```

### Department vs Project

| Aspect | DEPARTMENT | PROJECT |
|--------|------------|---------|
| **Lifespan** | Permanent | Has end date |
| **Scope** | Single discipline | Cross-functional |
| **Workers** | Belong to department | Borrowed from departments |
| **Goals** | Internal improvements | Deliverables |
| **Example** | "Pipeline Team" | "Show: Dragon Quest" |
| **Completion** | Ongoing | Must finish |
| **Priority Source** | Department head | Client/Production |

### Project Cross-Department Structure

```
PROJECT: Dragon Quest
│
├── GOAL: Hero Character Pipeline
│   │
│   ├── Task: Model export setup ────── Department: Pipeline
│   ├── Task: Rig validation ────────── Department: Pipeline
│   ├── Task: Lookdev template ──────── Department: Lighting
│   ├── Task: Hair FX setup ─────────── Department: FX
│   └── Task: Comp template ─────────── Department: Comp
│
├── GOAL: Environment Pipeline
│   │
│   ├── Task: USD structure ─────────── Department: Pipeline
│   ├── Task: Lighting templates ────── Department: Lighting
│   ├── Task: Atmosphere FX ─────────── Department: FX
│   └── Task: Env comp setup ────────── Department: Comp
│
└── GOAL: Shot Production
    │
    ├── Task: SH010 lighting ────────── Department: Lighting
    ├── Task: SH010 FX ──────────────── Department: FX
    ├── Task: SH010 comp ────────────── Department: Comp
    └── ...
```

---

## Priority System

### Four Dimensions of Priority

Priority is determined by four independent but interacting dimensions:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PRIORITY DIMENSIONS                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ 1. PROJECT PRIORITY (Company/Leadership sets)                     │ │
│  │                                                                   │ │
│  │    "What matters most to the business"                            │ │
│  │                                                                   │ │
│  │    P1: CRITICAL   Production blockers, client deadlines          │ │
│  │    P2: HIGH       Important improvements, near-term needs        │ │
│  │    P3: MEDIUM     Scheduled work, nice to have                   │ │
│  │                                                                   │ │
│  │    Maps to ProjectFactor: P1→100, P2→66.7, P3→33.3              │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ 2. DEPARTMENT PRIORITY (Department head sets)                     │ │
│  │                                                                   │ │
│  │    "Within our team, what do we tackle first"                     │ │
│  │                                                                   │ │
│  │    1: Top priority within department                              │ │
│  │    2: Normal priority                                             │ │
│  │    3: Low priority                                                │ │
│  │                                                                   │ │
│  │    Maps to DeptFactor: 1→100, 2→66.7, 3→33.3                    │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ 3. TICKET-CREATOR PRIORITY (Automatic from creator role)          │ │
│  │                                                                   │ │
│  │    "Who created the ticket affects its weight"                    │ │
│  │                                                                   │ │
│  │    Lead (isLead=true):  CreatorFactor = 100                      │ │
│  │    Non-lead:            CreatorFactor = 50                        │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ 4. COMPUTED TICKET PRIORITY (Automatic, overridable)              │ │
│  │                                                                   │ │
│  │    Weighted composite of all four factors                         │ │
│  │    Can be overridden by authorized users                          │ │
│  │    Override freezes displayed score; computed score continues     │ │
│  │    updating in background (drift indicator)                       │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Priority Scale Reference

| Dimension | Values | Factor Formula | Example |
|-----------|--------|---------------|---------|
| Project Priority | P1, P2, P3 | `(4 - rank) / 3 x 100` | P1->100, P2->66.7, P3->33.3 |
| Department Priority | 1, 2, 3 | `(4 - deptPri) / 3 x 100` | 1->100, 2->66.7, 3->33.3 |
| Creator Priority | lead, non-lead | `isLead ? 100 : 50` | lead->100, non-lead->50 |
| Graph Factor | 0-100 (computed) | backward propagation | downstream + critical path |

### How Priorities Interact

```
            PROJECT             DEPT              CREATOR         GRAPH
            (Leadership)       (Head)            (Auto)          (Computed)
                |                |                  |                |
                v                v                  v                v
           +--------+      +--------+        +------------+  +----------+
           |        |      |        |        |            |  |          |
Project A  |   P1   |      |   1    |        |  Lead=100  |  | GF=75   |
- Goal X   |  w=0.30|  +   |  w=0.25|   +    |  w=0.10   |+ | w=0.35  |
   - Task  |  =30.0 |      |  =25.0 |        |  =10.0    |  | =26.25  |
           |        |      |        |        |            |  |          |
           +--------+      +--------+        +------------+  +----------+
                                                                    |
                                                                    v
                                                         ComputedScore = 91.25

EFFECTIVE SCORE = override.score ?? ComputedScore
```

### Priority Rules

| Rule | Description |
|------|-------------|
| **P1 Surface** | P1 tasks always surface to top of all views |
| **Tier Reordering** | Department can reorder within same strategic tier |
| **Worker Alignment** | Workers should activate highest-score tasks first |
| **Mismatch Warning** | System warns if worker priority violates computed order |
| **Deadline Escalation** | Approaching deadline increases graph factor |
| **Blocker Boost** | Tasks blocking many others get higher graph factor |
| **Override Freeze** | Overridden scores stay frozen; drift indicator shows gap |

### Priority Mismatch Detection

```
+-------------------------------------------------------------------------+
|  Warning: PRIORITY MISMATCH DETECTED                                     |
+-------------------------------------------------------------------------+
|                                                                         |
|  Worker: Alice Chen                                                     |
|                                                                         |
|  Currently Active:                                                      |
|  -- Task: "Update USD Docs" (Score: 32 - Medium)                       |
|                                                                         |
|  Higher Priority Available:                                             |
|  -- Task: "Sublayer Caching" (Score: 86 - Critical)                    |
|      -- Project: Dragon Quest (P1) / Dept: 1 / Created by: Lead       |
|                                                                         |
|  Recommendation: Switch active task to align with computed priority    |
|                                                                         |
|  [Switch Now]  [Dismiss]  [Explain Reason]                             |
|                                                                         |
+-------------------------------------------------------------------------+
```

---

## Priority Calculation

### The Composite Formula

```
+-----------------------------------------------------------------------------+
|                     COMPOSITE PRIORITY FORMULA                              |
+-----------------------------------------------------------------------------+
|                                                                             |
|  ComputedScore = w_proj x PF + w_dept x DF + w_creator x CF + w_graph x GF |
|                                                                             |
|  WHERE:                                                                     |
|                                                                             |
|  PF (ProjectFactor)  = (4 - rank) / 3 x 100                               |
|     P1 -> 100, P2 -> 66.7, P3 -> 33.3                                     |
|                                                                             |
|  DF (DeptFactor)     = (4 - deptPriority) / 3 x 100                       |
|     1 -> 100, 2 -> 66.7, 3 -> 33.3                                        |
|                                                                             |
|  CF (CreatorFactor)  = isLead ? 100 : 50                                   |
|     Lead -> 100, Non-lead -> 50                                            |
|                                                                             |
|  GF (GraphFactor)    = backward-propagation score (0-100)                  |
|     See "GraphFactor: Backward Propagation" below                          |
|                                                                             |
|  DEFAULT WEIGHTS (when no calibration performed):                          |
|     w_proj = 0.30   w_dept = 0.25   w_creator = 0.10   w_graph = 0.35    |
|                                                                             |
|  EFFECTIVE SCORE:                                                           |
|     = task.priorityOverride.score  (if override set)                       |
|     = ComputedScore               (otherwise)                              |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### GraphFactor: Backward Propagation Detail

The GraphFactor (GF) is a 0-100 score computed by backward propagation from goal milestones. It captures how much downstream work a task unlocks and whether it sits on the critical path.

**Components of GF (0-100):**

| Component | Range | Description |
|-----------|-------|-------------|
| Downstream count | 0-40 | `(transitiveDownstream / maxDownstream) x 40` |
| Goal priority | 0-30 | `max(0, 30 - (goalDeptPriority - 1) x 10)` |
| Critical path | 0 or 20 | 20 if on longest chain to a goal milestone |
| Status bonus | 0 or 10 | 10 if task is `in_progress` (already committed) |

The backward propagation algorithm works from milestones to their required tasks:

1. **Assign base values to milestones** using `weight x strategic_multiplier`
2. **Propagate backward** through dependency chains, splitting contribution by parent count
3. **Aggregate paths** - tasks unlocking multiple things sum all contributions
4. **Identify critical path** - longest dependency chain to any goal milestone

### Permutation Matrix

All 18 combinations (3 project x 3 dept x 2 creator) with default weights and GF=60:

| # | Proj | Dept | Creator | GF | PFx0.30 | DFx0.25 | CFx0.10 | GFx0.35 | Score | Rank |
|---|------|------|---------|----|---------|---------|---------|---------|-------|------|
| 1 | P1 | 1 | lead | 60 | 30.0 | 25.0 | 10.0 | 21.0 | **86** | 1 |
| 2 | P1 | 1 | non-lead | 60 | 30.0 | 25.0 | 5.0 | 21.0 | **81** | 2 |
| 3 | P1 | 2 | lead | 60 | 30.0 | 16.7 | 10.0 | 21.0 | **78** | 3 |
| 4 | P1 | 2 | non-lead | 60 | 30.0 | 16.7 | 5.0 | 21.0 | **73** | 4 |
| 5 | P1 | 3 | lead | 60 | 30.0 | 8.3 | 10.0 | 21.0 | **69** | 5 |
| 6 | P2 | 1 | lead | 60 | 20.0 | 25.0 | 10.0 | 21.0 | **76** | - |
| 7 | P1 | 3 | non-lead | 60 | 30.0 | 8.3 | 5.0 | 21.0 | **64** | - |
| 8 | P2 | 1 | non-lead | 60 | 20.0 | 25.0 | 5.0 | 21.0 | **71** | - |
| 9 | P2 | 2 | lead | 60 | 20.0 | 16.7 | 10.0 | 21.0 | **68** | - |
| 10 | P2 | 2 | non-lead | 60 | 20.0 | 16.7 | 5.0 | 21.0 | **63** | - |
| 11 | P2 | 3 | lead | 60 | 20.0 | 8.3 | 10.0 | 21.0 | **59** | - |
| 12 | P2 | 3 | non-lead | 60 | 20.0 | 8.3 | 5.0 | 21.0 | **54** | - |
| 13 | P3 | 1 | lead | 60 | 10.0 | 25.0 | 10.0 | 21.0 | **66** | - |
| 14 | P3 | 1 | non-lead | 60 | 10.0 | 25.0 | 5.0 | 21.0 | **61** | - |
| 15 | P3 | 2 | lead | 60 | 10.0 | 16.7 | 10.0 | 21.0 | **58** | - |
| 16 | P3 | 2 | non-lead | 60 | 10.0 | 16.7 | 5.0 | 21.0 | **53** | - |
| 17 | P3 | 3 | lead | 60 | 10.0 | 8.3 | 10.0 | 21.0 | **49** | - |
| 18 | P3 | 3 | non-lead | 60 | 10.0 | 8.3 | 5.0 | 21.0 | **44** | 18 |

**With GF=90** (high graph topology), rankings shift significantly - tasks with strong downstream impact can outrank higher-tier projects:

| # | Proj | Dept | Creator | GF | Score (GF=90) | vs GF=60 |
|---|------|------|---------|----|---------------|----------|
| 1 | P1 | 1 | lead | 90 | **97** | +11 |
| 13 | P3 | 1 | lead | 90 | **77** | +11 |
| 17 | P3 | 3 | lead | 90 | **60** | +11 |
| 18 | P3 | 3 | non-lead | 90 | **55** | +11 |

Key insight: A P3/Dept=1/lead task with GF=90 (score=77) outranks a P1/Dept=3/non-lead task with GF=60 (score=64).

### Weight Calibration (Admin-Driven)

Weights are adjustable via an admin calibration workflow. Six scenario-based questions are presented during setup. The admin picks a winner for each head-to-head comparison, and the system derives weight values that satisfy their preferences.

**No pre-decided expected results** - the weights adapt to the admin's choices.

#### Calibration Questions

| # | Scenario | What It Constrains |
|---|----------|--------------------|
| 1 | "A lead creates a P3 ticket vs a non-lead creates a P1 ticket - which should be prioritized?" | `w_creator` vs `w_proj` |
| 2 | "Dept=1/Proj=P2 ticket vs Dept=2/Proj=P1 ticket, same creator and graph - which wins?" | `w_proj` vs `w_dept` |
| 3 | "P3 ticket that blocks 12 downstream tasks vs P1 ticket with no downstream - which wins?" | `w_graph` vs `w_proj` |
| 4 | "Lead's Dept=3 ticket vs non-lead's Dept=1 ticket, same project and graph - which wins?" | `w_creator` vs `w_dept` |
| 5 | "P2/Dept=2/high-graph ticket vs P1/Dept=3/low-graph ticket - which wins?" | All four weights |
| 6 | "Two identical tickets except one is on the critical path (GF=90) and the other isn't (GF=30) - how much should graph matter?" | `w_graph` floor/ceiling |

For question 6, the admin picks from: "Critical path always wins" / "Critical path is a tiebreaker" / "Somewhere in between".

#### Weight Derivation Algorithm

- Each answer produces a linear inequality constraint on the weight vector
- System solves via constrained adjustment (weights must sum to 1, each >= 0.05)
- If constraints are contradictory, the system reports which answers conflict and asks admin to resolve
- Default weights (`0.30 / 0.25 / 0.10 / 0.35`) used when no calibration has been performed

```typescript
interface CalibrationWeights {
  project: number;   // default 0.30
  dept: number;      // default 0.25
  creator: number;   // default 0.10
  graph: number;     // default 0.35
}
```

### Override Workflow

Authorized users can override a task's computed priority score. The override freezes the displayed score while the computed score continues updating in the background. A drift indicator shows how far the override has diverged from the current computed score.

#### Override Data Model

```typescript
interface PriorityOverride {
  score: number;                // frozen display score (0-100)
  setBy: string;                // worker ID
  setAt: string;                // ISO timestamp
  reason: string;               // required justification
  previousComputedScore: number; // snapshot at override time
}

// On Task:
//   priorityOverride?: PriorityOverride
//   createdBy?: string  // worker ID of ticket creator

// On Worker:
//   isLead?: boolean
```

#### Override Permissions

| Role | Scope |
|------|-------|
| Admin | All tasks |
| Department Head | Tasks where `contributingDepartmentId` matches their department |
| Project Lead | Tasks in goals belonging to their project |
| Worker | Cannot override; can flag for review |

#### Override Behavior

1. **Setting an override**: stores `PriorityOverride` on the task; displayed score = override score
2. **During recalculation**: computed score updates normally but displayed score stays frozen
3. **Drift indicator**: UI shows "pinned 90 (computed: 45, drift: -45)" when override diverges
4. **Lifting an override**: clears `priorityOverride`; score snaps to current computed value

### Handling Special Cases

```
+-----------------------------------------------------------------------------+
|                       SPECIAL CASES                                         |
+-----------------------------------------------------------------------------+
|                                                                             |
|  CASE 1: TASK WITH NO DOWNSTREAM (Leaf Node)                                |
|  GraphFactor will be low (based on goal priority and status only).         |
|  These naturally sort toward the bottom of priority lists.                 |
|                                                                             |
|  CASE 2: CIRCULAR DEPENDENCIES (Error State)                                |
|  Detect during propagation, flag as error. User must fix.                  |
|                                                                             |
|  CASE 3: MULTIPLE PATHS TO SAME MILESTONE                                   |
|  Count each unique downstream task once (Set-based traversal).             |
|                                                                             |
|  CASE 4: TASK ON CRITICAL PATH                                              |
|  Gets +20 bonus in GraphFactor. Combined with other factors,               |
|  critical path tasks are strongly prioritized.                             |
|                                                                             |
|  CASE 5: LOCKED TASKS                                                       |
|  Still calculate score for planning. Display separately.                   |
|                                                                             |
|  CASE 6: COMPLETED TASKS                                                    |
|  Exclude from active calculation. No priority needed.                      |
|                                                                             |
|  CASE 7: OVERRIDDEN TASKS                                                   |
|  Displayed score = override. Computed score still updates.                 |
|  Drift indicator visible to authorized users.                              |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Recalculation Triggers

```
+-----------------------------------------------------------------------------+
|                    WHEN TO RECALCULATE PRIORITIES                           |
+-----------------------------------------------------------------------------+
|                                                                             |
|  AUTOMATIC TRIGGERS:                                                        |
|                                                                             |
|  * Task completed         -> Unlock children, recalc affected subgraph     |
|  * Task status changed    -> May affect graph factor (status bonus)        |
|  * Worker assigned/removed -> ETA changes, recalc task                      |
|  * Daily schedule         -> Urgency increases as deadlines approach       |
|  * Dependency added/removed -> Graph structure changed                      |
|  * Calibration weights changed -> Full recalc of all scores                |
|                                                                             |
|  NOTE: Overridden tasks recalculate their computedScore but NOT            |
|  their displayed effectiveScore. Drift indicator updates instead.          |
|                                                                             |
|  MANUAL TRIGGERS:                                                           |
|                                                                             |
|  * "Recalculate All" button                                                |
|  * Strategic priority changed (P1, P2, P3)                                 |
|  * Deadline changed                                                         |
|  * Override set or lifted                                                   |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### UI Integration

```
+-----------------------------------------------------------------------------+
|                    PRIORITY IN UI VIEWS                                     |
+-----------------------------------------------------------------------------+
|                                                                             |
|  TECH TREE VIEW (A):                                                        |
|  * Priority badge on each node (Critical/High/Medium/Low/Minimal)          |
|  * Color-coded by score: red > amber > blue > gray                         |
|  * Hover shows factor breakdown: "Proj: 30 + Dept: 25 + Cr: 10 + GF: 21" |
|  * Pin indicator on overridden tasks                                       |
|                                                                             |
|  TASK DETAIL PANEL:                                                         |
|  * Four-factor breakdown with progress bars                                |
|  * Override button (for authorized users)                                  |
|  * Drift indicator when override active                                    |
|  * Critical path indicator                                                 |
|                                                                             |
|  WORKER VIEW (D):                                                           |
|  * Queue sorted by effective score (override-aware)                        |
|  * Priority badge on each task in queue                                    |
|  * Pin next to overridden scores                                           |
|                                                                             |
|  DASHBOARD VIEW (B):                                                        |
|  * Sort goals by highest-priority task within them                         |
|  * Show "Top priority: Task X (score: 86)"                                 |
|                                                                             |
|  TIMELINE VIEW (C):                                                         |
|  * Color-code bars by priority level                                       |
|  * Show critical path as connected highlighted blocks                      |
|                                                                             |
+-----------------------------------------------------------------------------+
```

### Acceptance Criteria

- All 18 permutation rows executable via unit test that outputs ranked list
- Second table (GF=90) produces different ranking from first (GF=60) in at least 3 positions
- Override sets `priorityOverride`; recalculation does NOT change displayed score
- Lift override clears `priorityOverride`; moves record to audit history
- `deriveWeightsFromCalibration()` produces valid weights (sum=1, each >= 0.05) for any consistent set of admin answers
- `deriveWeightsFromCalibration()` reports conflicts when admin answers are contradictory
- Default weights (0.30 / 0.25 / 0.10 / 0.35) used when no calibration has been performed

## Dependency Model

### Multi-Parent, Multi-Child Tasks

Tasks can have **multiple inputs** (prerequisites) and **multiple outputs** (unlocks):

```
        PARENTS (Prerequisites)              CHILDREN (Unlocks)
        ───────────────────────              ──────────────────

        ┌─────────┐                              ┌─────────┐
        │ Task A  │───────────┐      ┌──────────│ Task D  │
        └─────────┘           │      │          └─────────┘
                              ▼      ▼
        ┌─────────┐       ┌─────────────┐       ┌─────────┐
        │ Task B  │──────▶│   TASK X    │──────▶│ Task E  │
        └─────────┘       │             │       └─────────┘
                          │ Requires:   │
        ┌─────────┐       │ A AND B AND │       ┌─────────┐
        │ Task C  │──────▶│ C complete  │──────▶│ Task F  │
        └─────────┘       └─────────────┘       └─────────┘
                                 │
                                 │              ┌─────────┐
                                 └─────────────▶│ ⭐ Mile │
                                                │  stone  │
                                                └─────────┘
```

### Multi-Parent, Multi-Child Milestones

Milestones can also have **multiple inputs** (required tasks) and **multiple outputs** (what gets unlocked):

```
        REQUIRED TASKS                          UNLOCKS
        ──────────────                          ───────

        ┌─────────┐                              ┌─────────┐
        │ Task A  │───────────┐      ┌──────────│ Task X  │
        └─────────┘           │      │          └─────────┘
                              ▼      ▼
        ┌─────────┐       ┌─────────────┐       ┌─────────┐
        │ Task B  │──────▶│ ⭐ MILESTONE│──────▶│ Task Y  │
        └─────────┘       │             │       └─────────┘
                          │ "USD Ready" │
        ┌─────────┐       │             │       ┌─────────┐
        │ Task C  │──────▶│ Unlocked    │──────▶│ Goal Z  │
        └─────────┘       │ when A,B,C  │       └─────────┘
                          │ complete    │
        ┌─────────┐       │             │       ┌─────────┐
        │ Task D  │──────▶│             │──────▶│ ⭐ Next │
        └─────────┘       └─────────────┘       │Milestone│
                                                └─────────┘
```

### Dependency Types

| Type | Description | Example |
|------|-------------|---------|
| **Finish-to-Start** | A must finish before B starts | "USD Setup" → "USD Caching" |
| **Milestone Gate** | Milestone must unlock before task available | "⭐ Pipeline Ready" → "Shot Production" |
| **Cross-Dept** | Task in Dept A blocks task in Dept B | "FX Complete" → "Comp Start" |
| **Cross-Project** | Dept improvement enables project work | "USD Pipeline" → "Dragon Quest shots" |

### Complex Dependency Example

```
┌─────────────────────────────────────────────────────────────────────────┐
│  GOAL: Hero Character Pipeline                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                    ┌─────────────┐                                      │
│                    │ Model Export│                                      │
│                    │   Setup     │                                      │
│                    └──────┬──────┘                                      │
│                           │                                             │
│              ┌────────────┼────────────┐                                │
│              │            │            │                                │
│              ▼            ▼            ▼                                │
│        ┌──────────┐ ┌──────────┐ ┌──────────┐                          │
│        │   Rig    │ │ Lookdev  │ │ Hair FX  │                          │
│        │Validation│ │ Template │ │  Setup   │                          │
│        └────┬─────┘ └────┬─────┘ └────┬─────┘                          │
│             │            │            │                                 │
│             │      ┌─────┴─────┐      │                                 │
│             │      ▼           ▼      │                                 │
│             │ ┌──────────┐ ┌──────────┐                                 │
│             │ │  Shader  │ │  Light   │                                 │
│             │ │  Library │ │   Rig    │                                 │
│             │ └────┬─────┘ └────┬─────┘                                 │
│             │      │            │                                       │
│             └──────┼────────────┼──────┘                                │
│                    │            │                                       │
│                    ▼            ▼                                       │
│              ┌───────────────────────┐                                  │
│              │     Comp Template     │◀─── Requires ALL above          │
│              └───────────┬───────────┘                                  │
│                          │                                              │
│                          ▼                                              │
│              ┌───────────────────────┐     ┌───────────────────────┐   │
│              │ ⭐ Hero Pipeline Ready │────▶│   Shot Production     │   │
│              └───────────────────────┘     │   Can Begin           │   │
│                                            └───────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Entity Definitions

#### Company

```
Company
├── id: string
├── name: string
├── priority_definitions: PriorityDefinition[]
└── settings: CompanySettings
```

#### Department

```
Department
├── id: string
├── name: string                    # "Pipeline", "Lighting", "FX"
├── description: string
├── head: string                    # Department lead
├── workers: Worker[]               # People in this department
└── goals: Goal[]                   # Department-internal goals
```

#### Project

```
Project
├── id: string
├── name: string                    # "Dragon Quest", "Phoenix Film"
├── description: string
├── deadline: date
├── strategic_priority: P1|P2|P3|P4
├── status: active|completed|on_hold|cancelled
├── contributing_departments: Department[]
├── goals: Goal[]                   # Project deliverables
└── milestones: Milestone[]         # Project-level achievements
```

#### Goal

```
Goal
├── id: string
├── name: string                    # "USD Pipeline", "Hero Character"
├── description: string
├── owner: string
├── parent_type: "department" | "project"
├── parent_id: string               # Department or Project ID
├── department_priority: integer    # Rank within department
├── tasks: Task[]
└── milestones: Milestone[]

# Computed Properties (not stored)
├── progress_percent: float         # completed_tasks / total_tasks
├── active_worker_count: integer    # workers currently on tasks
├── estimated_completion: date      # based on current velocity
└── status: on_track|at_risk|blocked
```

#### Task

```
Task
├── id: string
├── goal_id: string
├── name: string
├── description: string
├── status: locked|available|in_progress|paused|completed|blocked
│
│   # Source
├── ticket_system_id: string        # Link to Jira/ShotGrid ticket
├── ticket_system_url: string
│
│   # Department
├── contributing_department_id: string   # Which dept does this work
│
│   # Cost
├── base_duration_days: integer     # Time estimate for 1 worker
├── required_skills: string[]       # ["Python", "USD", "Houdini"]
├── required_tools: string[]        # ["Deadline", "ShotGrid"]
├── budget: float                   # Optional monetary cost
│
│   # Dependencies (MULTI-PARENT)
├── depends_on_tasks: Task[]        # Tasks that must complete first
├── depends_on_milestones: Milestone[]  # Milestones that must unlock
│
│   # Unlocks (MULTI-CHILD)
├── unlocks_tasks: Task[]           # Tasks enabled when this completes
├── unlocks_milestones: Milestone[] # Milestones this contributes to
│
│   # Workers
├── assigned_workers: Worker[]      # All assigned (may not be active)
├── parallelization_factor: float   # 0.0-1.0, how well it scales
│
│   # Dates
├── started_at: datetime
├── completed_at: datetime
└── due_date: date                  # Optional deadline

# Computed Properties
├── active_worker_count: integer
├── eta_days: float                 # Based on workers and parallelization
└── effective_priority: float       # Calculated from all factors
```

#### Milestone

```
Milestone
├── id: string
├── name: string                    # "USD Pipeline Ready"
├── description: string             # "All artists can work in USD"
├── type: capability|efficiency|quality|cost_reduction
├── parent_type: "goal" | "project"
├── parent_id: string
│
│   # Requirements (MULTI-PARENT)
├── required_tasks: Task[]          # Tasks needed to unlock
├── required_milestones: Milestone[] # Other milestones needed
│
│   # Unlocks (MULTI-CHILD)
├── unlocks_tasks: Task[]           # Tasks enabled when unlocked
├── unlocks_milestones: Milestone[] # Milestones enabled when unlocked
├── unlocks_goals: Goal[]           # Goals enabled when unlocked
│
│   # Status
├── unlocked: boolean
├── unlocked_at: datetime
└── due_date: date                  # Optional target date

# Computed Properties
├── progress_percent: float         # completed_requirements / total
└── blocking_tasks: Task[]          # Incomplete required tasks
```

#### Worker

```
Worker
├── id: string
├── name: string
├── department_id: string           # Home department
├── skills: string[]
├── email: string
│
│   # Task Assignment
├── assigned_tasks: Task[]          # All tasks assigned to worker
├── active_task_id: string|null     # Currently working on (only one)
├── personal_priority: Task[]       # Ordered by worker preference
│
│   # Availability
├── availability: full|partial|unavailable
└── utilization_percent: float      # Time allocated vs available

# Computed Properties
├── is_idle: boolean                # active_task_id is null
├── has_priority_mismatch: boolean  # Active task lower than available P1
└── workload_days: float            # Sum of assigned task ETAs
```

### Worker Assignment Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        WORKER ASSIGNMENT MODEL                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  RULE: A worker can be ASSIGNED to MANY tasks                          │
│        A worker can only be ACTIVE on ONE task at a time               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     WORKER: Alice Chen                          │   │
│  │                     Department: Pipeline                        │   │
│  │                     Skills: Python, USD, Houdini                │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │                                                                 │   │
│  │   ASSIGNED TASKS              ACTIVE TASK                       │   │
│  │   ┌──────────────────┐        ┌──────────────────┐              │   │
│  │   │ ● USD Caching    │        │ ● USD Caching    │              │   │
│  │   │ ○ Asset Resolver │  ───▶  │                  │              │   │
│  │   │ ○ Shot Assembly  │        │   Working on it  │              │   │
│  │   │ ○ Docs Update    │        │   ETA: 6.2 days  │              │   │
│  │   └──────────────────┘        └──────────────────┘              │   │
│  │                                                                 │   │
│  │   ● = Active    ○ = Assigned but not active                    │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Worker can switch active task at any time                             │
│  (like reassigning a unit in a strategy game)                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### ETA Calculation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ETA CALCULATION                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Formula: ETA = base_duration / (workers ^ parallelization_factor)     │
│                                                                         │
│  Example: base_duration = 10 days, parallelization_factor = 0.7        │
│                                                                         │
│  Workers    Calculation              ETA        Efficiency              │
│  ────────   ───────────────────────  ─────────  ───────────             │
│  1          10 / (1 ^ 0.7) = 10/1    10.0 days  100%                    │
│  2          10 / (2 ^ 0.7) = 10/1.62  6.2 days   81% per worker        │
│  3          10 / (3 ^ 0.7) = 10/2.16  4.6 days   72% per worker        │
│  4          10 / (4 ^ 0.7) = 10/2.64  3.8 days   66% per worker        │
│  5          10 / (5 ^ 0.7) = 10/3.09  3.2 days   62% per worker        │
│                                                                         │
│  Note: Humans aren't CPUs - adding workers has diminishing returns     │
│  The parallelization_factor (0.0-1.0) controls how well a task scales  │
│                                                                         │
│  Factor = 1.0  Perfect scaling (rare, embarrassingly parallel tasks)   │
│  Factor = 0.7  Good scaling (default, most collaborative work)         │
│  Factor = 0.5  Poor scaling (complex coordination required)            │
│  Factor = 0.3  Very poor scaling (essentially single-threaded work)    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## UI Design

### Overview: Three Views

| View | Name | Best For | Primary Users |
|------|------|----------|---------------|
| **A** | Tech Tree | Dependencies & unlock paths | Developers, Tech Leads |
| **B** | Dashboard | Quick status & drill-down | Executives, Dept Heads |
| **C** | Timeline | Planning & scheduling | Project Managers, Coordinators |

All three views are needed and interconnected. Users can switch between them.

---

### View A: Tech Tree (Game-style)

**Purpose:** See the "unlock path" - what depends on what, what completing a task enables.

**Best for:** Developers, Tech Leads who need to understand dependencies.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back    GOAL: USD Pipeline                              [B] [C] Views   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Strategic: P1    Dept Priority: #1    Progress: ████████░░ 75%    👥 4    │
│                                                                             │
│  ┌────── MILESTONES ──────┐                                                │
│  │ ✓ USD Foundation       │                                                │
│  │ ○ Parallel Render      │                                                │
│  │ ○ Full Adoption        │                                                │
│  └────────────────────────┘                                                │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│                           ┌─────────────┐                                   │
│                           │  USD Setup  │                                   │
│                           │ ████████████│                                   │
│                           │   ✓ DONE    │                                   │
│                           └──────┬──────┘                                   │
│                    ┌─────────────┼─────────────┐                            │
│                    │             │             │                            │
│                    ▼             ▼             ▼                            │
│            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                  │
│            │  Sublayer   │ │   Asset     │ │   Schema    │                  │
│            │  Caching    │ │  Resolver   │ │  Validation │                  │
│            │ ░░░░░░░░░░░ │ │ ░░░░░░░░░░░ │ │ ████████████│                  │
│            │ IN PROGRESS │ │  AVAILABLE  │ │   ✓ DONE    │                  │
│            │             │ │             │ │             │                  │
│            │ 👥 2        │ │ 👥 1        │ │             │                  │
│            │ ETA: 6.2d   │ │ ETA: 10d    │ │             │                  │
│            │             │ │             │ │             │                  │
│            │ Skills:     │ │ Skills:     │ │             │                  │
│            │ Python, USD │ │ Python, USD │ │             │                  │
│            └──────┬──────┘ └──────┬──────┘ └─────────────┘                  │
│                   │               │                                         │
│                   │       ┌───────┘                                         │
│                   │       │                                                 │
│                   ▼       ▼                                                 │
│            ┌─────────────────────┐                                          │
│            │   Shot Assembly     │◀─── Requires BOTH above                 │
│            │ ─────────────────── │                                          │
│            │      LOCKED         │                                          │
│            │                     │                                          │
│            │ Base: 15 days       │                                          │
│            │ Skills: USD, Python │                                          │
│            │ Houdini             │                                          │
│            └──────────┬──────────┘                                          │
│                       │                                                     │
│                       ▼                                                     │
│            ┌─────────────────────┐      ┌─────────────────────┐            │
│            │ ⭐ Parallel Render  │─────▶│  Lighting can use   │            │
│            │    MILESTONE        │      │  new USD workflow   │            │
│            │    (Locked)         │      │  (Cross-dept unlock)│            │
│            └─────────────────────┘      └─────────────────────┘            │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  LEGEND                                                                     │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │████████████│  │░░░░░░░░░░░░│  │            │  │────────────│           │
│  │  DONE      │  │IN PROGRESS │  │ AVAILABLE  │  │  LOCKED    │           │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘           │
│                                                                             │
│  👥 N = N workers active    ETA = Estimated days to complete               │
│  ⭐ = Milestone             ───▶ = Dependency                              │
│                                                                             │
│  [Assign Worker]  [View Dependencies]  [Edit Task]                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Tech Tree Node Detail (on hover/click)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TASK: Sublayer Caching                                           [Close]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STATUS: In Progress                GOAL: USD Pipeline                      │
│  PRIORITY: P1 Critical              DEPT: Pipeline                          │
│                                                                             │
│  ┌─── COST ────────────────────┐   ┌─── WORKERS ───────────────────────┐   │
│  │                             │   │                                   │   │
│  │  Base Duration: 10 days     │   │  Alice Chen      ● Active         │   │
│  │  Current ETA:   6.2 days    │   │  Bob Smith       ● Active         │   │
│  │                             │   │                                   │   │
│  │  Skills Required:           │   │  [+ Assign Worker]                │   │
│  │  • Python ✓                 │   │                                   │   │
│  │  • USD ✓                    │   │  With 3 workers: 4.6 days         │   │
│  │  • Caching patterns ✓       │   │  With 4 workers: 3.8 days         │   │
│  │                             │   │                                   │   │
│  │  Tools Required:            │   └───────────────────────────────────┘   │
│  │  • Houdini 20 ✓             │                                           │
│  │                             │                                           │
│  └─────────────────────────────┘                                           │
│                                                                             │
│  ┌─── PREREQUISITES (2) ───────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │  ✓ USD Setup                        Done                            │   │
│  │  ✓ Houdini 20 License               Available                       │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─── UNLOCKS WHEN COMPLETE (3) ───────────────────────────────────────┐   │
│  │                                                                     │   │
│  │  ◉ Shot Assembly              Task      (also needs Asset Resolver) │   │
│  │  ◉ Parallel Render            Milestone (also needs Shot Assembly)  │   │
│  │  ◉ Lighting USD Workflow      Task      (cross-dept: Lighting)      │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─── TICKET ──────────────────────────────────────────────────────────┐   │
│  │  ShotGrid: PIPE-042    [Open in ShotGrid]                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [Edit]  [Add Dependency]  [Mark Complete]                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### View B: Dashboard (Executive Overview)

**Purpose:** Quick status checks, identify blockers and risks.

**Best for:** Executives, Department Heads who need the big picture.

#### Company Level Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  COMPANY OVERVIEW                                              Q1 2025     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─── P1 CRITICAL ITEMS ────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  🔴 2 blocked    🟡 3 at risk    🟢 5 on track                        │  │
│  │                                                                       │  │
│  │  BLOCKED:                                                             │  │
│  │  • Dragon Quest > FX Setup - waiting on external vendor              │  │
│  │  • Phoenix Film > Comp Template - dependent task delayed             │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ═══════════════════ PROJECTS ═══════════════════════════════════════════  │
│                                                                             │
│  ┌────────────────────────┐  ┌────────────────────────┐                    │
│  │    DRAGON QUEST        │  │    PHOENIX FILM        │                    │
│  │    Priority: P1        │  │    Priority: P1        │                    │
│  │                        │  │                        │                    │
│  │  ████████████░░░░ 65%  │  │  ██████████████░░ 80%  │                    │
│  │                        │  │                        │                    │
│  │  Deadline: Jun 1       │  │  Deadline: Mar 15      │                    │
│  │  Status: 🟡 At Risk    │  │  Status: 🟢 On Track   │                    │
│  │                        │  │                        │                    │
│  │  👥 14 workers active  │  │  👥 8 workers active   │                    │
│  │  ⭐ 3/8 milestones     │  │  ⭐ 6/8 milestones     │                    │
│  │                        │  │                        │                    │
│  │  [View Project]        │  │  [View Project]        │                    │
│  └────────────────────────┘  └────────────────────────┘                    │
│                                                                             │
│  ═══════════════════ DEPARTMENTS ════════════════════════════════════════  │
│                                                                             │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐           │
│  │    PIPELINE      │ │    LIGHTING      │ │       FX         │           │
│  │                  │ │                  │ │                  │           │
│  │  👥  8 total     │ │  👥 12 total     │ │  👥  6 total     │           │
│  │  👤  6 active    │ │  👤 11 active    │ │  👤  4 active    │           │
│  │                  │ │                  │ │                  │           │
│  │  Utilization:    │ │  Utilization:    │ │  Utilization:    │           │
│  │  ████████░░ 75%  │ │  ██████████ 92%  │ │  ██████░░░░ 67%  │           │
│  │                  │ │  🔴 Overloaded   │ │                  │           │
│  │                  │ │                  │ │                  │           │
│  │  Goals: 3        │ │  Goals: 2        │ │  Goals: 4        │           │
│  │  ⭐ 5/12 done    │ │  ⭐ 2/8 done     │ │  ⭐ 3/15 done    │           │
│  │                  │ │                  │ │                  │           │
│  │  🟢 On track     │ │  🟡 1 at risk    │ │  🔴 2 blocked    │           │
│  │                  │ │                  │ │                  │           │
│  │  [View Dept]     │ │  [View Dept]     │ │  [View Dept]     │           │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘           │
│                                                                             │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐           │
│  │      COMP        │ │    EDITORIAL     │ │   PRODUCTION     │           │
│  │       ...        │ │       ...        │ │       ...        │           │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Project Dashboard (Drill-down)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back    PROJECT: Dragon Quest                           [A] [C] Views   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Priority: P1 Critical    Deadline: Jun 1, 2025    Status: 🟡 At Risk      │
│                                                                             │
│  OVERALL PROGRESS                                                           │
│  ████████████████████████████░░░░░░░░░░░░ 65%              ETA: May 15     │
│                                                                             │
│  ┌─── DEPARTMENT CONTRIBUTIONS ─────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Department      Progress                Workers    Status            │  │
│  │  ─────────────── ───────────────────────  ───────── ────────────────  │  │
│  │  Pipeline        ████████████████████░░░░ 100%       ✓ Done           │  │
│  │  Lighting        ████████████░░░░░░░░░░░░  60%  👥 8  🟢 On Track     │  │
│  │  FX              ██████████░░░░░░░░░░░░░░  50%  👥 4  🟡 At Risk      │  │
│  │  Comp            ██░░░░░░░░░░░░░░░░░░░░░░  10%  👥 2  🔒 Blocked      │  │
│  │  Editorial       ░░░░░░░░░░░░░░░░░░░░░░░░   0%  👥 0  🔒 Waiting      │  │
│  │                                                                       │  │
│  │  [Expand Department]                                                  │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─── PROJECT MILESTONES ───────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  ✓ Asset Pipeline Ready              Completed Mar 1                  │  │
│  │  ✓ First Look Complete               Completed Mar 10                 │  │
│  │  ○ Final Lighting                    Due: Apr 1      ████████░░ 80%  │  │
│  │  ○ FX Complete                       Due: Apr 15     ██████░░░░ 60%  │  │
│  │  ○ Final Comp                        Due: May 1      ██░░░░░░░░ 10%  │  │
│  │  ○ Delivery                          Due: Jun 1      ░░░░░░░░░░  0%  │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─── BLOCKERS & RISKS ─────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  🔴 BLOCKED: FX Setup waiting on external vendor delivery            │  │
│  │     Impact: Delays Comp start by ~1 week                              │  │
│  │     Action: Escalate to vendor [Assigned: John]                       │  │
│  │                                                                       │  │
│  │  🟡 AT RISK: Lighting overtime needed if FX delays continue          │  │
│  │     Impact: May need weekend work                                     │  │
│  │     Action: Prepare contingency schedule                              │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  [View Timeline]  [Resource Allocation]  [Edit Project]                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Department Dashboard (Drill-down)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back    DEPARTMENT: Pipeline                            [A] [C] Views   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Head: Jane Smith    Workers: 8 (6 active, 2 idle)    Utilization: 75%     │
│                                                                             │
│  ┌─── GOALS ─────────────────────────────┐  ┌─── WORKERS ───────────────┐  │
│  │                                        │  │                          │  │
│  │  #1 ┌─────────────────────────────┐   │  │  Name          Active On  │  │
│  │     │ 🎯 USD Pipeline         P1  │   │  │  ───────────── ─────────  │  │
│  │     │    ████████████░░░░ 75%     │   │  │  Alice Chen    PIPE-042   │  │
│  │     │    👥 4 workers             │   │  │  Bob Smith     PIPE-042   │  │
│  │     │    ETA: 3 weeks             │   │  │  Carol Wu      PIPE-038   │  │
│  │     │    ⭐ 2/4 milestones        │   │  │  David Lee     PIPE-051   │  │
│  │     │    [Expand] [View Tree]     │   │  │  Eve Park      PIPE-051   │  │
│  │     └─────────────────────────────┘   │  │  Frank Ng      PIPE-055   │  │
│  │                                        │  │  Grace Kim     (idle)     │  │
│  │  #2 ┌─────────────────────────────┐   │  │  Henry Zhao    (idle)     │  │
│  │     │ 🎯 Deadline Integration P2  │   │  │                          │  │
│  │     │    ██████░░░░░░░░░░ 40%     │   │  │                          │  │
│  │     │    👥 2 workers             │   │  │  [Assign Workers]        │  │
│  │     │    ETA: 5 weeks             │   │  │                          │  │
│  │     │    ⭐ 1/3 milestones        │   │  └──────────────────────────┘  │
│  │     │    [Expand] [View Tree]     │   │                                │
│  │     └─────────────────────────────┘   │                                │
│  │                                        │                                │
│  │  #3 ┌─────────────────────────────┐   │                                │
│  │     │ 🎯 Documentation        P3  │   │                                │
│  │     │    ████░░░░░░░░░░░░ 25%     │   │                                │
│  │     │    👥 0 workers             │   │                                │
│  │     │    Not started              │   │                                │
│  │     │    [Expand] [View Tree]     │   │                                │
│  │     └─────────────────────────────┘   │                                │
│  │                                        │                                │
│  └────────────────────────────────────────┘                                │
│                                                                             │
│  ┌─── PROJECT CONTRIBUTIONS ────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Dragon Quest       ████████████████████ 100%   ✓ Done    👥 0       │  │
│  │  Phoenix Film       ████████████░░░░░░░░  70%   🟢         👥 2       │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  [View Timeline]  [Manage Goals]  [View All Tasks]                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### View C: Timeline (Roadmap)

**Purpose:** See when things will be done, plan resources, identify scheduling conflicts.

**Best for:** Project Managers, Production Coordinators.

#### Project Timeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back    PROJECT: Dragon Quest - Timeline                [A] [B] Views   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Priority: P1    Deadline: Jun 1    Today: Mar 15                          │
│                                                                             │
│                                   Mar        Apr        May        Jun     │
│                                    │          │          │          │      │
│  ┌─── BY DEPARTMENT ─────────────────────────────────────────────────────┐ │
│  │                                 │          │          │          │    │ │
│  │  Pipeline                       │          │          │          │    │ │
│  │  ├─ USD Setup      ████████████ │          │          │          │    │ │
│  │  │                 ✓ DONE       │          │          │          │    │ │
│  │  ├─ Sublayer       ░░░░░░░████  │          │          │          │    │ │
│  │  │  Cache          👥2 ────────▶│          │          │          │    │ │
│  │  └─ Asset               ░░░░░░░░░░░████    │          │          │    │ │
│  │     Resolver            👥1 ──────────────▶│          │          │    │ │
│  │                                 │          │          │          │    │ │
│  │  Lighting                       │          │          │          │    │ │
│  │  ├─ Light Rig      ████████████ │          │          │          │    │ │
│  │  │                 ✓ DONE       │          │          │          │    │ │
│  │  ├─ Env Light           ░░░░░░░░████       │          │          │    │ │
│  │  │                      👥3 ──────────▶    │          │          │    │ │
│  │  └─ Shot Light               ░░░░░░░░░░░░░░░░░░████   │          │    │ │
│  │                              👥5 ──────────────────────▶          │    │ │
│  │                                 │          │          │          │    │ │
│  │  FX                             │          │          │          │    │ │
│  │  ├─ FX Setup            ████████████       │          │          │    │ │
│  │  │                      👥2 ──────▶        │          │          │    │ │
│  │  └─ Shot FX                     │░░░░░░░░░░░░░░████   │          │    │ │
│  │                                 │👥4 ──────────────────▶          │    │ │
│  │                                 │          │          │          │    │ │
│  │  Comp                           │          │          │          │    │ │
│  │  └─ Shot Comp                   │    🔒    │░░░░░░░░░░░░████     │    │ │
│  │                                 │  blocked │👥4 ────────────────▶│    │ │
│  │                                 │          │          │          │    │ │
│  │  Editorial                      │          │          │          │    │ │
│  │  └─ Final Edit                  │          │    🔒    │░░░░░░████│    │ │
│  │                                 │          │  blocked │👥2 ──────▶    │ │
│  │                                 │          │          │          │    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │          │          │          │      │
│  ┌─── MILESTONES ────────────────────────────────────────────────────────┐ │
│  │                                 │          │          │          │    │ │
│  │                       ✓─────────●──────────●──────────●──────────●    │ │
│  │                       Asset   Final      FX       Final    Delivery   │ │
│  │                       Ready   Light    Complete   Comp               │ │
│  │                       Mar 1   Apr 1    Apr 15    May 1     Jun 1     │ │
│  │                                 │          │          │          │    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  LEGEND                                                                     │
│  ████ = Completed    ░░░░ = In Progress    🔒 = Blocked/Waiting            │
│  👥N = Workers assigned    ──▶ = ETA end point                             │
│                                                                             │
│  [Edit Schedule]  [Resource View]  [Export]                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Department Timeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back    DEPARTMENT: Pipeline - Timeline                 [A] [B] Views   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Workers: 8    Active: 6                           Today: Mar 15           │
│                                                                             │
│                                   Mar        Apr        May        Jun     │
│                                    │          │          │          │      │
│  ┌─── BY GOAL ───────────────────────────────────────────────────────────┐ │
│  │                                 │          │          │          │    │ │
│  │  🎯 USD Pipeline (P1)           │          │          │          │    │ │
│  │  ├─ USD Setup      ████████████ │          │          │          │    │ │
│  │  ├─ Sublayer Cache ░░░░░░░░████ │          │          │          │    │ │
│  │  ├─ Asset Resolver      ░░░░░░░░░░░████    │          │          │    │ │
│  │  ├─ Schema Valid   ████████████ │          │          │          │    │ │
│  │  └─ Shot Assembly               │🔒░░░░░░░░░░░░████   │          │    │ │
│  │                                 │          │          │          │    │ │
│  │  ⭐ Parallel Render ────────────│──────────●          │          │    │ │
│  │                                 │       Apr 20        │          │    │ │
│  │                                 │          │          │          │    │ │
│  │  🎯 Deadline Integration (P2)   │          │          │          │    │ │
│  │  ├─ Job Resubmit   ░░░░░░░░████ │          │          │          │    │ │
│  │  ├─ Dependency Track    🔒░░░░░░░░░░████   │          │          │    │ │
│  │  └─ Dashboard                   │     🔒░░░░░░░░████  │          │    │ │
│  │                                 │          │          │          │    │ │
│  │  ⭐ Deadline v2 Ready ──────────│──────────│──────────●          │    │ │
│  │                                 │          │       May 15        │    │ │
│  │                                 │          │          │          │    │ │
│  │  🎯 Documentation (P3)          │          │          │          │    │ │
│  │  └─ Not scheduled               │          │          │          │    │ │
│  │                                 │          │          │          │    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─── WORKER ALLOCATION ─────────────────────────────────────────────────┐ │
│  │                                 │          │          │          │    │ │
│  │  Alice        ████████░░░░░░░░░░░░░░████████          │          │    │ │
│  │               Sublayer ──▶ Shot Assembly ──▶          │          │    │ │
│  │                                 │          │          │          │    │ │
│  │  Bob          ████████░░░░░░░░░░████       │          │          │    │ │
│  │               Sublayer ──▶ Job Resubmit ──▶│          │          │    │ │
│  │                                 │          │          │          │    │ │
│  │  Carol        ░░░░░░░░░░░░░░████│          │          │          │    │ │
│  │               Asset Resolver ───▶          │          │          │    │ │
│  │                                 │          │          │          │    │ │
│  │  David        ░░░░░░████████████│          │          │          │    │ │
│  │  Eve          Job Resubmit ─────▶          │          │          │    │ │
│  │                                 │          │          │          │    │ │
│  │  Frank        ░░░░░░░░████      │          │          │          │    │ │
│  │               Schema Valid ─────▶          │          │          │    │ │
│  │                                 │          │          │          │    │ │
│  │  Grace        ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │    │ │
│  │  Henry        (unassigned - available)     │          │          │    │ │
│  │                                 │          │          │          │    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [Assign Tasks]  [Rebalance]  [Export]                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Worker Personal View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MY WORK: Alice Chen                                       Pipeline Dept   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─── ACTIVE TASK ──────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  🔵 USD Sublayer Caching                                    PIPE-042 │  │
│  │                                                                       │  │
│  │  Project: Dragon Quest (P1 Critical)                                  │  │
│  │  Goal: USD Pipeline                                                   │  │
│  │                                                                       │  │
│  │  ┌─── PROGRESS ────────┐  ┌─── CO-WORKERS ─────────────────────────┐ │  │
│  │  │                     │  │                                        │ │  │
│  │  │  ETA: 6.2 days      │  │  Also working on this:                 │ │  │
│  │  │  (with 2 workers)   │  │  • Bob Smith                           │ │  │
│  │  │                     │  │                                        │ │  │
│  │  └─────────────────────┘  └────────────────────────────────────────┘ │  │
│  │                                                                       │  │
│  │  ┌─── THIS UNLOCKS ──────────────────────────────────────────────┐   │  │
│  │  │                                                                │   │  │
│  │  │  ┌───────────┐    ┌───────────┐    ┌───────────┐              │   │  │
│  │  │  │   Shot    │    │ ⭐Parallel│    │ Lighting  │              │   │  │
│  │  │  │ Assembly  │    │  Render   │    │USD Work-  │              │   │  │
│  │  │  │           │    │ Milestone │    │   flow    │              │   │  │
│  │  │  └───────────┘    └───────────┘    └───────────┘              │   │  │
│  │  │                                     (Lighting Dept)            │   │  │
│  │  └────────────────────────────────────────────────────────────────┘   │  │
│  │                                                                       │  │
│  │  [View Full Tech Tree]  [Log Progress]  [Mark Complete]              │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─── MY QUEUE (by priority) ───────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  #   Task                     Project/Goal       Priority   ETA      │  │
│  │  ──  ───────────────────────  ────────────────  ─────────  ─────     │  │
│  │  1   ● USD Sublayer Caching   Dragon Quest      P1         6.2d      │  │
│  │  2   ○ Asset Resolver         Dragon Quest      P1         10d       │  │
│  │  3   ○ Shot Assembly          Dragon Quest      P1         15d  🔒   │  │
│  │  4   ○ Deadline Job Templates (Dept Goal)       P2         5d        │  │
│  │  5   ○ USD Docs Update        (Dept Goal)       P3         2d        │  │
│  │                                                                       │  │
│  │  ● = Active    ○ = Assigned    🔒 = Blocked                          │  │
│  │                                                                       │  │
│  │  [Switch Active Task]  [Reorder Queue]                               │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─── NOTIFICATIONS ────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  ℹ️  Task #3 "Shot Assembly" will unlock when you complete #1 and    │  │
│  │     Carol completes "Asset Resolver"                                 │  │
│  │                                                                       │  │
│  │  ⚠️  Task #4 (P2) has been in your queue for 2 weeks without         │  │
│  │     progress. Consider starting it or reassigning.                   │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Role-Based Views

### View Matrix

| Role | Primary View | Secondary View | Key Focus |
|------|--------------|----------------|-----------|
| **Executive** | Dashboard (B) - Company | Timeline (C) | Strategic priorities, blockers, resource allocation |
| **Department Head** | Timeline (C) - Department | Dashboard (B) | Team workload, deadlines, goal progress |
| **Project Manager** | Timeline (C) - Project | Dashboard (B) | Cross-dept coordination, milestones |
| **Tech Lead** | Tech Tree (A) | Timeline (C) | Dependencies, unlock paths, technical decisions |
| **Developer** | Tech Tree (A) + Personal | Dashboard (B) | What to work on, what it unlocks |
| **Production Coordinator** | Timeline (C) | Dashboard (B) | Scheduling, resource conflicts |

### Navigation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NAVIGATION FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                         ┌─────────────────┐                                 │
│                         │    COMPANY      │                                 │
│                         │   DASHBOARD     │                                 │
│                         │      (B)        │                                 │
│                         └────────┬────────┘                                 │
│                                  │                                          │
│                    ┌─────────────┼─────────────┐                            │
│                    │             │             │                            │
│                    ▼             ▼             ▼                            │
│            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                  │
│            │  PROJECT    │ │  PROJECT    │ │ DEPARTMENT  │                  │
│            │  DASHBOARD  │ │  TIMELINE   │ │  DASHBOARD  │                  │
│            │     (B)     │ │     (C)     │ │     (B)     │                  │
│            └──────┬──────┘ └──────┬──────┘ └──────┬──────┘                  │
│                   │               │               │                         │
│                   │         ┌─────┴─────┐        │                         │
│                   │         │           │        │                         │
│                   ▼         ▼           ▼        ▼                         │
│            ┌─────────────────────────────────────────────┐                  │
│            │              GOAL VIEW                      │                  │
│            │                                             │                  │
│            │  ┌───────┐   ┌───────┐   ┌───────┐         │                  │
│            │  │TREE(A)│◀─▶│DASH(B)│◀─▶│TIME(C)│         │                  │
│            │  └───────┘   └───────┘   └───────┘         │                  │
│            │                                             │                  │
│            │  Can switch between views at any level      │                  │
│            │                                             │                  │
│            └─────────────────────────────────────────────┘                  │
│                                    │                                        │
│                                    ▼                                        │
│                         ┌─────────────────┐                                 │
│                         │   TASK DETAIL   │                                 │
│                         │                 │                                 │
│                         │ • Full info     │                                 │
│                         │ • Dependencies  │                                 │
│                         │ • Workers       │                                 │
│                         │ • Actions       │                                 │
│                         └─────────────────┘                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Collection Strategy

### Sources of Data

| Data | Source | Collection Method |
|------|--------|-------------------|
| **Tasks** | Ticket System (ShotGrid/Jira) | Auto-sync via API |
| **Task Status** | Ticket System | Real-time sync |
| **Workers** | Ticket System / HR | Auto-sync |
| **Assignments** | Ticket System | Auto-sync |
| **Goals** | Manual entry | Created by leads |
| **Milestones** | Manual entry | Created by leads |
| **Dependencies** | Manual / Ticket System | Hybrid approach |
| **Skills Required** | Manual entry | Tagged by tech leads |
| **Strategic Priority** | Manual entry | Set by leadership |

### Workflow for New Goals

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     GOAL CREATION WORKFLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. IDENTIFY GOAL                                                           │
│     │                                                                       │
│     │  Leadership or Dept Head identifies strategic objective              │
│     │  Example: "We need a USD pipeline for the new show"                  │
│     │                                                                       │
│     ▼                                                                       │
│  2. CREATE GOAL IN SYSTEM                                                   │
│     │                                                                       │
│     │  • Name: "USD Pipeline"                                              │
│     │  • Owner: Jane Smith                                                 │
│     │  • Parent: Pipeline Department (or Project)                          │
│     │  • Strategic Priority: P1                                            │
│     │                                                                       │
│     ▼                                                                       │
│  3. DEFINE MILESTONES                                                       │
│     │                                                                       │
│     │  What does "done" look like?                                         │
│     │  • ⭐ USD Foundation - basic setup works                             │
│     │  • ⭐ Parallel Render - performance goals met                        │
│     │  • ⭐ Full Adoption - all artists using it                           │
│     │                                                                       │
│     ▼                                                                       │
│  4. LINK EXISTING TICKETS AS TASKS                                          │
│     │                                                                       │
│     │  Search ticket system for related tickets                            │
│     │  • PIPE-042: USD sublayer caching                                    │
│     │  • PIPE-038: Asset resolver                                          │
│     │  • PIPE-051: Shot assembly tools                                     │
│     │                                                                       │
│     │  Link them to this goal                                              │
│     │                                                                       │
│     ▼                                                                       │
│  5. DEFINE DEPENDENCIES                                                     │
│     │                                                                       │
│     │  Tech lead maps out:                                                 │
│     │  • PIPE-042 depends on PIPE-039 (USD Setup)                          │
│     │  • PIPE-051 depends on PIPE-042 AND PIPE-038                         │
│     │  • ⭐ Parallel Render requires PIPE-051                              │
│     │                                                                       │
│     ▼                                                                       │
│  6. TAG SKILLS & RESOURCES                                                  │
│     │                                                                       │
│     │  For each task:                                                      │
│     │  • Required skills: Python, USD, Houdini                             │
│     │  • Required tools: Houdini 20 license                                │
│     │  • Parallelization factor: 0.7                                       │
│     │                                                                       │
│     ▼                                                                       │
│  7. READY FOR TRACKING                                                      │
│                                                                             │
│     System now shows:                                                       │
│     • Tech tree visualization                                              │
│     • ETA calculations                                                     │
│     • Milestone progress                                                   │
│     • Worker allocation                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Ticket System Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TICKET SYSTEM INTEGRATION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐              ┌─────────────────┐                      │
│  │  TICKET SYSTEM  │              │   TECH TREE     │                      │
│  │  (ShotGrid/Jira)│              │     SYSTEM      │                      │
│  └────────┬────────┘              └────────┬────────┘                      │
│           │                                │                                │
│           │         AUTO-SYNC              │                                │
│           │◀────────────────────────────────▶                               │
│           │                                │                                │
│  ┌────────┴────────────────────────────────┴────────┐                      │
│  │                                                  │                      │
│  │  FROM TICKET SYSTEM:          FROM TECH TREE:   │                      │
│  │  ─────────────────────        ─────────────────  │                      │
│  │  • Task ID                    • Goal assignment │                      │
│  │  • Task name                  • Dependencies    │                      │
│  │  • Description                • Milestone links │                      │
│  │  • Status                     • Skills required │                      │
│  │  • Assignees                  • Priority        │                      │
│  │  • Due dates                                    │                      │
│  │  • Time tracking                                │                      │
│  │                                                  │                      │
│  └──────────────────────────────────────────────────┘                      │
│                                                                             │
│  SYNC RULES:                                                                │
│  • Ticket status changes → Task status updates                             │
│  • Worker assignment in ticket → Worker assignment in system               │
│  • New ticket created → Available as unlinked task                         │
│  • Task completed in system → Can update ticket status                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ENTITY RELATIONSHIP DIAGRAM                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐                                                           │
│  │   Company    │                                                           │
│  └──────┬───────┘                                                           │
│         │ 1:N                                                               │
│         ├─────────────────────────────────┐                                 │
│         │                                 │                                 │
│         ▼                                 ▼                                 │
│  ┌──────────────┐                  ┌──────────────┐                         │
│  │  Department  │                  │   Project    │                         │
│  └──────┬───────┘                  └──────┬───────┘                         │
│         │                                 │                                 │
│         │ 1:N                             │ 1:N                             │
│         ├──────────┐                      │                                 │
│         │          │                      │                                 │
│         ▼          │                      │                                 │
│  ┌──────────────┐  │                      │                                 │
│  │   Worker     │  │                      │                                 │
│  └──────┬───────┘  │                      │                                 │
│         │          │                      │                                 │
│         │ N:M      │                      │                                 │
│         │          ▼                      ▼                                 │
│         │   ┌─────────────────────────────────────┐                         │
│         │   │              Goal                   │                         │
│         │   │  (parent = Department OR Project)   │                         │
│         │   └──────────────────┬──────────────────┘                         │
│         │                      │                                            │
│         │                      │ 1:N                                        │
│         │                      ├──────────────────────┐                     │
│         │                      │                      │                     │
│         │                      ▼                      ▼                     │
│         │               ┌──────────────┐      ┌──────────────┐              │
│         │               │    Task      │      │  Milestone   │              │
│         │               └──────┬───────┘      └──────┬───────┘              │
│         │                      │                     │                      │
│         │      ┌───────────────┼─────────────────────┤                      │
│         │      │               │                     │                      │
│         │      │    ┌──────────┴──────────┐          │                      │
│         │      │    │                     │          │                      │
│         │      ▼    ▼                     ▼          ▼                      │
│         │   ┌─────────────┐         ┌─────────────────────┐                 │
│         └──▶│  Task       │         │  Task/Milestone     │                 │
│             │  Assignment │         │  Dependencies       │                 │
│             │  (Worker-   │         │  (N:M self-join)    │                 │
│             │   Task N:M) │         │                     │                 │
│             └─────────────┘         └─────────────────────┘                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix: Glossary

| Term | Definition |
|------|------------|
| **Company** | Top-level organization containing departments and projects |
| **Department** | Permanent team of workers with shared discipline (Pipeline, Lighting, FX) |
| **Project** | Temporary cross-functional effort with a deadline (a show, film, game) |
| **Goal** | Strategic objective containing tasks, owned by department or project |
| **Task** | Individual work item, sourced from ticket system |
| **Milestone** | Achievement unlocked when required tasks complete |
| **Worker** | Person who can be assigned to tasks |
| **Dependency** | Relationship where one item must complete before another can start |
| **Strategic Priority** | Company-wide importance level (P1-P4) |
| **Department Priority** | Ranking within a department's goals |
| **Worker Priority** | Personal ordering of assigned tasks |
| **ETA** | Estimated time to completion, calculated from workers and parallelization |
| **Parallelization Factor** | How well a task scales with multiple workers (0.0-1.0) |
| **Tech Tree** | Game-inspired visualization showing dependency paths |

---

*Document Version: 1.1*
*Last Updated: 2026*
