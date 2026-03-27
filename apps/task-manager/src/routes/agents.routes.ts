import type { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import type { CreateAgentConfigInput, UpdateAgentConfigInput } from '@app/shared';
import { rowToAgentConfig } from '@app/agents';

export function registerAgentRoutes(fastify: FastifyInstance): void {
  const db = fastify.db;
  const io = fastify.io;

  // List all agent configs
  fastify.get('/api/agents', async () => {
    const rows = db.prepare('SELECT * FROM agent_configs ORDER BY name ASC').all();
    return rows.map((r) => rowToAgentConfig(r as Record<string, unknown>));
  });

  // Get single agent config
  fastify.get('/api/agents/:role', async (request, reply) => {
    const { role } = request.params as { role: string };
    const row = db.prepare('SELECT * FROM agent_configs WHERE role = ?').get(role);
    if (!row) return reply.code(404).send({ error: 'Agent not found' });
    return rowToAgentConfig(row as Record<string, unknown>);
  });

  // Create agent config
  fastify.post('/api/agents', async (request, reply) => {
    const input = request.body as CreateAgentConfigInput;
    const existing = db.prepare('SELECT * FROM agent_configs WHERE role = ?').get(input.role);
    if (existing) return reply.code(409).send({ error: 'Agent with this role already exists' });

    const now = Date.now();
    const id = uuid();

    db.prepare(
      `INSERT INTO agent_configs (id, role, name, display_name, description, system_prompt, model, api_key_env, max_turns, tools, logging_enabled, accent_color, is_seeded, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(
      id,
      input.role,
      input.name,
      input.displayName || null,
      input.description || '',
      input.systemPrompt,
      input.model || 'claude-sonnet-4-6',
      input.apiKeyEnv || `AGENT_${input.role.toUpperCase()}_API_KEY`,
      input.maxTurns || 10,
      JSON.stringify(input.tools || ['Read', 'Glob', 'Grep']),
      input.loggingEnabled !== false ? 1 : 0,
      input.accentColor || null,
      now,
      now
    );

    return rowToAgentConfig(db.prepare('SELECT * FROM agent_configs WHERE id = ?').get(id) as Record<string, unknown>);
  });

  // Update agent config
  fastify.patch('/api/agents/:role', async (request, reply) => {
    const { role } = request.params as { role: string };
    const input = request.body as UpdateAgentConfigInput;
    const existing = db.prepare('SELECT * FROM agent_configs WHERE role = ?').get(role);
    if (!existing) return reply.code(404).send({ error: 'Agent not found' });

    const fields: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) { fields.push('name = ?'); values.push(input.name); }
    if (input.displayName !== undefined) { fields.push('display_name = ?'); values.push(input.displayName || null); }
    if (input.description !== undefined) { fields.push('description = ?'); values.push(input.description); }
    if (input.systemPrompt !== undefined) { fields.push('system_prompt = ?'); values.push(input.systemPrompt); }
    if (input.model !== undefined) { fields.push('model = ?'); values.push(input.model); }
    if (input.apiKeyEnv !== undefined) { fields.push('api_key_env = ?'); values.push(input.apiKeyEnv); }
    if (input.maxTurns !== undefined) { fields.push('max_turns = ?'); values.push(input.maxTurns); }
    if (input.tools !== undefined) { fields.push('tools = ?'); values.push(JSON.stringify(input.tools)); }
    if (input.loggingEnabled !== undefined) { fields.push('logging_enabled = ?'); values.push(input.loggingEnabled ? 1 : 0); }
    if (input.accentColor !== undefined) { fields.push('accent_color = ?'); values.push(input.accentColor || null); }

    if (fields.length === 0) return reply.code(400).send({ error: 'No fields to update' });

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(role);

    db.prepare(`UPDATE agent_configs SET ${fields.join(', ')} WHERE role = ?`).run(...values);

    return rowToAgentConfig(db.prepare('SELECT * FROM agent_configs WHERE role = ?').get(role) as Record<string, unknown>);
  });

  // Delete agent config
  fastify.delete('/api/agents/:role', async (request, reply) => {
    const { role } = request.params as { role: string };
    const result = db.prepare('DELETE FROM agent_configs WHERE role = ?').run(role);
    if (result.changes === 0) return reply.code(404).send({ error: 'Agent not found' });

    return { success: true };
  });

  // Reset agents to seed defaults
  fastify.post('/api/agents/reset', async () => {
    // TODO: Wire to seed module in Phase 4
    return { message: 'Reset to defaults' };
  });

  // Invoke an agent manually
  fastify.post('/api/agents/:role/invoke', async (request, reply) => {
    const { role } = request.params as { role: string };
    const { taskId } = request.body as { taskId: string };
    const agent = db.prepare('SELECT * FROM agent_configs WHERE role = ?').get(role);
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });

    // TODO: Wire to agent-runner in Phase 5
    return { message: 'Agent invocation queued', role, taskId };
  });
}
