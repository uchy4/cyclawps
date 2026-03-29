import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { CREATE_TABLES_SQL } from './schema.js';

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table) as { name: string } | undefined;
  return !!row;
}

export function runMigrations(db: Database.Database): void {
  console.log('Running database migrations...');
  db.exec(CREATE_TABLES_SQL);

  // Migrate existing tasks table to include guid column
  if (!columnExists(db, 'tasks', 'guid')) {
    console.log('Adding guid column to tasks...');
    db.exec('ALTER TABLE tasks ADD COLUMN guid TEXT');
    // Backfill existing rows with sequential GUIDs
    const rows = db.prepare('SELECT id FROM tasks ORDER BY created_at ASC').all() as Array<{ id: string }>;
    const update = db.prepare('UPDATE tasks SET guid = ? WHERE id = ?');
    for (let i = 0; i < rows.length; i++) {
      update.run(`TASK-${String(i + 1).padStart(3, '0')}`, rows[i].id);
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_guid ON tasks(guid)');
    db.exec(`INSERT OR REPLACE INTO guid_counter (prefix, next_val) VALUES ('TASK', ${rows.length + 1})`);
    console.log(`Backfilled ${rows.length} tasks with GUIDs.`);
  }

  // Migrate existing agent_configs table to include logging_enabled column
  if (!columnExists(db, 'agent_configs', 'logging_enabled')) {
    console.log('Adding logging_enabled column to agent_configs...');
    db.exec('ALTER TABLE agent_configs ADD COLUMN logging_enabled INTEGER NOT NULL DEFAULT 1');
  }

  // Add attachments column to messages
  if (!columnExists(db, 'messages', 'attachments')) {
    console.log('Adding attachments column to messages...');
    db.exec("ALTER TABLE messages ADD COLUMN attachments TEXT DEFAULT '[]'");
  }

  // Add agent_role column to messages for agent DMs
  if (!columnExists(db, 'messages', 'agent_role')) {
    console.log('Adding agent_role column to messages...');
    db.exec('ALTER TABLE messages ADD COLUMN agent_role TEXT DEFAULT NULL');
  }

  // Add accent_color column to agent_configs
  if (!columnExists(db, 'agent_configs', 'accent_color')) {
    console.log('Adding accent_color column to agent_configs...');
    db.exec('ALTER TABLE agent_configs ADD COLUMN accent_color TEXT DEFAULT NULL');
    // Backfill seeded agents with default colors
    const defaults: Record<string, string> = {
      project_manager: '#a371f7',
      architect: '#58a6ff',
      developer: '#3fb950',
      tester: '#d29922',
      grunt: '#8b949e',
    };
    const update = db.prepare('UPDATE agent_configs SET accent_color = ? WHERE role = ?');
    for (const [role, color] of Object.entries(defaults)) {
      update.run(color, role);
    }
  }

  // Add thread_id column to messages and migrate task-based threads
  if (!columnExists(db, 'messages', 'thread_id')) {
    console.log('Adding thread_id column to messages...');
    db.exec('ALTER TABLE messages ADD COLUMN thread_id TEXT DEFAULT NULL');

    // Create threads, thread_participants, thread_tasks tables if they don't exist yet
    // (they should exist from CREATE_TABLES_SQL, but be safe for existing DBs)
    if (!tableExists(db, 'threads')) {
      db.exec(`CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY, name TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`);
    }
    if (!tableExists(db, 'thread_tasks')) {
      db.exec(`CREATE TABLE IF NOT EXISTS thread_tasks (
        id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        tagged_at INTEGER NOT NULL, UNIQUE(thread_id, task_id)
      )`);
    }
    if (!tableExists(db, 'thread_participants')) {
      db.exec(`CREATE TABLE IF NOT EXISTS thread_participants (
        id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
        agent_role TEXT NOT NULL, added_at INTEGER NOT NULL, UNIQUE(thread_id, agent_role)
      )`);
    }

    // Migrate: create a thread for each task that has messages
    const taskRows = db.prepare(
      `SELECT DISTINCT m.task_id, t.title, MIN(m.created_at) as earliest
       FROM messages m JOIN tasks t ON t.id = m.task_id
       WHERE m.task_id IS NOT NULL
       GROUP BY m.task_id`
    ).all() as Array<{ task_id: string; title: string; earliest: number }>;

    const insertThread = db.prepare('INSERT INTO threads (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)');
    const insertThreadTask = db.prepare('INSERT INTO thread_tasks (id, thread_id, task_id, tagged_at) VALUES (?, ?, ?, ?)');
    const updateMessages = db.prepare('UPDATE messages SET thread_id = ? WHERE task_id = ?');

    for (const row of taskRows) {
      const threadId = uuid();
      const now = row.earliest;
      insertThread.run(threadId, row.title, now, now);
      insertThreadTask.run(uuid(), threadId, row.task_id, now);
      updateMessages.run(threadId, row.task_id);
    }

    db.exec('CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id)');
    console.log(`Migrated ${taskRows.length} task-based threads to generic threads.`);
  }

  // Add agent_chat_archives table
  if (!tableExists(db, 'agent_chat_archives')) {
    console.log('Creating agent_chat_archives table...');
    db.exec(`CREATE TABLE IF NOT EXISTS agent_chat_archives (
      id TEXT PRIMARY KEY,
      agent_role TEXT NOT NULL,
      name TEXT NOT NULL,
      messages TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_agent_chat_archives_role ON agent_chat_archives(agent_role)');
  }

  // Add cooldown column to agent_configs (seconds)
  if (!columnExists(db, 'agent_configs', 'cooldown')) {
    console.log('Adding cooldown column to agent_configs...');
    db.exec('ALTER TABLE agent_configs ADD COLUMN cooldown INTEGER NOT NULL DEFAULT 5');
  }

  // Add use_direct_api column to agent_configs
  if (!columnExists(db, 'agent_configs', 'use_direct_api')) {
    console.log('Adding use_direct_api column to agent_configs...');
    db.exec('ALTER TABLE agent_configs ADD COLUMN use_direct_api INTEGER NOT NULL DEFAULT 0');
  }

  // Create app_settings table and seed general agent instructions
  if (!tableExists(db, 'app_settings')) {
    console.log('Creating app_settings table...');
    db.exec(`CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    )`);
  }

  const hasGeneralInstructions = db
    .prepare("SELECT key FROM app_settings WHERE key = 'general_agent_instructions'")
    .get();
  if (!hasGeneralInstructions) {
    console.log('Seeding default general agent instructions...');
    const defaultInstructions = `## Communication Style
Be succinct. Keep your responses short and focused — avoid unnecessary preamble, filler, or over-explanation. Assume the audience already knows your skills and role. Say what needs to be said, then stop.

## Reactions
When you see a message that warrants acknowledgment, appreciation, or humor, react with an appropriate emoji using react_to_message. Use the message ID from the conversation history (shown as msg:ID after the timestamp). Be natural — don't react to every message, just when it feels right.

## Board Management
Proactively manage tasks assigned to you:
- Use read_tasks to check your assigned work
- When starting a task, update its status to in_progress via update_task
- When finished, move it to done
- Log meaningful progress with write_task_log (don't over-log)

## Collaboration
If a task falls outside your expertise, use handoff_to_agent to delegate to a better-suited teammate. Use read_agents to see who's available.`;

    db.prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('general_agent_instructions', ?, ?)"
    ).run(defaultInstructions, Date.now());
  }

  // Create read_markers table for last-read tracking
  if (!tableExists(db, 'read_markers')) {
    console.log('Creating read_markers table...');
    db.exec(`CREATE TABLE IF NOT EXISTS read_markers (
      id TEXT PRIMARY KEY,
      scope_key TEXT NOT NULL UNIQUE,
      last_read_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      updated_at INTEGER NOT NULL
    )`);
  }

  // Clean up stale agent runs from previous server sessions
  const staleRuns = db.prepare(
    "UPDATE agent_runs SET status = 'failed', finished_at = ? WHERE status = 'running'"
  ).run(Date.now());
  if (staleRuns.changes > 0) {
    console.log(`Marked ${staleRuns.changes} stale agent run(s) as failed.`);
  }

  console.log('Migrations complete.');
}
