import type Database from 'better-sqlite3';
import type { AgentConfig } from '@app/shared';

export function rowToAgentConfig(row: Record<string, unknown>): AgentConfig {
  return {
    id: row['id'] as string,
    role: row['role'] as string,
    name: row['name'] as string,
    displayName: (row['display_name'] as string) || null,
    description: row['description'] as string,
    systemPrompt: row['system_prompt'] as string,
    model: row['model'] as string,
    apiKeyEnv: row['api_key_env'] as string,
    maxTurns: row['max_turns'] as number,
    tools: JSON.parse((row['tools'] as string) || '[]'),
    loggingEnabled: row['logging_enabled'] !== 0,
    accentColor: (row['accent_color'] as string) || null,
    cooldown: (row['cooldown'] as number) || 5,
    isSeeded: Boolean(row['is_seeded']),
    createdAt: row['created_at'] as number,
    updatedAt: row['updated_at'] as number,
  };
}

/**
 * Load a single agent config from the database by role.
 */
export function loadAgentConfig(db: Database.Database, role: string): AgentConfig | null {
  const row = db.prepare('SELECT * FROM agent_configs WHERE role = ?').get(role);
  if (!row) return null;
  return rowToAgentConfig(row as Record<string, unknown>);
}

/**
 * Load all agent configs from the database.
 */
export function loadAllAgentConfigs(db: Database.Database): AgentConfig[] {
  const rows = db.prepare('SELECT * FROM agent_configs ORDER BY name ASC').all();
  return rows.map((r) => rowToAgentConfig(r as Record<string, unknown>));
}
