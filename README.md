# Task Tech Tree

A game-inspired tech tree UI for managing VFX production tasks, goals, milestones, and workers across departments and projects.

## Features

- **Tech Tree View** — React Flow-based directed acyclic graph with dagre auto-layout, custom task/milestone nodes, and dependency visualization
- **Dashboard** — Drill-down company overview with project/department cards, progress stats, and inline priority controls (P1/P2/P3)
- **Timeline** — Custom Gantt chart with dependency-based date scheduling, month axis, and today marker
- **Workers** — Worker list by department with active tasks, unlocks, and priority-sorted queue
- **Settings** — 5-dimension priority weight configuration with calibration wizard, lead list management, and formula preview

## Priority System

Five weighted dimensions scored 0–100:

| Factor | Input | Scale |
|--------|-------|-------|
| **Project** | Strategic priority (P1/P2/P3) | P1=100, P2=67, P3=33 |
| **Department** | Dept priority (P1/P2/P3) | P1=100, P2=67, P3=33 |
| **Goal** | Goal priority within dept (1–3) | 1=100, 2=67, 3=33 |
| **Creator** | Lead status of task creator | Lead=100, Other=50 |
| **Graph** | Dependency topology + critical path | 0–100 computed |

Weights are configurable via manual sliders or an 8-question calibration wizard. Tasks also support manual priority overrides.

## Data Model

```
Company → Department → Goal → Task / Milestone
Company → Project  → Goal → Task / Milestone
Department → Worker → assigned Tasks
```

All entities have bidirectional dependency links maintained atomically by the server.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Zustand, React Flow
- **Backend**: Express 5, better-sqlite3
- **State**: Optimistic mutations with polling-based sync (5s interval)

## Getting Started

```bash
npm install

# Run both frontend (Vite :5173) and backend (Express :3001)
npm run dev:all

# Or run individually
npm run dev          # Frontend only (proxies /api to :3001)
npm run server       # Backend only
```

## Commands

```bash
npm run dev:all      # Dev servers (frontend + backend)
npm run dev          # Frontend only
npm run server       # Backend only
npm run build        # tsc -b && vite build
npm run lint         # ESLint
npm run preview      # Preview production build
```

No test framework is configured. TypeScript type-checking (`tsc -b`) is the primary validation.
