import type Database from 'better-sqlite3';

/**
 * Atomically generates the next sequential GUID for a given prefix.
 * Returns formatted string like "TASK-001".
 */
export function nextGuid(db: Database.Database, prefix = 'TASK'): string {
  const row = db.prepare(
    'UPDATE guid_counter SET next_val = next_val + 1 WHERE prefix = ? RETURNING next_val - 1 AS val'
  ).get(prefix) as { val: number } | undefined;

  if (!row) {
    // Initialize counter if it doesn't exist
    db.prepare('INSERT OR IGNORE INTO guid_counter (prefix, next_val) VALUES (?, 2)').run(prefix);
    return `${prefix}-001`;
  }

  return `${prefix}-${String(row.val).padStart(3, '0')}`;
}
