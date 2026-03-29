#!/usr/bin/env node
/**
 * Cyclawps MCP Stdio Server
 *
 * A standalone MCP server that communicates via stdin/stdout (stdio transport).
 * Spawned by the `claude` CLI as a subprocess.
 * Makes HTTP calls back to the task-manager API to execute chat/task operations.
 *
 * Environment variables (set by the parent process):
 *   CYCLAWPS_API_URL    — Base URL of the task-manager (default: http://localhost:3000)
 *   CYCLAWPS_AGENT_ROLE — The agent role invoking this server
 *   CYCLAWPS_THREAD_ID  — Thread context (optional)
 *   CYCLAWPS_AGENT_CHANNEL — Agent channel context (optional)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const API_URL = process.env['CYCLAWPS_API_URL'] || 'http://localhost:3000';
const AGENT_ROLE = process.env['CYCLAWPS_AGENT_ROLE'] || 'unknown';
const THREAD_ID = process.env['CYCLAWPS_THREAD_ID'] || null;
const AGENT_CHANNEL = process.env['CYCLAWPS_AGENT_CHANNEL'] || null;

async function apiCall(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

function err(text: string) {
  return { content: [{ type: 'text' as const, text }], isError: true as const };
}

const TOOLS = [
  {
    name: 'send_message',
    description: 'Send a message to a thread or agent channel.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string', description: 'The message content' },
        threadId: { type: 'string', description: 'Thread ID (optional, uses current context if omitted)' },
        agentRoleChannel: { type: 'string', description: 'Agent role channel (e.g., "developer")' },
      },
      required: ['content'],
    },
  },
  {
    name: 'react_to_message',
    description: 'React to a message with an emoji.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        messageId: { type: 'string', description: 'ID of the message to react to' },
        emoji: { type: 'string', description: 'Emoji to react with (e.g., "👍", "🔥")' },
      },
      required: ['messageId', 'emoji'],
    },
  },
  {
    name: 'read_messages',
    description: 'Read recent messages from a thread, agent channel, or global chat.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        threadId: { type: 'string', description: 'Thread ID to read from' },
        agentRoleChannel: { type: 'string', description: 'Agent role channel' },
        limit: { type: 'number', description: 'Max messages (default 20)' },
      },
    },
  },
  {
    name: 'read_tasks',
    description: 'List tasks from the kanban board, optionally filtered.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', description: 'Filter: todo, in_progress, done, blocked' },
        assignedAgent: { type: 'string', description: 'Filter by assigned agent role' },
      },
    },
  },
  {
    name: 'update_task',
    description: 'Update a task — change status, assignment, or priority.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        taskGuid: { type: 'string', description: 'Task GUID (e.g., "TASK-005")' },
        status: { type: 'string', description: 'New status: todo, in_progress, done, blocked' },
        assignedAgent: { type: 'string', description: 'Agent role to assign' },
        priority: { type: 'number', description: 'Priority (0-10)' },
      },
      required: ['taskGuid'],
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task on the kanban board.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        assignedAgent: { type: 'string', description: 'Agent role to assign' },
        priority: { type: 'number', description: 'Priority (0-10)' },
        parentTaskGuid: { type: 'string', description: 'Parent task GUID for subtasks' },
      },
      required: ['title'],
    },
  },
  {
    name: 'write_task_log',
    description: 'Write a log entry for a task to record progress or issues.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        taskGuid: { type: 'string', description: 'Task GUID (e.g., "TASK-005")' },
        action: { type: 'string', description: 'What happened' },
        details: { type: 'string', description: 'Additional details' },
        status: { type: 'string', description: 'Log level: info, success, error, warning' },
      },
      required: ['taskGuid', 'action'],
    },
  },
  {
    name: 'handoff_to_agent',
    description: 'Hand off the conversation to another agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        targetAgent: { type: 'string', description: 'Role of agent to hand off to' },
        reason: { type: 'string', description: 'Why you are handing off' },
      },
      required: ['targetAgent', 'reason'],
    },
  },
  {
    name: 'read_agents',
    description: 'List all available agents and their roles.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
];

async function handleToolCall(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'send_message': {
      const result = await apiCall('POST', '/api/messages', {
        content: args['content'],
        senderType: 'agent',
        senderName: AGENT_ROLE,
        threadId: args['threadId'] || THREAD_ID,
        agentRole: args['agentRoleChannel'] || AGENT_CHANNEL,
      });
      return ok(`Message sent (${result.id})`);
    }

    case 'react_to_message': {
      await apiCall('POST', `/api/messages/${args['messageId']}/reactions`, {
        emoji: args['emoji'],
        reactor: AGENT_ROLE,
      });
      return ok(`Reacted with ${args['emoji']}`);
    }

    case 'read_messages': {
      const params = new URLSearchParams();
      if (args['limit']) params.set('limit', String(args['limit']));
      if (args['threadId']) params.set('thread_id', String(args['threadId']));
      else if (args['agentRoleChannel']) params.set('agent_role', String(args['agentRoleChannel']));
      else if (THREAD_ID) params.set('thread_id', THREAD_ID);
      else if (AGENT_CHANNEL) params.set('agent_role', AGENT_CHANNEL);

      const messages = await apiCall('GET', `/api/messages?${params.toString()}`);
      return ok(JSON.stringify(messages, null, 2));
    }

    case 'read_tasks': {
      const params = new URLSearchParams();
      if (args['status']) params.set('status', String(args['status']));
      if (args['assignedAgent']) params.set('assigned_agent', String(args['assignedAgent']));
      const tasks = await apiCall('GET', `/api/tasks?${params.toString()}`);
      return ok(JSON.stringify(tasks, null, 2));
    }

    case 'update_task': {
      const body: Record<string, unknown> = {};
      if (args['status']) body['status'] = args['status'];
      if (args['assignedAgent'] !== undefined) body['assignedAgent'] = args['assignedAgent'];
      if (args['priority'] !== undefined) body['priority'] = args['priority'];
      await apiCall('PATCH', `/api/tasks/${args['taskGuid']}`, body);
      return ok(`Task ${args['taskGuid']} updated`);
    }

    case 'create_task': {
      const result = await apiCall('POST', '/api/tasks', {
        title: args['title'],
        description: args['description'] || '',
        assignedAgent: args['assignedAgent'] || null,
        priority: args['priority'] || 0,
        parentTaskGuid: args['parentTaskGuid'] || null,
      });
      return ok(`Created task ${result.guid}: "${args['title']}"`);
    }

    case 'write_task_log': {
      await apiCall('POST', `/api/tasks/${args['taskGuid']}/logs`, {
        agentRole: AGENT_ROLE,
        action: args['action'],
        details: args['details'] || '',
        status: args['status'] || 'info',
      });
      return ok(`Log written for ${args['taskGuid']}`);
    }

    case 'handoff_to_agent': {
      await apiCall('POST', '/api/agents/handoff', {
        fromAgent: AGENT_ROLE,
        targetAgent: args['targetAgent'],
        reason: args['reason'],
        threadId: THREAD_ID,
        agentRoleChannel: AGENT_CHANNEL,
      });
      return ok(`Handed off to ${args['targetAgent']}`);
    }

    case 'read_agents': {
      const agents = await apiCall('GET', '/api/agents');
      return ok(JSON.stringify(agents, null, 2));
    }

    default:
      return err(`Unknown tool: ${name}`);
  }
}

async function main() {
  const server = new Server(
    { name: 'cyclawps', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      return await handleToolCall(name, (args || {}) as Record<string, unknown>);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return err(msg);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP server failed:', error);
  process.exit(1);
});
