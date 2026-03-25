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

### Three Dimensions of Priority

Priority operates at three independent but interacting levels:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PRIORITY DIMENSIONS                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ 1. STRATEGIC PRIORITY (Company/Leadership sets)                   │ │
│  │                                                                   │ │
│  │    "What matters most to the business"                            │ │
│  │                                                                   │ │
│  │    P1: CRITICAL   Production blockers, client deadlines          │ │
│  │    P2: HIGH       Important improvements, near-term needs        │ │
│  │    P3: MEDIUM     Scheduled work, nice to have                   │ │
│  │    P4: LOW        Backlog, when-we-have-time                     │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ 2. DEPARTMENT PRIORITY (Department head sets)                     │ │
│  │                                                                   │ │
│  │    "Within our team, what do we tackle first"                     │ │
│  │                                                                   │ │
│  │    • Ranking within department's own goals                        │ │
│  │    • Can reorder within same strategic tier                       │ │
│  │    • Considers team expertise and availability                    │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ 3. WORKER PRIORITY (Worker/Lead sets)                             │ │
│  │                                                                   │ │
│  │    "Among my assigned tasks, what do I focus on"                  │ │
│  │                                                                   │ │
│  │    • Personal queue ordering                                      │ │
│  │    • Active task selection                                        │ │
│  │    • Should align with strategic priority                         │ │
│  │                                                                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### How Priorities Interact

```
            STRATEGIC           DEPT              WORKER
            (Company)          (Head)            (Personal)
                │                │                  │
                ▼                ▼                  ▼
           ┌────────┐      ┌────────┐        ┌────────────┐
           │        │      │        │        │            │
Project A  │   P1   │      │   #1   │        │ ● Task 1   │ ← Active
└─ Goal X  │        │  ──▶ │   #2   │   ──▶  │   Task 3   │
   └─ Task 1        │      │        │        │   Task 7   │
   └─ Task 2        │      │        │        │            │
           │        │      │        │        │            │
Dept Goal Y│   P2   │      │   #1   │        │            │
└─ Task 3  │        │      │        │        │            │
           │        │      │        │        │            │
Dept Goal Z│   P3   │      │   #2   │        │            │
└─ Task 7  │        │      │        │        │            │
           └────────┘      └────────┘        └────────────┘

EFFECTIVE PRIORITY = f(Strategic, Dept Rank, Dependencies, Deadline)
```

### Priority Rules

| Rule | Description |
|------|-------------|
| **Strategic Override** | P1 tasks always surface to top of all views |
| **Tier Reordering** | Department can reorder within same strategic tier |
| **Worker Alignment** | Workers should activate P1 tasks before P3 tasks |
| **Mismatch Warning** | System warns if worker priority violates strategic |
| **Deadline Escalation** | Approaching deadline can auto-suggest priority bump |
| **Blocker Boost** | Tasks blocking many others get priority weight |

### Priority Mismatch Detection

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ⚠️  PRIORITY MISMATCH DETECTED                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Worker: Alice Chen                                                     │
│                                                                         │
│  Currently Active:                                                      │
│  └── Task: "Update USD Docs" (P3 - Low)                                │
│                                                                         │
│  Higher Priority Available:                                             │
│  └── Task: "Sublayer Caching" (P1 - Critical)                          │
│      └── Project: Dragon Quest (Deadline: 2 weeks)                     │
│                                                                         │
│  Recommendation: Switch active task to align with strategic priority   │
│                                                                         │
│  [Switch Now]  [Dismiss]  [Explain Reason]                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Priority Calculation

### Overview

Priority is calculated using a hybrid approach:
1. **Manual inputs** - Set by leadership/leads for strategic items
2. **Automatic calculation** - Derived by working backward from manual inputs

**Core Rule:** *The shorter the time required to unlock more items, the higher the priority.*

This means: Tasks that quickly unlock high-value downstream work should be done first.

### Manual vs Calculated

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MANUAL vs CALCULATED PRIORITY                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─── MANUALLY SET (by humans) ─────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  • Project strategic priority (P1-P4)                                │  │
│  │  • Project deadline                                                   │  │
│  │  • Milestone due dates                                                │  │
│  │  • Milestone value weight (optional, default = 1.0)                  │  │
│  │  • Goal strategic priority (inherits from project if not set)        │  │
│  │  • Task base duration (estimate)                                     │  │
│  │  • Task dependencies (what blocks what)                              │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│                              │                                              │
│                              ▼                                              │
│                    ┌─────────────────────┐                                  │
│                    │  BACKWARD           │                                  │
│                    │  PROPAGATION        │                                  │
│                    │  ALGORITHM          │                                  │
│                    └─────────────────────┘                                  │
│                              │                                              │
│                              ▼                                              │
│                                                                             │
│  ┌─── AUTOMATICALLY CALCULATED ─────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  • Task downstream impact score                                      │  │
│  │  • Task urgency factor (from deadlines)                              │  │
│  │  • Task effective priority score                                     │  │
│  │  • Recommended work order                                            │  │
│  │  • Critical path identification                                      │  │
│  │  • Bottleneck warnings                                               │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Priority Formula

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRIORITY SCORE FORMULA                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                     Downstream Impact  ×  Urgency Factor                    │
│  Priority Score = ─────────────────────────────────────────                 │
│                              ETA (days)                                     │
│                                                                             │
│                                                                             │
│  WHERE:                                                                     │
│                                                                             │
│  ┌─── Downstream Impact ────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  The total "value" this task helps unlock.                           │  │
│  │                                                                       │  │
│  │  Impact = Σ (child_value × contribution_weight)                      │  │
│  │                                                                       │  │
│  │  For each thing this task unlocks:                                   │  │
│  │  • Direct child task: inherits that task's impact (recursive)        │  │
│  │  • Milestone: uses milestone's value weight × strategic multiplier   │  │
│  │  • Partial contribution: divided by number of parents                │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─── Urgency Factor ───────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  How soon the downstream deadline is.                                │  │
│  │                                                                       │  │
│  │  Urgency = 1 + (urgency_boost / days_until_deadline)                 │  │
│  │                                                                       │  │
│  │  • No deadline: Urgency = 1.0 (neutral)                              │  │
│  │  • 30 days out: Urgency ≈ 1.3                                        │  │
│  │  • 7 days out:  Urgency ≈ 2.4                                        │  │
│  │  • 1 day out:   Urgency ≈ 11.0                                       │  │
│  │  • Overdue:     Urgency = MAX (capped at 20.0)                       │  │
│  │                                                                       │  │
│  │  Default urgency_boost = 10                                          │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─── ETA (Estimated Time to Complete) ─────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Based on current workers assigned.                                  │  │
│  │                                                                       │  │
│  │  ETA = base_duration / (workers ^ parallelization_factor)            │  │
│  │                                                                       │  │
│  │  If no workers assigned, use base_duration.                          │  │
│  │  Minimum ETA = 0.5 days (to avoid division issues)                   │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─── Strategic Multiplier ─────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  Converts P1-P4 to numeric weight:                                   │  │
│  │                                                                       │  │
│  │  P1 (Critical) = 8.0                                                 │  │
│  │  P2 (High)     = 4.0                                                 │  │
│  │  P3 (Medium)   = 2.0                                                 │  │
│  │  P4 (Low)      = 1.0                                                 │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Backward Propagation Algorithm

The algorithm works backward from milestones/goals to calculate task priorities:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BACKWARD PROPAGATION ALGORITHM                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 1: ASSIGN BASE VALUES TO ENDPOINTS                                    │
│  ────────────────────────────────────────                                   │
│                                                                             │
│  For each Milestone:                                                        │
│    base_value = milestone_weight × strategic_multiplier(parent_priority)   │
│    deadline = milestone.due_date OR parent_project.deadline                │
│                                                                             │
│  Example:                                                                   │
│    Milestone "USD Ready" under Project "Dragon Quest" (P1)                 │
│    base_value = 1.0 × 8.0 = 8.0                                            │
│    deadline = Apr 1                                                         │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  STEP 2: PROPAGATE VALUES BACKWARD                                          │
│  ─────────────────────────────────────                                      │
│                                                                             │
│  Working backward from milestones to their required tasks:                  │
│                                                                             │
│     ┌─────────┐      ┌─────────┐      ┌─────────────────┐                  │
│     │ Task A  │─────▶│ Task C  │─────▶│ ⭐ Milestone    │                  │
│     └─────────┘      └─────────┘      │   value = 8.0   │                  │
│     ┌─────────┐          │            │   deadline=Apr1 │                  │
│     │ Task B  │──────────┘            └─────────────────┘                  │
│     └─────────┘                                                             │
│                                                                             │
│  Task C: direct parent of milestone                                         │
│    contribution = 8.0 / 1 (only parent) = 8.0                              │
│    inherits deadline = Apr 1                                                │
│                                                                             │
│  Task A: parent of Task C                                                   │
│    contribution = 8.0 / 2 (shares with Task B) = 4.0                       │
│    inherits deadline = Apr 1 minus Task C duration                         │
│                                                                             │
│  Task B: parent of Task C                                                   │
│    contribution = 8.0 / 2 = 4.0                                            │
│    inherits deadline = Apr 1 minus Task C duration                         │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  STEP 3: AGGREGATE MULTIPLE DOWNSTREAM PATHS                                │
│  ────────────────────────────────────────────                               │
│                                                                             │
│  If a task unlocks multiple things, SUM all contributions:                  │
│                                                                             │
│     ┌─────────┐      ┌─────────┐                                           │
│     │ Task A  │─────▶│ Task B  │────▶ ⭐ Milestone 1 (value=8)             │
│     │         │      └─────────┘                                           │
│     │         │      ┌─────────┐                                           │
│     │         │─────▶│ Task C  │────▶ ⭐ Milestone 2 (value=4)             │
│     │         │      └─────────┘                                           │
│     │         │                                                             │
│     │         │─────▶ ⭐ Milestone 3 (value=2)                              │
│     └─────────┘                                                             │
│                                                                             │
│  Task A total impact:                                                       │
│    = (8.0 contribution from path to M1)                                    │
│    + (4.0 contribution from path to M2)                                    │
│    + (2.0 direct contribution to M3)                                       │
│    = 14.0                                                                   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  STEP 4: CALCULATE FINAL PRIORITY SCORE                                     │
│  ────────────────────────────────────────                                   │
│                                                                             │
│  For each task:                                                             │
│    downstream_impact = sum of all propagated values                        │
│    urgency = 1 + (10 / days_until_earliest_deadline)                       │
│    eta = base_duration / (workers ^ parallelization_factor)                │
│                                                                             │
│    priority_score = (downstream_impact × urgency) / eta                    │
│                                                                             │
│  Higher score = higher priority = do this first                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Contribution Weight Calculation

When a task has multiple parents, the contribution is divided:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONTRIBUTION WEIGHT RULES                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  RULE 1: SINGLE PARENT                                                      │
│  ─────────────────────                                                      │
│                                                                             │
│     ┌───────┐         ┌───────┐                                            │
│     │ TaskA │────────▶│ TaskB │                                            │
│     └───────┘         └───────┘                                            │
│                       value=10                                              │
│                                                                             │
│     Task A contribution = 10 / 1 = 10.0 (100%)                             │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  RULE 2: MULTIPLE PARENTS (EQUAL SPLIT)                                     │
│  ───────────────────────────────────────                                    │
│                                                                             │
│     ┌───────┐                                                               │
│     │ TaskA │────────┐                                                      │
│     └───────┘        │                                                      │
│                      ▼                                                      │
│     ┌───────┐   ┌───────┐                                                  │
│     │ TaskB │──▶│ TaskC │                                                  │
│     └───────┘   └───────┘                                                  │
│                 value=10                                                    │
│     ┌───────┐        ▲                                                      │
│     │ TaskD │────────┘                                                      │
│     └───────┘                                                               │
│                                                                             │
│     Each parent contribution = 10 / 3 = 3.33 (33% each)                    │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  RULE 3: WEIGHTED SPLIT BY DURATION (ADVANCED)                              │
│  ──────────────────────────────────────────────                             │
│                                                                             │
│  Shorter tasks get more credit (they unlock faster):                       │
│                                                                             │
│     ┌───────┐                                                               │
│     │ TaskA │ 2 days ──────┐                                               │
│     └───────┘              │                                                │
│                            ▼                                                │
│     ┌───────┐         ┌───────┐                                            │
│     │ TaskB │ 8 days ─│ TaskC │                                            │
│     └───────┘         └───────┘                                            │
│                       value=10                                              │
│                                                                             │
│     Weight A = 1/2 = 0.5                                                   │
│     Weight B = 1/8 = 0.125                                                 │
│     Total = 0.625                                                           │
│                                                                             │
│     Task A contribution = 10 × (0.5 / 0.625) = 8.0 (80%)                   │
│     Task B contribution = 10 × (0.125 / 0.625) = 2.0 (20%)                 │
│                                                                             │
│     "Shorter time to unlock more" = higher contribution ✓                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Complete Calculation Example

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE CALCULATION EXAMPLE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PROJECT: Dragon Quest                                                      │
│  Strategic Priority: P1 (multiplier = 8.0)                                 │
│  Deadline: Jun 1 (78 days away)                                            │
│                                                                             │
│  DEPENDENCY GRAPH:                                                          │
│                                                                             │
│     ┌───────────┐                                                           │
│     │ USD Setup │ 5 days                                                   │
│     │   (DONE)  │                                                           │
│     └─────┬─────┘                                                           │
│       ┌───┴───────────┐                                                     │
│       ▼               ▼                                                     │
│  ┌──────────┐   ┌──────────┐                                               │
│  │ Sublayer │   │  Asset   │                                               │
│  │ Caching  │   │ Resolver │                                               │
│  │ 10 days  │   │ 15 days  │                                               │
│  │ 👥2      │   │ 👥1      │                                               │
│  └────┬─────┘   └────┬─────┘                                               │
│       │              │                                                      │
│       └──────┬───────┘                                                      │
│              ▼                                                              │
│       ┌──────────────┐                                                      │
│       │ Shot Assembly│                                                      │
│       │   15 days    │                                                      │
│       │   (locked)   │                                                      │
│       └──────┬───────┘                                                      │
│              │                                                              │
│              ▼                                                              │
│       ┌──────────────┐                                                      │
│       │ ⭐ USD Ready │                                                      │
│       │  Milestone   │                                                      │
│       │ weight = 1.0 │                                                      │
│       │ due: Apr 15  │                                                      │
│       └──────────────┘                                                      │
│        (23 days away)                                                       │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  STEP 1: MILESTONE BASE VALUE                                               │
│  ─────────────────────────────                                              │
│                                                                             │
│  ⭐ USD Ready:                                                              │
│     base_value = weight(1.0) × strategic_multiplier(8.0) = 8.0             │
│     deadline = Apr 15 (23 days)                                            │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  STEP 2: BACKWARD PROPAGATION                                               │
│  ─────────────────────────────                                              │
│                                                                             │
│  Shot Assembly (1 parent of milestone):                                     │
│     downstream_impact = 8.0 / 1 = 8.0                                      │
│     inherited_deadline = Apr 15 - 15 days = Apr 1 (8 days away)            │
│                                                                             │
│  Using WEIGHTED SPLIT (Rule 3):                                            │
│     Sublayer Caching: 10 days → weight = 1/10 = 0.10                       │
│     Asset Resolver: 15 days → weight = 1/15 = 0.067                        │
│     Total weight = 0.167                                                    │
│                                                                             │
│  Sublayer Caching:                                                          │
│     contribution = 8.0 × (0.10 / 0.167) = 8.0 × 0.6 = 4.8                  │
│     inherited_deadline = Apr 1 - 10 days = Mar 22 (passed!)                │
│     ⚠️ URGENCY WARNING                                                      │
│                                                                             │
│  Asset Resolver:                                                            │
│     contribution = 8.0 × (0.067 / 0.167) = 8.0 × 0.4 = 3.2                 │
│     inherited_deadline = Apr 1 - 15 days = Mar 17 (passed!)                │
│     ⚠️ URGENCY WARNING                                                      │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  STEP 3: CALCULATE ETA                                                      │
│  ─────────────────────                                                      │
│                                                                             │
│  Sublayer Caching:                                                          │
│     base = 10 days, workers = 2, factor = 0.7                              │
│     ETA = 10 / (2 ^ 0.7) = 10 / 1.62 = 6.2 days                           │
│                                                                             │
│  Asset Resolver:                                                            │
│     base = 15 days, workers = 1, factor = 0.7                              │
│     ETA = 15 / (1 ^ 0.7) = 15.0 days                                       │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  STEP 4: CALCULATE URGENCY                                                  │
│  ─────────────────────────                                                  │
│                                                                             │
│  Sublayer Caching:                                                          │
│     inherited deadline passed → overdue                                    │
│     urgency = 20.0 (capped maximum)                                        │
│                                                                             │
│  Asset Resolver:                                                            │
│     inherited deadline passed → overdue                                    │
│     urgency = 20.0 (capped maximum)                                        │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  STEP 5: FINAL PRIORITY SCORES                                              │
│  ─────────────────────────────                                              │
│                                                                             │
│  Sublayer Caching:                                                          │
│     score = (4.8 × 20.0) / 6.2 = 96.0 / 6.2 = 15.5                        │
│                                                                             │
│  Asset Resolver:                                                            │
│     score = (3.2 × 20.0) / 15.0 = 64.0 / 15.0 = 4.3                       │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  RESULT: RECOMMENDED PRIORITY ORDER                                         │
│  ───────────────────────────────────                                        │
│                                                                             │
│  #1  Sublayer Caching    score=15.5  🔴 CRITICAL - add workers!           │
│  #2  Asset Resolver      score=4.3   🟠 HIGH - needs attention             │
│  #3  Shot Assembly       (locked)    🔒 Waiting on #1 and #2              │
│                                                                             │
│  💡 INSIGHT: Sublayer Caching scores higher because:                       │
│     - Higher weighted contribution (shorter task = 4.8 vs 3.2)            │
│     - Faster ETA (6.2 days vs 15.0 days)                                   │
│     - "Shorter time to unlock more" = higher priority ✓                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Priority Score Interpretation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRIORITY SCORE INTERPRETATION                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SCORE RANGES (typical)                                                     │
│  ──────────────────────                                                     │
│                                                                             │
│  Score > 10.0    🔴 CRITICAL    Do immediately, add workers                │
│  Score 5.0-10.0  🟠 HIGH        Prioritize this week                       │
│  Score 2.0-5.0   🟡 MEDIUM      Normal priority                            │
│  Score 0.5-2.0   🟢 LOW         Can wait                                   │
│  Score < 0.5     ⚪ MINIMAL     Do when available                          │
│                                                                             │
│  Note: Ranges depend on your milestone values and deadlines.               │
│  Calibrate based on your organization's data.                              │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  FACTORS THAT INCREASE SCORE                                                │
│  ────────────────────────────                                               │
│                                                                             │
│  ↑ Unlocks more downstream work (high impact)                              │
│  ↑ Downstream has high strategic priority (P1 > P4)                        │
│  ↑ Deadline approaching (urgency)                                          │
│  ↑ Task completes quickly (low ETA)                                        │
│  ↑ More workers assigned (faster ETA)                                      │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  FACTORS THAT DECREASE SCORE                                                │
│  ────────────────────────────                                               │
│                                                                             │
│  ↓ Unlocks little (dead end task)                                          │
│  ↓ Low strategic priority parent (P4)                                      │
│  ↓ No deadline or far deadline                                             │
│  ↓ Task takes long time (high ETA)                                         │
│  ↓ Few or no workers assigned                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Handling Special Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SPECIAL CASES                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CASE 1: TASK WITH NO DOWNSTREAM (Leaf Node)                                │
│  ───────────────────────────────────────────                                │
│                                                                             │
│  Some tasks don't unlock anything.                                         │
│                                                                             │
│  Solution: Assign minimum base impact = 0.5                                │
│  These naturally sort to bottom of priority list.                          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  CASE 2: CIRCULAR DEPENDENCIES (Error State)                                │
│  ───────────────────────────────────────────                                │
│                                                                             │
│  A → B → C → A  (impossible!)                                              │
│                                                                             │
│  Solution: Detect during propagation, flag as error.                       │
│  User must fix dependency graph before calculation works.                  │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  CASE 3: MULTIPLE PATHS TO SAME MILESTONE                                   │
│  ────────────────────────────────────────                                   │
│                                                                             │
│      ┌───┐     ┌───┐                                                       │
│      │ A │────▶│ C │────▶ ⭐                                               │
│      └───┘     └───┘                                                       │
│        │                 ▲                                                  │
│        └────────────────▶│  (A contributes via C AND directly)             │
│                                                                             │
│  Solution: Count each unique path once.                                    │
│  A's contribution = max(path_via_C, direct_path)                          │
│  Don't double-count same milestone.                                        │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  CASE 4: TASK ON CRITICAL PATH                                              │
│  ─────────────────────────────                                              │
│                                                                             │
│  Critical path = longest chain to deadline.                                │
│  Delaying any task on it delays final delivery.                            │
│                                                                             │
│  Solution: Add critical_path_bonus (e.g., 1.5× multiplier)                 │
│  Helps prioritize bottleneck tasks.                                        │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  CASE 5: LOCKED TASKS (Not Yet Available)                                   │
│  ────────────────────────────────────────                                   │
│                                                                             │
│  Locked tasks can't be worked on yet.                                      │
│                                                                             │
│  Solution: Still calculate score for planning:                             │
│  • Display separately from available tasks                                 │
│  • Show "unlocks when X completes"                                         │
│  • Use projected unlock date for urgency                                   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  CASE 6: COMPLETED TASKS                                                    │
│  ───────────────────────                                                    │
│                                                                             │
│  Completed tasks no longer need priority.                                  │
│                                                                             │
│  Solution:                                                                  │
│  • Exclude from active calculation                                         │
│  • Value already propagated to ancestors                                   │
│  • Mark as "✓" in visualization                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Recalculation Triggers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WHEN TO RECALCULATE PRIORITIES                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  AUTOMATIC TRIGGERS:                                                        │
│                                                                             │
│  • Task completed         → Unlock children, recalc affected subgraph      │
│  • Task status changed    → May affect urgency                             │
│  • Worker assigned/removed → ETA changes, recalc task                       │
│  • Daily schedule         → Urgency increases as deadlines approach        │
│  • Dependency added/removed → Graph structure changed                       │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  MANUAL TRIGGERS:                                                           │
│                                                                             │
│  • "Recalculate All" button                                                │
│  • After bulk edits                                                        │
│  • Strategic priority changed                                              │
│  • Deadline changed                                                         │
│  • Milestone weight changed                                                │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  OPTIMIZATION FOR LARGE GRAPHS:                                             │
│                                                                             │
│  • Cache propagated values in priority_cache table                         │
│  • Only recalculate affected subgraph on changes                          │
│  • Background worker for daily urgency updates                             │
│  • Debounce rapid changes (wait 5 sec before recalc)                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### UI Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PRIORITY IN UI VIEWS                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TECH TREE VIEW (A):                                                        │
│  ───────────────────                                                        │
│                                                                             │
│  • Node border color indicates priority score                              │
│  • Hover shows: "Priority: 15.5 (Critical)"                                │
│  • Critical path highlighted with thick line                               │
│  • Tooltip explains: "Unlocks 3 tasks + 1 milestone"                       │
│                                                                             │
│       ┌─────────────┐                                                       │
│       │ 🔴 Sublayer │  ← Red border = critical priority                    │
│       │   15.5      │                                                       │
│       │   👥2 6.2d  │                                                       │
│       └─────────────┘                                                       │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  DASHBOARD VIEW (B):                                                        │
│  ───────────────────                                                        │
│                                                                             │
│  • Sort goals by highest-priority task within them                         │
│  • Show "Top priority: Task X (score: 15.5)"                               │
│  • Warning badges: "⚠️ 3 tasks past inherited deadline"                    │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  TIMELINE VIEW (C):                                                         │
│  ─────────────────                                                          │
│                                                                             │
│  • Order rows by priority score (highest at top)                           │
│  • Color-code bars by priority level                                       │
│  • Show critical path as connected highlighted blocks                      │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  WORKER PERSONAL VIEW:                                                      │
│  ─────────────────────                                                      │
│                                                                             │
│  • Personal queue auto-sorted by calculated priority                       │
│  • Manual reorder allowed, but shows warning if out of order              │
│  • "Suggested: Task X (highest score in your queue)"                       │
│                                                                             │
│  ┌─── MY QUEUE (auto-sorted by priority) ────────────────────────────┐    │
│  │                                                                    │    │
│  │  #  Task                     Score   Status                       │    │
│  │  ── ───────────────────────  ──────  ────────────────────         │    │
│  │  1  Sublayer Caching         15.5    ● ACTIVE ✓                   │    │
│  │  2  Asset Resolver           4.3     ○ Available                  │    │
│  │  3  Deadline Templates       1.8     ○ Available                  │    │
│  │  4  Docs Update              0.4     ○ Available                  │    │
│  │                                                                    │    │
│  │  ✓ Your active task matches recommended priority                  │    │
│  │                                                                    │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

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
