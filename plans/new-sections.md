# Plan: Add New Sections to Cyclawps Dashboard

## Context

The dashboard has 3 sections (Tasks/Kanban, Chat, Agents). We're adding **Metrics**, **Pipelines** (with Schedules), and **Logs** as new top-level sections. Settings is deferred until there are enough settings to justify its own section — General Instructions stays in Agents for now.

The user requires single-source-of-truth: no logic, data, or components duplicated across sections.

---

## Section Layout

| Section | Route | Sidebar Icon | Notes |
|---|---|---|---|
| **Metrics** | `/metrics` | `BarChart2` | Token usage, run counts, by agent/model |
| **Pipelines** | `/pipelines` | `GitFork` | Pipeline config + running pipelines + Schedules tab |
| **Logs** | `/logs` | `ScrollText` | Global cross-task log viewer with filters |

**Net sidebar additions: 3.** Schedules is a tab inside Pipelines, not its own section.

### Logs: Two Views, One Data Source

- **Per-task logs** (kanban drawer "Logs" tab): Stays exactly as-is. Shows logs scoped to a single task. No changes to `TaskLogs.tsx`.
- **Global logs** (`/logs`): New top-level section. Shows all logs across all tasks. Filterable by task, agent, status, search text. Can drill into a specific task's logs — same data, broader scope.

Both read from the `task_logs` table. The global view has its own table-style UI (task column, agent column, timestamp, etc.) — intentionally different from the per-task chat-style rendering in the drawer. No shared UI components needed between them; they serve different purposes.

---

## Single Source of Truth Constraints

| Concern | Location | Consumers |
|---|---|---|
| `rowToTaskLog()` mapper | `apps/task-manager/src/db/log-writer.ts` (already exported) | Existing per-task log route + new global logs route |
| Metrics aggregation SQL | `apps/task-manager/src/routes/metrics.routes.ts` | No SQL in frontend |
| `PipelineEngine` instance | Single decoration on Fastify in `main.ts` | `pipeline.routes.ts` only |
| Agent execution | `AgentRunner.run()` | Schedule cron tick, manual trigger, existing agent invoke — all use the same method |
| `node-cron` scheduler | Single instance inside `registerScheduleRoutes()` | Nothing else |
| Per-task log rendering | `apps/kanban-board/src/components/TaskLogs.tsx` | Kanban drawer only — untouched |

**What we are NOT extracting to shared** (changed from original plan):
- `LogEntry`, `FormattedText`, `InlineSegment` stay private in `TaskLogs.tsx`. The global logs view uses a different table-style layout. If overlap emerges later, extract then.
- `AgentBadge` stays in `apps/kanban-board/`. The global logs view will import `ROLE_COLORS` and `formatRoleName` from `@app/shared` directly (those are already shared).
- `GeneralInstructionsEditor` stays in `ConfiguratorView.tsx`. Settings section is deferred.

---

## Phase 0: Shared Types + Dependency Install

### 0.1 — Add new types to `libs/shared/src/types/`

**New file:** `libs/shared/src/types/schedule.types.ts`
```ts
export interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  agentRole: string;
  prompt: string;
  isActive: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  createdAt: number;
  updatedAt: number;
}
```

**New file:** `libs/shared/src/types/metrics.types.ts`
```ts
export interface MetricsSummary {
  totalRuns: number;
  totalTokens: number;
  completedRuns: number;
  failedRuns: number;
  avgDurationMs: number;
}

export interface MetricsByAgent {
  agentRole: string;
  model: string;          // current model from agent_configs
  totalRuns: number;
  totalTokens: number;
  completedRuns: number;
  failedRuns: number;
}

export interface MetricsByModel {
  model: string;
  totalRuns: number;
  totalTokens: number;
}
```

**Modify:** `libs/shared/src/index.ts` — export both new type files.

### 0.2 — Install `node-cron`

```bash
pnpm add node-cron
pnpm add -D @types/node-cron
```

---

## Phase 1: Database Migration

File: `apps/task-manager/src/db/migrate.ts` (use existing guard pattern)
Also add to `apps/task-manager/src/db/schema.ts` for fresh installs.

### 1.1 — New `scheduled_tasks` table

```sql
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  agent_role TEXT NOT NULL,
  prompt TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER DEFAULT NULL,
  next_run_at INTEGER DEFAULT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_agent_role ON scheduled_tasks(agent_role);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_is_active ON scheduled_tasks(is_active);
```

### 1.2 — Add `model` column to `agent_runs`

The `agent_runs` table currently tracks `agent_role` but not which model was actually used. Since agents can change models over time (config edits or `AGENT_<ROLE>_MODEL` env override), historical runs would be misattributed in metrics. Capture the actual model at execution time.

```sql
-- Migration (existing table):
ALTER TABLE agent_runs ADD COLUMN model TEXT DEFAULT NULL;

-- Also update schema.ts for fresh installs
```

**Modify `AgentRunner.run()`** to write the resolved model into `agent_runs.model` when creating the run record.

### 1.3 — Performance indexes for metrics

```sql
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON agent_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_model ON agent_runs(model);
```

---

## Phase 2: Backend Routes

All new files in `apps/task-manager/src/routes/`. All registered in `apps/task-manager/src/main.ts`.

### 2.1 — `metrics.routes.ts` (new file)

```
GET /api/metrics/summary     → totals from agent_runs; optional ?since=<ms timestamp>
GET /api/metrics/by-agent    → GROUP BY agent_role; optional ?since=
GET /api/metrics/by-model    → GROUP BY model (from agent_runs.model column); optional ?since=
```

The `by-model` route now reads from `agent_runs.model` directly — no join to `agent_configs` needed, no misattribution of historical runs.

### 2.2 — `global-logs.routes.ts` (new file)

```
GET /api/logs → cross-task log query
  Query params: search?, agentRole?, status?, taskGuid?, limit=50, offset=0
  Returns: { logs: TaskLog[], total: number }
```

Imports and reuses `rowToTaskLog()` from `log-writer.ts`. Returns `total` count for pagination.

### 2.3 — Complete stubs in `pipeline.routes.ts` (existing file)

Two stubs currently return placeholder JSON. Replace with real implementations:

**`POST /api/pipeline/start`** — accepts `{ taskId }`:
1. Looks up the active pipeline config from `pipeline_configs`
2. Calls `fastify.pipelineEngine.executePipeline(taskId)` (runs async, doesn't block)
3. Returns `{ started: true, taskId }`

**`POST /api/pipeline/authorize`** — accepts `{ taskId, stageId, approved }`:
1. Emits `pipeline:authorize` on the socket with `{ taskId, stageId, approved }`
2. The existing `AuthorizationGate.waitForAuthorization()` in `pipeline-engine.ts` resolves on this event
3. Returns `{ authorized: approved, taskId, stageId }`

**Required wiring in `main.ts`:**
- Instantiate `PipelineEngine` with `db`, `io`, and `agentRunner`
- Decorate: `fastify.decorate('pipelineEngine', pipelineEngine)`
- Pass to pipeline routes registration

### 2.4 — `schedules.routes.ts` (new file)

```
GET    /api/schedules              → list all scheduled tasks
POST   /api/schedules              → create (validates cron expression)
PUT    /api/schedules/:id          → update (reschedules if cron changed)
DELETE /api/schedules/:id          → delete (stops cron job)
POST   /api/schedules/:id/run      → manual trigger now
```

**Scheduler lifecycle:**
- On server startup, load all `is_active=1` rows and register with `node-cron`
- On create/update: validate cron expression, schedule/reschedule
- On delete or deactivate: stop the cron job
- Cron tick handler: creates a new task via existing task creation logic, then calls `agentRunner.run()` — same execution path as manual agent invocation
- Single `Map<string, ScheduledTask>` tracks active cron jobs — no duplication

### 2.5 — Register new routes in `main.ts`

Add to `apps/task-manager/src/main.ts`:
```ts
import { registerMetricsRoutes } from './routes/metrics.routes.js';
import { registerGlobalLogsRoutes } from './routes/global-logs.routes.js';
import { registerScheduleRoutes } from './routes/schedules.routes.js';

// After existing route registrations:
registerMetricsRoutes(fastify);
registerGlobalLogsRoutes(fastify);
registerScheduleRoutes(fastify);
```

---

## Phase 3: Frontend — New Apps

Each new section is a separate app following the established pattern (same scaffold as `apps/agent-configurator/`).

### 3.1 — `apps/metrics-dashboard/` (port 4203)

**Scaffold files:** `package.json`, `project.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `index.html`, `src/main.tsx`

**Component tree:**
```
MetricsDashboard.tsx              (layout + time period state)
  ├─ TimePeriodSelector.tsx       (Today / 7d / 30d / All → computes ?since= timestamp)
  ├─ SummaryCards.tsx             (total runs, tokens, success rate, avg duration)
  ├─ UsageByAgentTable.tsx        (table: agent role, model, runs, tokens, success/fail)
  └─ UsageByModelTable.tsx        (table: model name, total runs, total tokens)
```

**Hooks:**
- `hooks/useMetrics.ts` — three React Query hooks (`useMetricsSummary`, `useMetricsByAgent`, `useMetricsByModel`), each accepting `since?: number`

### 3.2 — `apps/pipeline-viewer/` (port 4204)

**Component tree:**
```
PipelineViewer.tsx                (layout with tab bar: Pipelines | Schedules)
  ├─ PipelinesTab.tsx
  │    ├─ PipelineConfigPanel.tsx  (GET /api/pipeline; renders stages as a flow diagram)
  │    ├─ StageCard.tsx            (single stage: agent, auto-transition flag, status)
  │    ├─ RunControls.tsx          (start pipeline: select task → POST /api/pipeline/start)
  │    └─ AuthorizationBanner.tsx  (listens for pipeline:auth_required WS; approve/deny buttons)
  └─ SchedulesTab.tsx
       ├─ ScheduleList.tsx         (table of all schedules, toggle active, manual run button)
       └─ ScheduleForm.tsx         (create/edit form: name, cron expression, agent, prompt)
```

**Hooks:**
- `hooks/usePipelineConfig.ts` — React Query, `GET /api/pipeline`
- `hooks/usePipelineEvents.ts` — WebSocket listener for `pipeline:stage`, `pipeline:completed`, `pipeline:auth_required`
- `hooks/useSchedules.ts` — React Query CRUD for `/api/schedules`

**UX flow for starting a pipeline:**
1. User sees the pipeline stages in the config panel
2. User clicks "Run Pipeline" → selects an existing task (or creates one) from a dropdown
3. `POST /api/pipeline/start { taskId }` kicks off execution
4. `RunningPipelineList` shows live stage progress via WebSocket events
5. If a stage requires authorization, `AuthorizationBanner` appears with approve/deny

### 3.3 — `apps/logs-viewer/` (port 4205)

**Component tree:**
```
GlobalLogsView.tsx                (layout)
  ├─ LogFilters.tsx               (search input, agent dropdown, status dropdown, task dropdown)
  ├─ LogTable.tsx                 (table: timestamp, task, agent, action, status, details)
  │    └─ LogRow.tsx              (single row, expandable for full details + metadata)
  └─ Pagination.tsx               (page controls using total from API)
```

**Hooks:**
- `hooks/useGlobalLogs.ts` — React Query, `GET /api/logs`; subscribes to `task:log` WebSocket event for real-time updates (invalidates query on new log)

**Key UX:** Clicking a task name in the log table navigates to `/kanban/<guid>` (deep link to that task). This connects the global view back to the per-task context.

---

## Phase 4: Wire into Dashboard

### 4.1 — `tsconfig.base.json` — add path aliases
```json
"@app/metrics/*": ["apps/metrics-dashboard/src/*"],
"@app/pipelines/*": ["apps/pipeline-viewer/src/*"],
"@app/logs/*": ["apps/logs-viewer/src/*"]
```

### 4.2 — `apps/dashboard/vite.config.ts`

Add to `resolve.alias`:
```ts
'@app/metrics': path.join(ROOT, 'apps/metrics-dashboard/src'),
'@app/pipelines': path.join(ROOT, 'apps/pipeline-viewer/src'),
'@app/logs': path.join(ROOT, 'apps/logs-viewer/src'),
```

### 4.3 — `apps/dashboard/src/App.tsx` — add routes

```tsx
<Route path="/metrics"   element={<ErrorBoundary><MetricsView /></ErrorBoundary>} />
<Route path="/pipelines" element={<ErrorBoundary><PipelinesView /></ErrorBoundary>} />
<Route path="/logs"      element={<ErrorBoundary><LogsView /></ErrorBoundary>} />
```

**New view files in `apps/dashboard/src/views/`:**
- `MetricsView.tsx` — imports `MetricsDashboard` from `@app/metrics/components/MetricsDashboard`
- `PipelinesView.tsx` — imports `PipelineViewer` from `@app/pipelines/components/PipelineViewer`
- `LogsView.tsx` — imports `GlobalLogsView` from `@app/logs/components/GlobalLogsView`

### 4.4 — `apps/dashboard/src/components/Sidebar.tsx`

Add 3 new `<NavLink>` entries after the existing 3. Import new Lucide icons:
```tsx
import { LayoutGrid, MessageSquare, Bot, BarChart2, GitFork, ScrollText } from 'lucide-react';
```

| Route | Icon | Label |
|---|---|---|
| `/metrics` | `BarChart2` | Metrics |
| `/pipelines` | `GitFork` | Pipelines |
| `/logs` | `ScrollText` | Logs |

### 4.5 — `apps/dashboard/src/components/Header.tsx`

Extend route-to-title mapping:
```ts
if (path.startsWith('/metrics'))   return 'Metrics';
if (path.startsWith('/pipelines')) return 'Pipelines';
if (path.startsWith('/logs'))      return 'Logs';
```

---

## Implementation Order

Each step is a vertical slice (backend + frontend together). Wire into dashboard as each slice completes so we can verify incrementally.

1. **Phase 0** — Shared types + `pnpm add node-cron`
2. **Phase 1** — DB migrations (`scheduled_tasks` table, `agent_runs.model` column, indexes)
3. **Phase 2.1 + 3.1 + wire** — Metrics (routes + app + sidebar link) — first visible slice
4. **Phase 2.2 + 3.3 + wire** — Logs (global route + app + sidebar link)
5. **Phase 2.3 + 3.2 + wire** — Pipelines (complete stubs + viewer app + sidebar link)
6. **Phase 2.4 + schedules tab** — Schedules (routes + tab inside pipeline viewer)
7. **Phase 2.5** — Register all routes in `main.ts`

Step 7 is last because route registration is trivial and can batch all at once, but individual routes can also be registered incrementally as each slice is built.

---

## Critical Files

| File | Change |
|---|---|
| `libs/shared/src/index.ts` | Export new schedule + metrics types |
| `apps/task-manager/src/db/schema.ts` | Add `scheduled_tasks` table, `model` column on `agent_runs`, new indexes |
| `apps/task-manager/src/db/migrate.ts` | Migration for `scheduled_tasks`, `ALTER TABLE agent_runs ADD COLUMN model`, indexes |
| `apps/task-manager/src/orchestrator/agent-runner.ts` | Write resolved model to `agent_runs.model` on run creation |
| `apps/task-manager/src/main.ts` | Register 3 new route files; decorate `pipelineEngine` |
| `apps/task-manager/src/routes/pipeline.routes.ts` | Complete start + authorize stubs |
| `apps/dashboard/src/App.tsx` | 3 new routes |
| `apps/dashboard/src/components/Sidebar.tsx` | 3 new nav links |
| `apps/dashboard/src/components/Header.tsx` | 3 new title mappings |
| `apps/dashboard/vite.config.ts` | 3 new aliases |
| `tsconfig.base.json` | 3 new path aliases |

**Files NOT modified** (changed from original plan):
- `TaskLogs.tsx` — untouched, per-task logs stay as-is
- `AgentBadge.tsx` — stays in kanban-board, not extracted
- `ConfiguratorView.tsx` — General Instructions stays here, no Settings section
- `agents.routes.ts` — settings endpoints stay here for now

---

## Verification

1. `pnpm nx serve task-manager` — backend starts, migrations run, no errors
2. `curl localhost:3000/api/metrics/summary` — returns `{ totalRuns: 0, totalTokens: 0, ... }`
3. `curl localhost:3000/api/logs` — returns `{ logs: [], total: 0 }`
4. `curl localhost:3000/api/schedules` — returns `[]`
5. `curl localhost:3000/api/pipeline` — returns active config (or null)
6. `pnpm nx serve dashboard` — 6 sidebar icons visible (3 existing + 3 new)
7. Navigate `/metrics` — summary cards render with zero state
8. Navigate `/logs` — empty table with filters, no errors
9. Navigate `/pipelines` — config panel loads; Schedules tab switches correctly
10. Create a schedule in Schedules tab — appears in list, `next_run_at` populated
11. Deep link: click a task in global logs → navigates to `/kanban/<guid>`
