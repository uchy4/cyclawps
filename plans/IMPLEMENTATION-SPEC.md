# Cyclawps Feature Implementation Spec

## Overview

This document is a complete implementation specification for four interconnected features in the Cyclawps project. It is written for a Claude AI agent session with full codebase access. Follow the phases in order — each phase builds on the previous one.

**Features:**

1. **Customizable Kanban Columns/Statuses** — Replace the 4 hardcoded statuses with user-defined, dynamic columns
2. **Task Templates** — Reusable starting points for creating tasks, fully editable after instantiation
3. **Agent Workflow Graph** — Visual React Flow node editor where agents are nodes and edges define conditional task routing
4. **Configurable Agent Roles** — Remove all hardcoded role assumptions; roles are fully user-configurable

**Tech Stack (do not change):**
- Nx 22.6.1 monorepo
- React 19 + React Router 7 + Vite (frontend apps)
- Fastify 5.8 (backend)
- SQLite via `better-sqlite3` (database)
- Socket.io 4.8.3 (real-time)
- Tailwind CSS 4 (styling)
- `@dnd-kit/core` (drag-and-drop in kanban)
- `@tanstack/react-query` (data fetching)
- `uuid` for ID generation
- `js-yaml` for YAML parsing

**Conventions:**
- All IDs are UUIDs generated with `v4 as uuid` from the `uuid` package
- Timestamps are `Date.now()` (Unix milliseconds as integers)
- Database uses snake_case columns; TypeScript uses camelCase properties
- Row-to-model conversion functions handle the mapping (e.g., `rowToTask`, `rowToAgentConfig`)
- All routes are registered via `register*Routes(fastify)` functions called in `main.ts`
- WebSocket events are typed via `ServerToClientEvents` and `ClientToServerEvents` in `libs/shared/src/ws-events.ts`
- Shared types go in `libs/shared/src/types/`, exported via `libs/shared/src/index.ts`
- Run all nx commands via the workspace package manager: `pnpm nx <command>`

---

## Current State Reference

### Project Structure

```
apps/
  dashboard/          # React shell app (Header, Sidebar, routes)
  kanban-board/       # Kanban board UI (Board, Column, TaskCard, TaskEditor)
  task-manager/       # Fastify backend (routes, orchestrator, db)
  agent-configurator/ # Agent setup UI (AgentEditor, AgentWizard, AgentList)
  chat-client/        # Chat interface
  desktop/            # Electron wrapper
libs/
  shared/             # Types, constants, ws-events, hooks (useSocket), components (Drawer, Modal)
  agents/             # Agent loader, seed, base-agent invocation, MCP server
agents/               # YAML seed files (developer.agent.yaml, architect.agent.yaml, etc.)
```

### Current Task Type (`libs/shared/src/types/task.types.ts`)

```typescript
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked';
export type TaskPriority = number;

export interface Task {
  id: string;
  guid: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedAgent: string | null;
  pipelineStageId: string | null;
  parentTaskId: string | null;
  priority: TaskPriority;
  sortOrder: number;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  assignedAgent?: string;
  parentTaskId?: string;
  priority?: number;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  assignedAgent?: string | null;
  pipelineStageId?: string | null;
  priority?: number;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
}
```

### Current Agent Type (`libs/shared/src/types/agent.types.ts`)

```typescript
export type AgentRole = string; // already dynamic

export interface AgentConfig {
  id: string;
  role: string;
  name: string;
  displayName: string | null;
  description: string;
  systemPrompt: string;
  model: string;
  apiKeyEnv: string;
  maxTurns: number;
  tools: string[];
  loggingEnabled: boolean;
  accentColor: string | null;
  cooldown: number;
  isSeeded: boolean;
  createdAt: number;
  updatedAt: number;
}
```

### Current Database Schema (`apps/task-manager/src/db/schema.ts`)

The `CREATE_TABLES_SQL` export contains all table creation SQL. Key tables:

- `tasks` — has `CHECK(status IN ('todo', 'in_progress', 'done', 'blocked'))` constraint ← **this must be removed**
- `agent_configs` — stores agent configuration (already has `accent_color` column)
- `agent_runs` — tracks agent execution history
- `task_logs` — audit trail
- `messages`, `threads`, `thread_participants`, `thread_tasks` — chat system
- `pipeline_configs` — stores pipeline YAML
- `app_settings` — key-value settings

### Current Hardcoded Status References

These are all the places where the 4 statuses are hardcoded:

1. **`libs/shared/src/types/task.types.ts`** line 1: `type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked'`
2. **`apps/task-manager/src/db/schema.ts`** line 8: `CHECK(status IN ('todo', 'in_progress', 'done', 'blocked'))`
3. **`apps/kanban-board/src/components/Board.tsx`** lines 24-29: `COLUMNS` array with 4 hardcoded columns
4. **`apps/kanban-board/src/components/TaskEditor.tsx`** lines 4-9: `STATUSES` array with 4 options
5. **`apps/task-manager/src/db/seed-tasks.ts`**: Seed data uses the 4 statuses
6. **`apps/task-manager/src/orchestrator/pipeline-engine.ts`** lines 128-129, 141-142: Hardcodes `'blocked'` and `'done'` status strings

### Current Hardcoded Role Color References

1. **`libs/shared/src/constants.ts`** lines 21-29: `ROLE_COLORS` static map
2. **`apps/kanban-board/src/components/AgentBadge.tsx`** line 1: imports `ROLE_COLORS`
3. **`apps/agent-configurator/src/components/AgentEditor.tsx`** line 3: imports `ROLE_COLORS`
4. **`libs/agents/src/seed.ts`** lines 53-59: `DEFAULT_ACCENT_COLORS` map
5. **`apps/task-manager/src/db/migrate.ts`** lines 57-63: Hardcoded color backfill map

### Current WebSocket Events (`libs/shared/src/ws-events.ts`)

```typescript
export interface ServerToClientEvents {
  'task:created': (data: { task: Task }) => void;
  'task:updated': (data: { task: Task }) => void;
  'task:deleted': (data: { taskId: string }) => void;
  'task:log': (data: { log: TaskLog }) => void;
  'message:new': (data: { message: Message }) => void;
  'message:reaction': (data: { messageId: string; reaction: Reaction; action: 'add' | 'remove' }) => void;
  'agent:status': (data: { role: string; status: AgentRunStatus; taskId?: string }) => void;
  'agent:streaming': (data: { role: string; taskId: string; chunk: string }) => void;
  'pipeline:stage': (data: { taskId: string; stageId: string; status: PipelineRunStatus }) => void;
  'pipeline:auth_required': (data: { taskId: string; stageId: string; description: string }) => void;
  'pipeline:completed': (data: { taskId: string }) => void;
  'thread:created': (data: { thread: Thread }) => void;
  'thread:updated': (data: { thread: Thread }) => void;
  'thread:deleted': (data: { threadId: string }) => void;
  'thread:participant_added': (data: { threadId: string; participant: ThreadParticipant }) => void;
  'thread:participant_removed': (data: { threadId: string; agentRole: string }) => void;
  'thread:task_tagged': (data: { threadId: string; tag: ThreadTaskTag }) => void;
  'thread:task_untagged': (data: { threadId: string; taskId: string }) => void;
  'message:edited': (data: { messageId: string; content: string }) => void;
  'message:deleted': (data: { messageId: string }) => void;
}

export interface ClientToServerEvents {
  'message:send': (data: { content: string; taskId?: string; threadId?: string; inReplyTo?: string; attachments?: Attachment[]; agentRole?: string }) => void;
  'message:react': (data: { messageId: string; emoji: string }) => void;
  'message:edit': (data: { messageId: string; content: string }) => void;
  'message:delete': (data: { messageId: string }) => void;
  'pipeline:authorize': (data: { taskId: string; stageId: string; approved: boolean }) => void;
}
```

### Server Entry Point (`apps/task-manager/src/main.ts`)

Routes are registered in this order:
```typescript
registerTaskRoutes(fastify);
registerMessageRoutes(fastify);
registerThreadRoutes(fastify);
registerPipelineRoutes(fastify);
registerAgentRoutes(fastify);
registerTranscribeRoutes(fastify);
registerLogRoutes(fastify);
registerArchiveRoutes(fastify);
```

Seeds are called:
```typescript
seedAgents(db, agentsDir);
seedTasks(db);
seedMessages(db);
seedThreads(db);
```

Fastify is decorated with `db`, `io`, `agentRunner`, and `dispatcher`.

---

## Phase 0: Foundation — Types, Schema, Migration

### 0.1 New Type File: `libs/shared/src/types/status.types.ts`

Create this new file:

```typescript
export interface TaskStatusConfig {
  id: string;
  name: string;       // e.g., 'todo', 'in_review', 'deployed'
  label: string;      // e.g., 'To Do', 'In Review', 'Deployed'
  color: string;      // hex color, e.g., '#58a6ff'
  order: number;      // display order in kanban (0-indexed)
  isDefault: boolean; // if true, new tasks default to this status
  createdAt: number;
  updatedAt: number;
}

export interface CreateStatusInput {
  name: string;
  label: string;
  color: string;
  order?: number;
  isDefault?: boolean;
}

export interface UpdateStatusInput {
  label?: string;
  color?: string;
  order?: number;
  isDefault?: boolean;
}

export const DEFAULT_STATUSES: Omit<TaskStatusConfig, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'todo', label: 'To Do', color: '#8b949e', order: 0, isDefault: true },
  { name: 'in_progress', label: 'In Progress', color: '#58a6ff', order: 1, isDefault: false },
  { name: 'blocked', label: 'Blocked', color: '#f85149', order: 2, isDefault: false },
  { name: 'done', label: 'Done', color: '#3fb950', order: 3, isDefault: false },
];
```

### 0.2 New Type File: `libs/shared/src/types/template.types.ts`

```typescript
export interface TemplateField {
  id: string;
  templateId: string;
  fieldName: string;      // key in task metadata
  fieldType: 'text' | 'number' | 'select' | 'checkbox';
  label: string;          // display label
  defaultValue: string;   // serialized default
  options: string[];      // for 'select' type — choices
  required: boolean;
  order: number;
}

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  titlePattern: string;       // e.g., '[BUG] {summary}' — user fills in {summary}
  defaultDescription: string;
  defaultStatus: string;      // status name (dynamic now)
  defaultPriority: number;
  fields: TemplateField[];    // custom metadata fields
  isBuiltIn: boolean;         // shipped with app
  createdAt: number;
  updatedAt: number;
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  titlePattern: string;
  defaultDescription?: string;
  defaultStatus?: string;
  defaultPriority?: number;
  fields?: Array<Omit<TemplateField, 'id' | 'templateId'>>;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  titlePattern?: string;
  defaultDescription?: string;
  defaultStatus?: string;
  defaultPriority?: number;
  fields?: Array<Omit<TemplateField, 'id' | 'templateId'>>;
}
```

### 0.3 New Type File: `libs/shared/src/types/workflow.types.ts`

```typescript
export type WorkflowNodeType = 'agent' | 'condition' | 'start' | 'end';

export interface WorkflowNodeData {
  agentRole?: string;        // for 'agent' type
  label: string;
  description?: string;
  // For condition nodes:
  conditionField?: string;   // e.g., 'status', 'priority', 'metadata.category'
  conditionOperator?: 'equals' | 'not_equals' | 'gt' | 'lt' | 'contains';
  conditionValue?: string;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;              // node ID
  target: string;              // node ID
  sourceHandle?: string;       // for condition nodes: 'true' | 'false'
  label?: string;              // display label on edge
  conditionLabel?: string;     // e.g., 'status == done'
}

export interface WorkflowGraph {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  nodes: Omit<WorkflowNode, 'id'>[];
  edges: Omit<WorkflowEdge, 'id'>[];
}

export interface UpdateWorkflowInput {
  name?: string;
  description?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  isActive?: boolean;
}
```

### 0.4 Update `libs/shared/src/types/task.types.ts`

Change `TaskStatus` from a union to a string:

```typescript
// BEFORE:
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked';

// AFTER:
export type TaskStatus = string;
```

Everything else in the file stays the same. The `CreateTaskInput` and `UpdateTaskInput` interfaces already use `TaskStatus` so they'll automatically accept any string.

### 0.5 Update `libs/shared/src/index.ts`

Add the new exports:

```typescript
export * from './types/task.types.js';
export * from './types/message.types.js';
export * from './types/thread.types.js';
export * from './types/pipeline.types.js';
export * from './types/agent.types.js';
export * from './types/log.types.js';
export * from './types/status.types.js';       // NEW
export * from './types/template.types.js';     // NEW
export * from './types/workflow.types.js';      // NEW
export * from './constants.js';
export * from './ws-events.js';
export { useSocket } from './hooks/useSocket.js';
export { Drawer } from './components/Drawer.js';
export { Modal } from './components/Modal.js';
export { ErrorBoundary } from './components/ErrorBoundary.js';
export { Skeleton } from './components/Skeleton.js';
```

### 0.6 Update `libs/shared/src/ws-events.ts`

Add new events to `ServerToClientEvents`:

```typescript
// Add these to the ServerToClientEvents interface:
'status:created': (data: { status: TaskStatusConfig }) => void;
'status:updated': (data: { status: TaskStatusConfig }) => void;
'status:deleted': (data: { statusId: string }) => void;
'status:list': (data: { statuses: TaskStatusConfig[] }) => void;
'template:created': (data: { template: TaskTemplate }) => void;
'template:updated': (data: { template: TaskTemplate }) => void;
'template:deleted': (data: { templateId: string }) => void;
'workflow:created': (data: { workflow: WorkflowGraph }) => void;
'workflow:updated': (data: { workflow: WorkflowGraph }) => void;
'workflow:deleted': (data: { workflowId: string }) => void;
'workflow:execution:started': (data: { workflowId: string; taskId: string }) => void;
'workflow:execution:node': (data: { workflowId: string; taskId: string; nodeId: string; status: 'running' | 'completed' | 'failed' }) => void;
'workflow:execution:completed': (data: { workflowId: string; taskId: string }) => void;
```

Import the new types at the top of the file:

```typescript
import type { TaskStatusConfig } from './types/status.types.js';
import type { TaskTemplate } from './types/template.types.js';
import type { WorkflowGraph } from './types/workflow.types.js';
```

### 0.7 Database Schema Changes

#### Remove the CHECK constraint from `tasks` table

In `apps/task-manager/src/db/schema.ts`, change the tasks table definition:

```sql
-- BEFORE:
status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done', 'blocked')),

-- AFTER:
status TEXT NOT NULL DEFAULT 'todo',
```

#### Add new tables to `CREATE_TABLES_SQL`

Append these tables to the `CREATE_TABLES_SQL` template string in `schema.ts`:

```sql
CREATE TABLE IF NOT EXISTS task_statuses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  color TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_statuses_order ON task_statuses("order");

CREATE TABLE IF NOT EXISTS task_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  title_pattern TEXT NOT NULL,
  default_description TEXT DEFAULT '',
  default_status TEXT DEFAULT 'todo',
  default_priority INTEGER DEFAULT 0,
  is_built_in INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS template_fields (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK(field_type IN ('text', 'number', 'select', 'checkbox')),
  label TEXT NOT NULL,
  default_value TEXT DEFAULT '',
  options TEXT DEFAULT '[]',
  required INTEGER NOT NULL DEFAULT 0,
  "order" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_template_fields_template_id ON template_fields(template_id);

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  graph_json TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 0.8 Migration for Existing Databases

In `apps/task-manager/src/db/migrate.ts`, add these migration blocks at the end of `runMigrations()` (before the stale runs cleanup):

```typescript
// ─── Phase 0: Dynamic statuses ───────────────────────────────
if (!tableExists(db, 'task_statuses')) {
  console.log('Creating task_statuses table...');
  db.exec(`CREATE TABLE IF NOT EXISTS task_statuses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    color TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_task_statuses_order ON task_statuses("order")');

  // Seed default statuses
  const now = Date.now();
  const insertStatus = db.prepare(
    'INSERT INTO task_statuses (id, name, label, color, "order", is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  insertStatus.run(uuid(), 'todo', 'To Do', '#8b949e', 0, 1, now, now);
  insertStatus.run(uuid(), 'in_progress', 'In Progress', '#58a6ff', 1, 0, now, now);
  insertStatus.run(uuid(), 'blocked', 'Blocked', '#f85149', 2, 0, now, now);
  insertStatus.run(uuid(), 'done', 'Done', '#3fb950', 3, 0, now, now);
  console.log('Seeded 4 default task statuses.');
}

// Remove CHECK constraint from tasks.status (SQLite requires table recreation)
// Check if the CHECK constraint still exists by inspecting table SQL
const taskTableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get() as { sql: string })?.sql || '';
if (taskTableSql.includes("CHECK(status IN")) {
  console.log('Removing status CHECK constraint from tasks table...');
  db.exec('PRAGMA foreign_keys=OFF');
  db.exec(`CREATE TABLE tasks_new (
    id TEXT PRIMARY KEY,
    guid TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'todo',
    assigned_agent TEXT,
    pipeline_stage_id TEXT,
    parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata TEXT DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.exec('INSERT INTO tasks_new SELECT id, guid, title, description, status, assigned_agent, pipeline_stage_id, parent_task_id, priority, sort_order, metadata, created_at, updated_at FROM tasks');
  db.exec('DROP TABLE tasks');
  db.exec('ALTER TABLE tasks_new RENAME TO tasks');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_agent)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_guid ON tasks(guid)');
  db.exec('PRAGMA foreign_keys=ON');
  console.log('Status CHECK constraint removed.');
}

// ─── Phase 0: Task templates ───────────────────────────────
if (!tableExists(db, 'task_templates')) {
  console.log('Creating task_templates and template_fields tables...');
  db.exec(`CREATE TABLE IF NOT EXISTS task_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    title_pattern TEXT NOT NULL,
    default_description TEXT DEFAULT '',
    default_status TEXT DEFAULT 'todo',
    default_priority INTEGER DEFAULT 0,
    is_built_in INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS template_fields (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK(field_type IN ('text', 'number', 'select', 'checkbox')),
    label TEXT NOT NULL,
    default_value TEXT DEFAULT '',
    options TEXT DEFAULT '[]',
    required INTEGER NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_template_fields_template_id ON template_fields(template_id)');

  // Seed built-in templates
  const now = Date.now();
  const insertTemplate = db.prepare(
    'INSERT INTO task_templates (id, name, description, title_pattern, default_description, default_status, default_priority, is_built_in, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
  );
  const insertField = db.prepare(
    'INSERT INTO template_fields (id, template_id, field_name, field_type, label, default_value, options, required, "order") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  // Bug Report template
  const bugId = uuid();
  insertTemplate.run(bugId, 'Bug Report', 'Report a bug with reproduction steps', '[BUG] {summary}', 'Steps to reproduce:\n1. \n2. \n\nExpected behavior:\n\nActual behavior:\n', 'todo', 8, now, now);
  insertField.run(uuid(), bugId, 'severity', 'select', 'Severity', 'medium', JSON.stringify(['low', 'medium', 'high', 'critical']), 1, 0);
  insertField.run(uuid(), bugId, 'browser', 'text', 'Browser / Environment', '', '[]', 0, 1);

  // Feature Request template
  const featureId = uuid();
  insertTemplate.run(featureId, 'Feature Request', 'Propose a new feature', '[FEATURE] {summary}', 'User Story:\nAs a [user type], I want [goal] so that [benefit].\n\nAcceptance Criteria:\n- [ ] \n', 'todo', 5, now, now);

  // Code Review template
  const reviewId = uuid();
  insertTemplate.run(reviewId, 'Code Review', 'Request a code review', '[REVIEW] {summary}', 'PR/Branch:\n\nChanges:\n\nAreas of concern:\n', 'todo', 6, now, now);
  insertField.run(uuid(), reviewId, 'pr_url', 'text', 'PR URL', '', '[]', 1, 0);

  // Documentation template
  const docId = uuid();
  insertTemplate.run(docId, 'Documentation', 'Create or update documentation', '[DOCS] {summary}', 'Section:\n\nCurrent state:\n\nProposed changes:\n', 'todo', 3, now, now);

  console.log('Seeded 4 built-in task templates.');
}

// ─── Phase 0: Workflows ───────────────────────────────
if (!tableExists(db, 'workflows')) {
  console.log('Creating workflows table...');
  db.exec(`CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    graph_json TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
}
```

Make sure to add `import { v4 as uuid } from 'uuid'` at the top of `migrate.ts` if not already there.

---

## Phase 1: Customizable Kanban Columns/Statuses

### 1.1 Backend: `apps/task-manager/src/routes/statuses.routes.ts` (NEW FILE)

```typescript
import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import type { TaskStatusConfig, CreateStatusInput, UpdateStatusInput } from '@app/shared';

function rowToStatus(row: Record<string, unknown>): TaskStatusConfig {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    label: row['label'] as string,
    color: row['color'] as string,
    order: row['order'] as number,
    isDefault: !!(row['is_default'] as number),
    createdAt: row['created_at'] as number,
    updatedAt: row['updated_at'] as number,
  };
}

export function registerStatusRoutes(fastify: FastifyInstance): void {
  const db = fastify.db;
  const io = fastify.io;

  // List all statuses (ordered)
  fastify.get('/api/statuses', async () => {
    const rows = db.prepare('SELECT * FROM task_statuses ORDER BY "order" ASC').all();
    return rows.map((r) => rowToStatus(r as Record<string, unknown>));
  });

  // Create a new status
  fastify.post('/api/statuses', async (request, reply) => {
    const input = request.body as CreateStatusInput;
    if (!input.name || !input.label || !input.color) {
      return reply.code(400).send({ error: 'name, label, and color are required' });
    }

    // Ensure name is unique
    const existing = db.prepare('SELECT id FROM task_statuses WHERE name = ?').get(input.name);
    if (existing) return reply.code(409).send({ error: 'Status name already exists' });

    // Auto-assign order if not provided
    const maxOrder = (db.prepare('SELECT MAX("order") as m FROM task_statuses').get() as { m: number | null })?.m ?? -1;
    const order = input.order ?? maxOrder + 1;

    const now = Date.now();
    const id = uuid();

    db.prepare(
      'INSERT INTO task_statuses (id, name, label, color, "order", is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, input.name, input.label, input.color, order, input.isDefault ? 1 : 0, now, now);

    const status = rowToStatus(db.prepare('SELECT * FROM task_statuses WHERE id = ?').get(id) as Record<string, unknown>);
    io?.emit('status:created', { status });
    return status;
  });

  // Update a status
  fastify.patch('/api/statuses/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as UpdateStatusInput;
    const existing = db.prepare('SELECT * FROM task_statuses WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'Status not found' });

    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.label !== undefined) { fields.push('label = ?'); values.push(input.label); }
    if (input.color !== undefined) { fields.push('color = ?'); values.push(input.color); }
    if (input.order !== undefined) { fields.push('"order" = ?'); values.push(input.order); }
    if (input.isDefault !== undefined) {
      // If setting as default, unset all others first
      if (input.isDefault) {
        db.prepare('UPDATE task_statuses SET is_default = 0').run();
      }
      fields.push('is_default = ?');
      values.push(input.isDefault ? 1 : 0);
    }

    if (fields.length === 0) return reply.code(400).send({ error: 'No fields to update' });

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    db.prepare(`UPDATE task_statuses SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const status = rowToStatus(db.prepare('SELECT * FROM task_statuses WHERE id = ?').get(id) as Record<string, unknown>);
    io?.emit('status:updated', { status });
    return status;
  });

  // Reorder statuses (batch update)
  fastify.put('/api/statuses/reorder', async (request) => {
    const { order } = request.body as { order: string[] }; // array of status IDs in desired order
    const now = Date.now();
    const update = db.prepare('UPDATE task_statuses SET "order" = ?, updated_at = ? WHERE id = ?');

    for (let i = 0; i < order.length; i++) {
      update.run(i, now, order[i]);
    }

    const rows = db.prepare('SELECT * FROM task_statuses ORDER BY "order" ASC').all();
    const statuses = rows.map((r) => rowToStatus(r as Record<string, unknown>));
    io?.emit('status:list', { statuses });
    return statuses;
  });

  // Delete a status
  fastify.delete('/api/statuses/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = db.prepare('SELECT * FROM task_statuses WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) return reply.code(404).send({ error: 'Status not found' });

    // Check if any tasks use this status
    const statusName = existing['name'] as string;
    const taskCount = (db.prepare('SELECT COUNT(*) as cnt FROM tasks WHERE status = ?').get(statusName) as { cnt: number }).cnt;
    if (taskCount > 0) {
      return reply.code(409).send({
        error: `Cannot delete status "${statusName}" — ${taskCount} task(s) currently use it. Reassign them first.`,
      });
    }

    db.prepare('DELETE FROM task_statuses WHERE id = ?').run(id);
    io?.emit('status:deleted', { statusId: id });
    return { success: true };
  });
}
```

### 1.2 Register the Route in `main.ts`

In `apps/task-manager/src/main.ts`, add:

```typescript
import { registerStatusRoutes } from './routes/statuses.routes.js';
// ... then in main():
registerStatusRoutes(fastify);
```

### 1.3 Frontend Hook: `apps/kanban-board/src/hooks/useStatuses.ts` (NEW FILE)

```typescript
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@app/shared';
import type { TaskStatusConfig } from '@app/shared';

const STATUSES_KEY = ['statuses'];

async function fetchStatuses(): Promise<TaskStatusConfig[]> {
  const res = await fetch('/api/statuses');
  if (!res.ok) throw new Error('Failed to fetch statuses');
  return res.json();
}

export function useStatuses() {
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  const { data: statuses = [], isLoading } = useQuery({
    queryKey: STATUSES_KEY,
    queryFn: fetchStatuses,
  });

  useEffect(() => {
    if (!socket) return;
    const invalidate = () => queryClient.invalidateQueries({ queryKey: STATUSES_KEY });

    socket.on('status:created', invalidate);
    socket.on('status:updated', invalidate);
    socket.on('status:deleted', invalidate);
    socket.on('status:list', invalidate);

    return () => {
      socket.off('status:created', invalidate);
      socket.off('status:updated', invalidate);
      socket.off('status:deleted', invalidate);
      socket.off('status:list', invalidate);
    };
  }, [socket, queryClient]);

  return { statuses, loading: isLoading };
}
```

### 1.4 Update `apps/kanban-board/src/components/Board.tsx`

Replace the hardcoded `COLUMNS` array with dynamic statuses from the hook.

**Key changes:**

1. Remove the `COLUMNS` const and `COLUMN_STATUSES` set
2. Import `useStatuses` hook
3. Build columns from `statuses` data
4. Update `tasksByStatus` to use dynamic statuses
5. Update collision detection and drag handlers to use dynamic status names

```typescript
// Remove these lines:
// const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [...]
// const COLUMN_STATUSES = new Set(COLUMNS.map((c) => c.status));

// Add import:
import { useStatuses } from '../hooks/useStatuses.js';

// In the Board component, add:
const { statuses, loading: statusesLoading } = useStatuses();

// Replace the COLUMN_STATUSES set with:
const columnStatuses = useMemo(() => new Set(statuses.map((s) => s.name)), [statuses]);

// Replace tasksByStatus:
const tasksByStatus = useMemo(() => {
  const map: Record<string, Task[]> = {};
  for (const s of statuses) {
    map[s.name] = tasks.filter((t) => t.status === s.name);
  }
  return map;
}, [tasks, statuses]);

// Update handleDragEnd to use columnStatuses instead of COLUMN_STATUSES:
// Replace: COLUMN_STATUSES.has(rawOverId as TaskStatus)
// With: columnStatuses.has(rawOverId)

// Update the render to use dynamic statuses:
{statuses.map((col) => (
  <div key={col.name} className="flex-1 min-w-[280px] first:pl-0 last:pr-0 flex flex-col h-full overflow-hidden">
    <Column
      status={col.name}
      label={col.label}
      color={col.color}
      tasks={tasksByStatus[col.name] || []}
      onClickTask={handleEditTask}
      onCreateTask={handleNewTask}
    />
  </div>
))}

// Update loading state to wait for both:
if (loading || statusesLoading) { ... }
```

### 1.5 Update `apps/kanban-board/src/components/Column.tsx`

Change the `ColumnProps` interface to accept `string` for status instead of `TaskStatus`:

```typescript
interface ColumnProps {
  status: string;        // was TaskStatus
  label: string;
  color: string;
  tasks: Task[];
  onClickTask: (task: Task) => void;
  onCreateTask: (status: string) => void;  // was TaskStatus
}
```

### 1.6 Update `apps/kanban-board/src/components/TaskEditor.tsx`

Replace the hardcoded `STATUSES` array with data from the `useStatuses` hook:

```typescript
// Remove the hardcoded STATUSES array (lines 4-9)
// Add import:
import { useStatuses } from '../hooks/useStatuses.js';

// Inside the component:
const { statuses } = useStatuses();

// Update the status dropdown:
<select ...>
  {statuses.map((s) => (
    <option key={s.name} value={s.name}>{s.label}</option>
  ))}
</select>
```

Also update `TaskEditorProps` to accept `string` for `defaultStatus`:

```typescript
interface TaskEditorProps {
  task: Task | null;
  defaultStatus?: string;  // was TaskStatus
  onSave: (id: string | null, data: CreateTaskInput) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onClose: () => void;
}
```

### 1.7 Status Manager UI: `apps/kanban-board/src/components/StatusManager.tsx` (NEW FILE)

Create a modal/drawer component for managing statuses. It should:

- List all current statuses with their colors and labels
- Allow adding a new status (name, label, color picker)
- Allow editing existing statuses (label, color)
- Allow reordering via drag or up/down buttons
- Allow deleting statuses (with warning if tasks use it)
- Include a color picker (either native `<input type="color">` or preset swatches)
- Add a button in the Board header or a settings gear icon to open this manager

Use the same styling patterns as the rest of the app: `bg-zinc-800`, `border-zinc-700`, `text-white`, orange accent (`bg-orange-600`, `text-orange-400`), Tailwind utility classes.

### 1.8 Seed Statuses on Startup

In `apps/task-manager/src/db/seed-tasks.ts`, the `seedTasks` function can remain as-is. The migration in Phase 0 already seeds the default 4 statuses.

Add a new `seedStatuses` function if needed for resilience, or just let the migration handle it.

---

## Phase 2: Task Templates

### 2.1 Backend: `apps/task-manager/src/routes/templates.routes.ts` (NEW FILE)

```typescript
import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import type { TaskTemplate, TemplateField, CreateTemplateInput, UpdateTemplateInput } from '@app/shared';

function rowToTemplate(row: Record<string, unknown>, fields: TemplateField[]): TaskTemplate {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    description: (row['description'] as string) || '',
    titlePattern: row['title_pattern'] as string,
    defaultDescription: (row['default_description'] as string) || '',
    defaultStatus: (row['default_status'] as string) || 'todo',
    defaultPriority: (row['default_priority'] as number) || 0,
    fields,
    isBuiltIn: !!(row['is_built_in'] as number),
    createdAt: row['created_at'] as number,
    updatedAt: row['updated_at'] as number,
  };
}

function rowToField(row: Record<string, unknown>): TemplateField {
  return {
    id: row['id'] as string,
    templateId: row['template_id'] as string,
    fieldName: row['field_name'] as string,
    fieldType: row['field_type'] as TemplateField['fieldType'],
    label: row['label'] as string,
    defaultValue: (row['default_value'] as string) || '',
    options: JSON.parse((row['options'] as string) || '[]'),
    required: !!(row['required'] as number),
    order: row['order'] as number,
  };
}

function loadTemplateFields(db: any, templateId: string): TemplateField[] {
  const rows = db.prepare('SELECT * FROM template_fields WHERE template_id = ? ORDER BY "order" ASC').all(templateId);
  return rows.map((r: any) => rowToField(r));
}

export function registerTemplateRoutes(fastify: FastifyInstance): void {
  const db = fastify.db;
  const io = fastify.io;

  // List all templates
  fastify.get('/api/templates', async () => {
    const rows = db.prepare('SELECT * FROM task_templates ORDER BY name ASC').all();
    return rows.map((r: any) => {
      const fields = loadTemplateFields(db, r.id);
      return rowToTemplate(r, fields);
    });
  });

  // Get single template
  fastify.get('/api/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id);
    if (!row) return reply.code(404).send({ error: 'Template not found' });
    const fields = loadTemplateFields(db, id);
    return rowToTemplate(row as Record<string, unknown>, fields);
  });

  // Create template
  fastify.post('/api/templates', async (request) => {
    const input = request.body as CreateTemplateInput;
    const now = Date.now();
    const id = uuid();

    db.prepare(
      'INSERT INTO task_templates (id, name, description, title_pattern, default_description, default_status, default_priority, is_built_in, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)'
    ).run(id, input.name, input.description || '', input.titlePattern, input.defaultDescription || '', input.defaultStatus || 'todo', input.defaultPriority || 0, now, now);

    // Insert fields
    if (input.fields && input.fields.length > 0) {
      const insertField = db.prepare(
        'INSERT INTO template_fields (id, template_id, field_name, field_type, label, default_value, options, required, "order") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const field of input.fields) {
        insertField.run(uuid(), id, field.fieldName, field.fieldType, field.label, field.defaultValue || '', JSON.stringify(field.options || []), field.required ? 1 : 0, field.order || 0);
      }
    }

    const fields = loadTemplateFields(db, id);
    const template = rowToTemplate(db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id) as Record<string, unknown>, fields);
    io?.emit('template:created', { template });
    return template;
  });

  // Update template
  fastify.patch('/api/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as UpdateTemplateInput;
    const existing = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'Template not found' });

    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
    if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description); }
    if (input.titlePattern !== undefined) { fields.push('title_pattern = ?'); values.push(input.titlePattern); }
    if (input.defaultDescription !== undefined) { fields.push('default_description = ?'); values.push(input.defaultDescription); }
    if (input.defaultStatus !== undefined) { fields.push('default_status = ?'); values.push(input.defaultStatus); }
    if (input.defaultPriority !== undefined) { fields.push('default_priority = ?'); values.push(input.defaultPriority); }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(Date.now());
      values.push(id);
      db.prepare(`UPDATE task_templates SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    // Replace fields if provided
    if (input.fields !== undefined) {
      db.prepare('DELETE FROM template_fields WHERE template_id = ?').run(id);
      const insertField = db.prepare(
        'INSERT INTO template_fields (id, template_id, field_name, field_type, label, default_value, options, required, "order") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const field of input.fields) {
        insertField.run(uuid(), id, field.fieldName, field.fieldType, field.label, field.defaultValue || '', JSON.stringify(field.options || []), field.required ? 1 : 0, field.order || 0);
      }
    }

    const updatedFields = loadTemplateFields(db, id);
    const template = rowToTemplate(db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id) as Record<string, unknown>, updatedFields);
    io?.emit('template:updated', { template });
    return template;
  });

  // Delete template
  fastify.delete('/api/templates/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = db.prepare('DELETE FROM task_templates WHERE id = ?').run(id);
    if (result.changes === 0) return reply.code(404).send({ error: 'Template not found' });
    io?.emit('template:deleted', { templateId: id });
    return { success: true };
  });

  // Instantiate a task from a template
  fastify.post('/api/templates/:id/instantiate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { fieldValues, title: overrideTitle } = request.body as {
      fieldValues?: Record<string, string>;
      title?: string;
    };

    const row = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id);
    if (!row) return reply.code(404).send({ error: 'Template not found' });

    const templateRow = row as Record<string, unknown>;
    const fields = loadTemplateFields(db, id);

    // Build title from pattern
    let title = overrideTitle || (templateRow['title_pattern'] as string);
    if (fieldValues) {
      for (const [key, value] of Object.entries(fieldValues)) {
        title = title.replace(`{${key}}`, value);
      }
    }
    // Remove any unfilled placeholders
    title = title.replace(/\{[^}]+\}/g, '').trim();

    // Build metadata from field values
    const metadata: Record<string, unknown> = { templateId: id };
    if (fieldValues) {
      for (const field of fields) {
        if (fieldValues[field.fieldName] !== undefined) {
          metadata[field.fieldName] = fieldValues[field.fieldName];
        } else if (field.defaultValue) {
          metadata[field.fieldName] = field.defaultValue;
        }
      }
    }

    // Create the task via the existing task creation logic
    // (Redirect internally to avoid duplicating logic)
    const taskInput = {
      title,
      description: templateRow['default_description'] as string,
      status: templateRow['default_status'] as string,
      priority: templateRow['default_priority'] as number,
      metadata,
    };

    // Import nextGuid and create task directly
    const { nextGuid } = await import('../db/guid.js');
    const taskId = (await import('uuid')).v4();
    const guid = nextGuid(db);
    const now = Date.now();

    db.prepare(
      `INSERT INTO tasks (id, guid, title, description, status, assigned_agent, parent_task_id, priority, sort_order, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(taskId, guid, taskInput.title, taskInput.description, taskInput.status, null, null, taskInput.priority, 0, JSON.stringify(taskInput.metadata), now, now);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    // Use the rowToTask pattern from tasks.routes.ts
    const createdTask = {
      id: (task as any).id,
      guid: (task as any).guid,
      title: (task as any).title,
      description: (task as any).description,
      status: (task as any).status,
      assignedAgent: (task as any).assigned_agent || null,
      pipelineStageId: (task as any).pipeline_stage_id || null,
      parentTaskId: (task as any).parent_task_id || null,
      priority: (task as any).priority,
      sortOrder: (task as any).sort_order,
      metadata: JSON.parse((task as any).metadata || '{}'),
      createdAt: (task as any).created_at,
      updatedAt: (task as any).updated_at,
    };
    io?.emit('task:created', { task: createdTask });
    return createdTask;
  });
}
```

### 2.2 Register the Route in `main.ts`

```typescript
import { registerTemplateRoutes } from './routes/templates.routes.js';
// ... then:
registerTemplateRoutes(fastify);
```

### 2.3 Frontend Hook: `apps/kanban-board/src/hooks/useTemplates.ts` (NEW FILE)

Same pattern as `useStatuses` — fetch from `/api/templates`, subscribe to Socket.io events `template:created`, `template:updated`, `template:deleted`.

### 2.4 Template Library UI: `apps/kanban-board/src/components/TemplateLibrary.tsx` (NEW FILE)

Create a modal that:
- Lists all templates in a grid (similar to AgentList's card grid)
- Each card shows: template name, description, field count badge, "Built-in" badge if applicable
- Clicking a template opens a form with the template's fields pre-populated
- The form dynamically renders fields based on `fieldType` (text input, number input, select dropdown, checkbox)
- Submit creates a task via `POST /api/templates/:id/instantiate`
- Add a button in the kanban board header to open the library (e.g., "New from Template" button next to the board title)

### 2.5 Template Editor UI: `apps/agent-configurator/src/components/TemplateEditor.tsx` (NEW FILE)

Create an editor (in the configurator app) for creating/editing templates. It should have:
- Name, description, title pattern fields
- Default status dropdown (from `useStatuses`)
- Default priority slider/input
- Dynamic field builder: add/remove/reorder custom fields
  - Each field: name, label, type dropdown, default value, options (for select type), required checkbox
- Save/Update/Delete buttons

### 2.6 Add Navigation Route

In `apps/dashboard/src/App.tsx`, add a route for templates if desired:

```typescript
<Route path="/templates" element={<ErrorBoundary><TemplatesView /></ErrorBoundary>} />
```

Or integrate template management into the configurator view alongside agents.

---

## Phase 3: Agent Workflow Graph

### 3.1 Install React Flow

```bash
pnpm add @xyflow/react
```

React Flow v12+ is published under `@xyflow/react`. This is the package to install.

### 3.2 Backend: `apps/task-manager/src/routes/workflows.routes.ts` (NEW FILE)

```typescript
import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import type { WorkflowGraph, WorkflowNode, WorkflowEdge, CreateWorkflowInput, UpdateWorkflowInput } from '@app/shared';

function rowToWorkflow(row: Record<string, unknown>): WorkflowGraph {
  const graph = JSON.parse((row['graph_json'] as string) || '{"nodes":[],"edges":[]}');
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    description: (row['description'] as string) || '',
    nodes: graph.nodes || [],
    edges: graph.edges || [],
    isActive: !!(row['is_active'] as number),
    createdAt: row['created_at'] as number,
    updatedAt: row['updated_at'] as number,
  };
}

export function registerWorkflowRoutes(fastify: FastifyInstance): void {
  const db = fastify.db;
  const io = fastify.io;

  // List all workflows
  fastify.get('/api/workflows', async () => {
    const rows = db.prepare('SELECT * FROM workflows ORDER BY created_at DESC').all();
    return rows.map((r) => rowToWorkflow(r as Record<string, unknown>));
  });

  // Get single workflow
  fastify.get('/api/workflows/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
    if (!row) return reply.code(404).send({ error: 'Workflow not found' });
    return rowToWorkflow(row as Record<string, unknown>);
  });

  // Create workflow
  fastify.post('/api/workflows', async (request) => {
    const input = request.body as CreateWorkflowInput;
    const now = Date.now();
    const id = uuid();

    // Assign IDs to nodes and edges
    const nodes: WorkflowNode[] = input.nodes.map((n) => ({ ...n, id: uuid() }));
    const edges: WorkflowEdge[] = input.edges.map((e) => ({ ...e, id: uuid() }));

    const graphJson = JSON.stringify({ nodes, edges });

    db.prepare(
      'INSERT INTO workflows (id, name, description, graph_json, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
    ).run(id, input.name, input.description || '', graphJson, now, now);

    const workflow = rowToWorkflow(db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as Record<string, unknown>);
    io?.emit('workflow:created', { workflow });
    return workflow;
  });

  // Update workflow
  fastify.patch('/api/workflows/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as UpdateWorkflowInput;
    const existing = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
    if (!existing) return reply.code(404).send({ error: 'Workflow not found' });

    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
    if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description); }
    if (input.isActive !== undefined) { fields.push('is_active = ?'); values.push(input.isActive ? 1 : 0); }
    if (input.nodes !== undefined || input.edges !== undefined) {
      const currentGraph = JSON.parse(((existing as Record<string, unknown>)['graph_json'] as string) || '{"nodes":[],"edges":[]}');
      const graphJson = JSON.stringify({
        nodes: input.nodes ?? currentGraph.nodes,
        edges: input.edges ?? currentGraph.edges,
      });
      fields.push('graph_json = ?');
      values.push(graphJson);
    }

    if (fields.length === 0) return reply.code(400).send({ error: 'No fields to update' });

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    db.prepare(`UPDATE workflows SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const workflow = rowToWorkflow(db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as Record<string, unknown>);
    io?.emit('workflow:updated', { workflow });
    return workflow;
  });

  // Delete workflow
  fastify.delete('/api/workflows/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = db.prepare('DELETE FROM workflows WHERE id = ?').run(id);
    if (result.changes === 0) return reply.code(404).send({ error: 'Workflow not found' });
    io?.emit('workflow:deleted', { workflowId: id });
    return { success: true };
  });

  // Execute a workflow for a task
  fastify.post('/api/workflows/:id/execute', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { taskId } = request.body as { taskId: string };

    const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
    if (!workflow) return reply.code(404).send({ error: 'Workflow not found' });
    if (!taskId) return reply.code(400).send({ error: 'taskId is required' });

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
    if (!task) return reply.code(404).send({ error: 'Task not found' });

    // Execute asynchronously
    const graph = rowToWorkflow(workflow as Record<string, unknown>);
    fastify.workflowEngine?.execute(graph, taskId).catch((err: Error) => {
      console.error(`Workflow execution failed:`, err);
    });

    return { message: 'Workflow execution started', workflowId: id, taskId };
  });
}
```

### 3.3 Register in `main.ts`

```typescript
import { registerWorkflowRoutes } from './routes/workflows.routes.js';
import { WorkflowEngine } from './orchestrator/workflow-engine.js';

// After creating agentRunner:
const workflowEngine = new WorkflowEngine(db, io, agentRunner);
fastify.decorate('workflowEngine', workflowEngine);

// Register routes:
registerWorkflowRoutes(fastify);
```

### 3.4 Workflow Engine: `apps/task-manager/src/orchestrator/workflow-engine.ts` (NEW FILE)

```typescript
import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents, WorkflowGraph, WorkflowNode, WorkflowEdge } from '@app/shared';
import { AgentRunner } from './agent-runner.js';

export class WorkflowEngine {
  private db: Database.Database;
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private agentRunner: AgentRunner;

  constructor(
    db: Database.Database,
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    agentRunner: AgentRunner
  ) {
    this.db = db;
    this.io = io;
    this.agentRunner = agentRunner;
  }

  /**
   * Execute a workflow graph for a task.
   * Starts from the 'start' node and follows edges, executing agent nodes along the way.
   */
  async execute(workflow: WorkflowGraph, taskId: string): Promise<void> {
    const { nodes, edges } = workflow;

    // Build adjacency: nodeId -> outgoing edges
    const adjacency = new Map<string, WorkflowEdge[]>();
    for (const edge of edges) {
      const existing = adjacency.get(edge.source) || [];
      existing.push(edge);
      adjacency.set(edge.source, existing);
    }

    // Find start node
    const startNode = nodes.find((n) => n.type === 'start');
    if (!startNode) {
      console.error('Workflow has no start node');
      return;
    }

    this.io.emit('workflow:execution:started', { workflowId: workflow.id, taskId });

    let currentNodeId: string | null = startNode.id;

    while (currentNodeId) {
      const node = nodes.find((n) => n.id === currentNodeId);
      if (!node) break;

      if (node.type === 'end') {
        this.io.emit('workflow:execution:completed', { workflowId: workflow.id, taskId });
        return;
      }

      if (node.type === 'agent') {
        const agentRole = node.data.agentRole;
        if (!agentRole) {
          console.error(`Agent node ${node.id} has no agentRole`);
          this.io.emit('workflow:execution:node', { workflowId: workflow.id, taskId, nodeId: node.id, status: 'failed' });
          return;
        }

        this.io.emit('workflow:execution:node', { workflowId: workflow.id, taskId, nodeId: node.id, status: 'running' });

        const result = await this.agentRunner.run(agentRole, taskId);

        this.io.emit('workflow:execution:node', {
          workflowId: workflow.id, taskId, nodeId: node.id,
          status: result.success ? 'completed' : 'failed',
        });

        if (!result.success) return;
      }

      if (node.type === 'condition') {
        // Evaluate condition against current task state
        const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown>;
        if (!task) return;

        const { conditionField, conditionOperator, conditionValue } = node.data;
        const taskValue = this.getTaskFieldValue(task, conditionField || 'status');
        const conditionMet = this.evaluateCondition(taskValue, conditionOperator || 'equals', conditionValue || '');

        // Find edge matching the condition result
        // Condition nodes have two source handles: 'true' and 'false'
        const outEdges = adjacency.get(node.id) || [];
        const matchingEdge = outEdges.find((e) => e.sourceHandle === String(conditionMet));
        currentNodeId = matchingEdge?.target || null;
        continue;
      }

      // Move to next node via edge
      const outEdges = adjacency.get(node.id) || [];
      if (outEdges.length === 0) {
        // No outgoing edges — workflow complete
        this.io.emit('workflow:execution:completed', { workflowId: workflow.id, taskId });
        return;
      }

      // For non-condition nodes, take the first (only) edge
      currentNodeId = outEdges[0].target;
    }

    this.io.emit('workflow:execution:completed', { workflowId: workflow.id, taskId });
  }

  private getTaskFieldValue(task: Record<string, unknown>, field: string): string {
    // Handle nested metadata fields like 'metadata.category'
    if (field.startsWith('metadata.')) {
      const metaKey = field.slice(9);
      const metadata = JSON.parse((task['metadata'] as string) || '{}');
      return String(metadata[metaKey] ?? '');
    }
    // Map camelCase field names to snake_case DB columns
    const columnMap: Record<string, string> = {
      status: 'status',
      priority: 'priority',
      assignedAgent: 'assigned_agent',
      title: 'title',
    };
    const column = columnMap[field] || field;
    return String(task[column] ?? '');
  }

  private evaluateCondition(actual: string, operator: string, expected: string): boolean {
    switch (operator) {
      case 'equals': return actual === expected;
      case 'not_equals': return actual !== expected;
      case 'gt': return Number(actual) > Number(expected);
      case 'lt': return Number(actual) < Number(expected);
      case 'contains': return actual.includes(expected);
      default: return false;
    }
  }
}
```

### 3.5 Workflow Editor UI: `apps/agent-configurator/src/components/WorkflowEditor.tsx` (NEW FILE)

This is the most complex new UI component. Build it using `@xyflow/react`.

**Structure:**

```typescript
import { ReactFlow, Background, Controls, MiniMap, Panel, addEdge, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
```

**Custom Node Types:**

Create a `apps/agent-configurator/src/components/workflow-nodes/` directory with:

1. **`AgentNode.tsx`** — Displays agent info (name, role, accent color, model badge). Has one input handle (top) and one output handle (bottom). Should look like a card with the agent's accent color as a left border.

2. **`ConditionNode.tsx`** — Diamond/rhombus shaped node with a condition label. Has one input handle (top) and two output handles labeled "True" (right) and "False" (left), or (bottom-left, bottom-right).

3. **`StartNode.tsx`** — Simple circle/rounded node labeled "Start" with only an output handle.

4. **`EndNode.tsx`** — Simple circle/rounded node labeled "End" with only an input handle.

**Editor Features:**

- Canvas with grid background
- Node palette on the left (drag to add agent/condition/end nodes)
- Agent nodes should show a dropdown to select which agent to assign
- Condition nodes should show fields for: conditionField, conditionOperator, conditionValue
- Edges can be labeled
- Save button that PATCHes `/api/workflows/:id`
- Name/description inputs at the top
- MiniMap in the corner
- Controls (zoom in/out/fit)

**Color and Style:**

Match the existing dark theme:
- Canvas background: `#18181b` (zinc-900)
- Node background: `#27272a` (zinc-800)
- Node border: `#3f3f46` (zinc-700)
- Text: white
- Accent: orange (`#ea580c`)
- Selected node border: orange
- Edge color: `#71717a` (zinc-500)
- Animated edges for active connections

### 3.6 Add Route for Workflows

In `apps/dashboard/src/App.tsx`:

```typescript
<Route path="/workflows" element={<ErrorBoundary><WorkflowsView /></ErrorBoundary>} />
<Route path="/workflows/:id" element={<ErrorBoundary><WorkflowEditorView /></ErrorBoundary>} />
```

Create the corresponding view components in `apps/dashboard/src/views/`.

### 3.7 Add Sidebar Navigation

Update `apps/dashboard/src/components/Sidebar.tsx` to add a "Workflows" navigation item.

---

## Phase 4: Configurable Agent Roles

### 4.1 Update `libs/shared/src/constants.ts`

```typescript
// BEFORE:
export const ROLE_COLORS: Record<string, string> = {
  project_manager: '#a371f7',
  architect: '#58a6ff',
  developer: '#3fb950',
  tester: '#d29922',
  grunt: '#8b949e',
  user: '#c9d1d9',
  system: '#8b949e',
};

// AFTER:
/**
 * @deprecated Use agent's accentColor from the agent config instead.
 * This map is kept only as a fallback for system/user roles that don't have agent configs.
 */
export const ROLE_COLORS: Record<string, string> = {
  user: '#c9d1d9',
  system: '#8b949e',
};
```

Keep `formatRoleName` as-is — it's still useful.

### 4.2 Update `apps/kanban-board/src/components/AgentBadge.tsx`

The badge currently uses `ROLE_COLORS[role]`. Update it to fetch the agent's `accentColor` from the agent list instead:

```typescript
import { formatRoleName, ROLE_COLORS } from '@app/shared';

interface AgentBadgeProps {
  role: string;
  accentColor?: string;  // NEW: pass color directly if available
}

export function AgentBadge({ role, accentColor }: AgentBadgeProps) {
  const color = accentColor || ROLE_COLORS[role] || '#94a3b8';
  const displayName = formatRoleName(role);

  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors"
      style={{
        background: `${color}15`,
        color,
        borderColor: `${color}33`,
      }}
    >
      {displayName}
    </span>
  );
}
```

Then in `TaskCard.tsx`, pass the agent's accent color when rendering the badge. This requires either:
- Having agents loaded in context (create a React context or pass agent data through)
- Or fetching agents once in the Board and passing color info down

**Recommended approach:** Create a shared `useAgentColors` hook:

```typescript
// apps/kanban-board/src/hooks/useAgentColors.ts
import { useQuery } from '@tanstack/react-query';

export function useAgentColors(): Record<string, string> {
  const { data = [] } = useQuery({
    queryKey: ['agent-colors'],
    queryFn: async () => {
      const res = await fetch('/api/agents');
      return res.json();
    },
    staleTime: 60_000, // cache for 1 minute
  });

  const colorMap: Record<string, string> = {};
  for (const agent of data) {
    if (agent.accentColor) {
      colorMap[agent.role] = agent.accentColor;
    }
  }
  return colorMap;
}
```

Use this in `Board.tsx` and pass colors down to `TaskCard`.

### 4.3 Update `apps/agent-configurator/src/components/AgentEditor.tsx`

Remove the import of `ROLE_COLORS`:

```typescript
// BEFORE:
import { AVAILABLE_TOOLS, ROLE_COLORS } from '@app/shared';
// AFTER:
import { AVAILABLE_TOOLS } from '@app/shared';
```

On line 109, change:
```typescript
// BEFORE:
accentColor: agent.accentColor || ROLE_COLORS[agent.role] || '',
// AFTER:
accentColor: agent.accentColor || '',
```

### 4.4 Update `libs/agents/src/seed.ts`

Remove the `DEFAULT_ACCENT_COLORS` map (lines 53-59). Change the `accentColor` assignment:

```typescript
// BEFORE:
const DEFAULT_ACCENT_COLORS: Record<string, string> = {
  project_manager: '#a371f7',
  architect: '#58a6ff',
  developer: '#3fb950',
  tester: '#d29922',
  grunt: '#8b949e',
};
// ...
config.accentColor || DEFAULT_ACCENT_COLORS[config.role] || null,

// AFTER:
config.accentColor || null,
```

The YAML seed files should have `accentColor` set in them instead. Make sure each `.agent.yaml` file includes an `accentColor` field:

- `developer.agent.yaml` → `accentColor: '#3fb950'`
- `architect.agent.yaml` → `accentColor: '#58a6ff'`
- `project-manager.agent.yaml` → `accentColor: '#a371f7'`
- `tester.agent.yaml` → `accentColor: '#d29922'`
- `grunt.agent.yaml` → `accentColor: '#8b949e'`

### 4.5 Update `apps/task-manager/src/db/migrate.ts`

The existing migration at lines 57-63 hardcodes colors for seeded agents. This is fine for migration purposes (existing databases need backfill). No changes needed here — it only runs once for databases that predate the `accent_color` column.

---

## Phase 5: Fastify Type Declarations

Update `apps/task-manager/src/types.ts` (or wherever Fastify is decorated) to include the new decorations:

```typescript
import type { WorkflowEngine } from './orchestrator/workflow-engine.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: import('better-sqlite3').Database;
    io: import('socket.io').Server;
    agentRunner: import('./orchestrator/agent-runner.js').AgentRunner;
    dispatcher: import('./orchestrator/agent-dispatcher.js').AgentDispatcher;
    workflowEngine?: WorkflowEngine;  // NEW
  }
}
```

---

## Testing Strategy

After implementing each phase, verify:

### Phase 0
- `pnpm nx build shared` compiles without errors
- New types are exported correctly
- Database migration runs without errors (start the server)

### Phase 1
- `GET /api/statuses` returns 4 default statuses
- `POST /api/statuses` creates a new status
- `PATCH /api/statuses/:id` updates label/color
- `DELETE /api/statuses/:id` works (and blocks if tasks use it)
- Kanban board renders dynamic columns
- Creating a new status adds a column in real-time
- Drag and drop still works with dynamic columns
- TaskEditor status dropdown shows dynamic statuses

### Phase 2
- `GET /api/templates` returns 4 built-in templates
- `POST /api/templates` creates a template with fields
- `POST /api/templates/:id/instantiate` creates a task with correct title, description, metadata
- Template library UI renders and creates tasks

### Phase 3
- `POST /api/workflows` creates a workflow with graph JSON
- Workflow editor renders with React Flow
- Can add agent nodes, condition nodes, start/end nodes
- Can connect nodes with edges
- Save persists the graph
- `POST /api/workflows/:id/execute` runs agents in sequence
- Conditional branching routes correctly

### Phase 4
- No references to hardcoded `ROLE_COLORS` for agents (only `user`/`system` remain)
- Agent badges use `accentColor` from agent config
- New agents created in configurator show correct custom colors
- YAML seed files include `accentColor`

### Full Integration
- Start the server: `pnpm nx run task-manager:serve`
- Start the dashboard: `pnpm nx run dashboard:dev`
- Verify all views load without errors
- Run any existing tests: `pnpm nx run-many --target=test`
- Run lint: `pnpm nx run-many --target=lint`

---

## Implementation Order Summary

1. **Phase 0** — Types, schema, migration (foundation for everything)
2. **Phase 1** — Dynamic statuses + kanban (most visible, unblocks other work)
3. **Phase 4** — Configurable roles (quick, removes hardcoded assumptions)
4. **Phase 2** — Task templates (builds on dynamic statuses)
5. **Phase 3** — Workflow graph (most complex, benefits from all prior phases)

Phases 2, 3, and 4 can be done in parallel after Phase 1 is stable.
