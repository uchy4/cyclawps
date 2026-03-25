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

  console.log('Migrations complete.');
}
