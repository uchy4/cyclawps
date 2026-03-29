import type Database from 'better-sqlite3';
import type { AgentConfig } from '@app/shared';

interface MessageRow {
  id: string;
  sender_type: string;
  sender_name: string;
  content: string;
  created_at: number;
}

interface TaskRow {
  guid: string;
  title: string;
  status: string;
  assigned_agent: string | null;
  description: string;
  priority: number;
}

interface AgentRow {
  role: string;
  name: string;
  display_name: string | null;
  description: string;
}

/**
 * Loads recent messages for a thread or agent channel.
 */
function loadConversationHistory(
  db: Database.Database,
  opts: { threadId?: string | null; agentRole?: string | null; limit?: number }
): MessageRow[] {
  const { threadId, agentRole, limit = 50 } = opts;

  if (threadId) {
    return db
      .prepare(
        'SELECT id, sender_type, sender_name, content, created_at FROM messages WHERE thread_id = ? ORDER BY created_at DESC LIMIT ?'
      )
      .all(threadId, limit) as MessageRow[];
  }

  if (agentRole) {
    return db
      .prepare(
        'SELECT id, sender_type, sender_name, content, created_at FROM messages WHERE agent_role = ? ORDER BY created_at DESC LIMIT ?'
      )
      .all(agentRole, limit) as MessageRow[];
  }

  // Global chat — no filter
  return db
    .prepare(
      'SELECT id, sender_type, sender_name, content, created_at FROM messages WHERE thread_id IS NULL AND agent_role IS NULL ORDER BY created_at DESC LIMIT ?'
    )
    .all(limit) as MessageRow[];
}

function formatMessages(messages: MessageRow[]): string {
  // Messages come in DESC order; reverse for chronological
  const chronological = [...messages].reverse();
  return chronological
    .map((m) => {
      const time = new Date(m.created_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `[${m.sender_name}] ${time} (msg:${m.id}): ${m.content}`;
    })
    .join('\n');
}

function loadAgentList(db: Database.Database): AgentRow[] {
  return db
    .prepare('SELECT role, name, display_name, description FROM agent_configs ORDER BY name ASC')
    .all() as AgentRow[];
}

function formatAgentList(agents: AgentRow[]): string {
  return agents
    .map((a) => `- ${a.role} (${a.display_name || a.name}): ${a.description}`)
    .join('\n');
}

function loadTaggedTasks(db: Database.Database, threadId: string): TaskRow[] {
  return db
    .prepare(
      `SELECT t.guid, t.title, t.status, t.assigned_agent, t.description, t.priority
       FROM tasks t
       JOIN thread_tasks tt ON tt.task_id = t.id
       WHERE tt.thread_id = ?`
    )
    .all(threadId) as TaskRow[];
}

function formatTasks(tasks: TaskRow[]): string {
  return tasks
    .map(
      (t) =>
        `- ${t.guid}: "${t.title}" (${t.status}${t.assigned_agent ? `, assigned: ${t.assigned_agent}` : ''}, P${t.priority})`
    )
    .join('\n');
}

const TOOL_LIST = `You have access to Cyclawps MCP tools for interacting with the system:
- send_message: Send messages to threads or agent channels
- react_to_message: React to a message with an emoji (requires the message ID, shown as msg:ID in conversation history)
- read_messages: Read conversation history
- read_tasks: List tasks from the kanban board
- update_task: Change task status, assignment, or priority
- create_task: Create new tasks
- write_task_log: Log progress on tasks
- handoff_to_agent: Hand off to another agent
- read_agents: List available agents`;

function loadGeneralInstructions(db: Database.Database): string {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'general_agent_instructions'")
    .get() as { value: string } | undefined;
  return row?.value || '';
}

function buildToolAndInstructionsSection(db: Database.Database): string {
  const parts: string[] = [TOOL_LIST];
  const generalInstructions = loadGeneralInstructions(db);
  if (generalInstructions.trim()) {
    parts.push('');
    parts.push(generalInstructions);
  }
  return parts.join('\n');
}

/**
 * Builds a prompt for chat-triggered agent invocations.
 */
export function buildChatPrompt(
  db: Database.Database,
  config: AgentConfig,
  opts: {
    threadId?: string | null;
    agentRole?: string | null;
    threadName?: string | null;
    threadParticipants?: string[];
  }
): string {
  const parts: string[] = [];

  parts.push(`## You are ${config.displayName || config.name} (${config.role})`);
  parts.push(config.systemPrompt);

  // Thread context
  if (opts.threadId && opts.threadName) {
    parts.push(`\n## Thread Context`);
    parts.push(`Thread: ${opts.threadName}`);
    if (opts.threadParticipants && opts.threadParticipants.length > 0) {
      parts.push(`Participants: ${opts.threadParticipants.join(', ')}`);
    }
  }

  // Tagged tasks (for threads)
  if (opts.threadId) {
    const tasks = loadTaggedTasks(db, opts.threadId);
    if (tasks.length > 0) {
      parts.push(`\n## Tagged Tasks`);
      parts.push(formatTasks(tasks));
    }
  }

  // Available agents
  const agents = loadAgentList(db);
  parts.push(`\n## Available Agents`);
  parts.push(formatAgentList(agents));

  // Recent messages
  const messages = loadConversationHistory(db, {
    threadId: opts.threadId,
    agentRole: opts.agentRole,
  });
  if (messages.length > 0) {
    parts.push(`\n## Recent Messages`);
    parts.push(formatMessages(messages));
  }

  // Directive instructions
  parts.push(`\n## Available Tools & General Instructions`);
  parts.push(buildToolAndInstructionsSection(db));

  return parts.join('\n');
}

/**
 * Builds an enhanced prompt for task-based agent invocations.
 * Extends the existing prompt format with conversation history and directives.
 */
export function buildTaskPrompt(
  db: Database.Database,
  config: AgentConfig,
  task: Record<string, unknown>,
  priorRuns: Array<Record<string, unknown>>
): string {
  const parts: string[] = [];

  parts.push(`## Task: ${task['title']}`);
  parts.push(`**GUID:** ${task['guid']}`);
  parts.push(`**Description:** ${task['description'] || 'No description'}`);
  parts.push(`**Status:** ${task['status']}`);
  parts.push(`**Priority:** ${task['priority']}`);

  if (priorRuns.length > 0) {
    parts.push('\n## Previous Agent Outputs:');
    for (const run of priorRuns) {
      parts.push(`\n### ${run['agent_role']} output:`);
      parts.push((run['result'] as string) || '(no output)');
    }
  }

  // Find any threads this task is tagged in and include conversation history
  const threadRows = db
    .prepare(
      'SELECT t.id, t.name FROM threads t JOIN thread_tasks tt ON tt.thread_id = t.id JOIN tasks tk ON tk.id = tt.task_id WHERE tk.id = ?'
    )
    .all(task['id'] as string) as Array<{ id: string; name: string }>;

  if (threadRows.length > 0) {
    parts.push('\n## Related Conversation History:');
    for (const thread of threadRows) {
      parts.push(`\n### Thread: ${thread.name}`);
      const messages = loadConversationHistory(db, { threadId: thread.id, limit: 20 });
      if (messages.length > 0) {
        parts.push(formatMessages(messages));
      }
    }
  }

  // Available agents
  const agents = loadAgentList(db);
  parts.push(`\n## Available Agents`);
  parts.push(formatAgentList(agents));

  // Directive instructions
  parts.push(`\n## Available Tools & General Instructions`);
  parts.push(buildToolAndInstructionsSection(db));

  return parts.join('\n');
}
