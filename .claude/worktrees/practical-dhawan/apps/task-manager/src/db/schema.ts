// SQL schema for SQLite - used by migrate.ts
export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  guid TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done', 'blocked')),
  assigned_agent TEXT,
  pipeline_stage_id TEXT,
  parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS guid_counter (
  prefix TEXT PRIMARY KEY,
  next_val INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO guid_counter (prefix, next_val) VALUES ('TASK', 1);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  sender_type TEXT NOT NULL CHECK(sender_type IN ('agent', 'user', 'system')),
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  in_reply_to TEXT REFERENCES messages(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pipeline_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config_yaml TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_configs (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  display_name TEXT DEFAULT NULL,
  description TEXT DEFAULT '',
  system_prompt TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
  api_key_env TEXT NOT NULL DEFAULT 'ANTHROPIC_API_KEY',
  max_turns INTEGER NOT NULL DEFAULT 10,
  tools TEXT NOT NULL DEFAULT '[]',
  logging_enabled INTEGER NOT NULL DEFAULT 1,
  is_seeded INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  agent_role TEXT NOT NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  prompt TEXT NOT NULL,
  result TEXT,
  session_id TEXT,
  tokens_used INTEGER,
  started_at INTEGER,
  finished_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS task_logs (
  id TEXT PRIMARY KEY,
  task_guid TEXT NOT NULL,
  agent_role TEXT,
  action TEXT NOT NULL,
  details TEXT DEFAULT '',
  status TEXT DEFAULT 'info' CHECK(status IN ('info', 'success', 'error', 'warning')),
  metadata TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_agent ON tasks(assigned_agent);
CREATE INDEX IF NOT EXISTS idx_tasks_guid ON tasks(guid);
CREATE INDEX IF NOT EXISTS idx_messages_task_id ON messages(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_task_id ON agent_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_role ON agent_runs(agent_role);
CREATE INDEX IF NOT EXISTS idx_task_logs_task_guid ON task_logs(task_guid);
CREATE INDEX IF NOT EXISTS idx_task_logs_created_at ON task_logs(created_at);
`;
