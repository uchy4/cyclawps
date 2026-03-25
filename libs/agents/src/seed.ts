import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';

interface AgentSeedConfig {
  name: string;
  displayName?: string;
  role: string;
  description?: string;
  model?: string;
  apiKeyEnv?: string;
  maxTurns?: number;
  tools?: string[];
  loggingEnabled?: boolean;
  systemPrompt: string;
}

/**
 * Seeds agent configs from YAML files in the agents/ directory.
 * Only inserts if the role doesn't already exist in the database.
 */
export function seedAgents(db: Database.Database, agentsDir?: string): void {
  const dir = agentsDir || path.join(process.cwd(), 'agents');

  if (!fs.existsSync(dir)) {
    console.log(`Agents seed directory not found at ${dir}, skipping seed.`);
    return;
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.agent.yaml') || f.endsWith('.agent.yml'));

  console.log(`Found ${files.length} agent seed file(s)`);

  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO agent_configs (id, role, name, display_name, description, system_prompt, model, api_key_env, max_turns, tools, logging_enabled, is_seeded, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );

  for (const file of files) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const config = yaml.load(content) as AgentSeedConfig;

    if (!config.role || !config.name || !config.systemPrompt) {
      console.warn(`Skipping invalid seed file ${file}: missing role, name, or systemPrompt`);
      continue;
    }

    const now = Date.now();
    const result = insertStmt.run(
      uuid(),
      config.role,
      config.name,
      config.displayName || null,
      config.description || '',
      config.systemPrompt,
      config.model || 'claude-sonnet-4-6',
      config.apiKeyEnv || `AGENT_${config.role.toUpperCase()}_API_KEY`,
      config.maxTurns || 10,
      JSON.stringify(config.tools || ['Read', 'Glob', 'Grep']),
      config.loggingEnabled !== false ? 1 : 0,
      now,
      now
    );

    if (result.changes > 0) {
      console.log(`Seeded agent: ${config.name} (${config.role})`);
    } else {
      console.log(`Agent already exists, skipped: ${config.role}`);
    }
  }
}
