import type Database from 'better-sqlite3';
import { CREATE_TABLES_SQL } from './schema.js';

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
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

  console.log('Migrations complete.');
}
