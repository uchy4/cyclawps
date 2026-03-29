import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@app/shared';
import { loadAgentConfig } from '@app/agents';
import type { AgentRunner } from './agent-runner.js';

interface IncomingMessage {
  id: string;
  senderType: 'user' | 'agent' | 'system';
  senderName: string;
  content: string;
  taskId?: string | null;
  threadId?: string | null;
  agentRole?: string | null;
}

interface AgentNameRow {
  role: string;
  name: string;
  display_name: string | null;
}

/**
 * Detects when incoming messages should trigger agent invocations
 * and dispatches them to the AgentRunner.
 *
 * Trigger conditions:
 * 1. @mention of an agent role or display name
 * 2. Direct agent channel message (agentRole set on the message)
 * 3. Thread where the agent is a participant
 */
export class AgentDispatcher {
  private db: Database.Database;
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private runner: AgentRunner;

  // Per-agent queue to serialize concurrent invocations
  private queues = new Map<string, Promise<void>>();

  // Debounce timers per context (threadId or agentRole channel)
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Cooldown tracking to prevent rapid re-invocation
  private lastInvocation = new Map<string, number>();

  // Track cooldown retry timers for cleanup
  private cooldownTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    db: Database.Database,
    io: Server<ClientToServerEvents, ServerToClientEvents>,
    runner: AgentRunner
  ) {
    this.db = db;
    this.io = io;
    this.runner = runner;
  }

  /**
   * Called after a user message is saved and broadcast.
   * Determines which agents (if any) should respond.
   */
  onMessage(message: IncomingMessage): void {
    // Only react to user messages
    if (message.senderType !== 'user') return;

    const contextKey = message.threadId || message.agentRole || 'global';

    // Debounce: if user sends multiple rapid messages, only dispatch once
    const existingTimer = this.debounceTimers.get(contextKey);
    if (existingTimer) clearTimeout(existingTimer);

    this.debounceTimers.set(
      contextKey,
      setTimeout(() => {
        this.debounceTimers.delete(contextKey);
        this.dispatch(message);
      }, 500)
    );
  }

  /**
   * Can be called directly to invoke a specific agent in a context.
   * Used by the handoff system to chain agents.
   */
  invokeAgent(
    agentRole: string,
    threadId: string | null,
    agentRoleChannel: string | null,
    depth = 0,
    isPrimary = true
  ): void {
    if (depth >= 3) {
      console.warn(`Handoff depth limit reached for ${agentRole}, skipping`);
      return;
    }

    // Per-agent cooldown (from config, default 5s)
    const agentConfig = loadAgentConfig(this.db, agentRole);
    const cooldownMs = ((agentConfig?.cooldown ?? 5) * 1000);
    const cooldownKey = `${agentRole}:${threadId || agentRoleChannel || 'global'}`;
    const lastTime = this.lastInvocation.get(cooldownKey) || 0;
    const cooldownRemaining = cooldownMs - (Date.now() - lastTime);
    if (cooldownRemaining > 0) {
      console.log(`[dispatcher] Cooldown active for ${agentRole} (${Math.ceil(cooldownRemaining / 1000)}s remaining), scheduling retry`);
      // Auto-retry after cooldown expires
      const timer = setTimeout(() => {
        this.cooldownTimers.delete(cooldownKey);
        console.log(`[dispatcher] Cooldown expired, auto-triggering ${agentRole}`);
        this.invokeAgent(agentRole, threadId, agentRoleChannel, depth);
      }, cooldownRemaining + 100);
      this.cooldownTimers.set(cooldownKey, timer);
      return;
    }

    console.log(`[dispatcher] Queuing ${agentRole} invocation (primary=${isPrimary})`);
    this.enqueue(agentRole, async () => {
      this.lastInvocation.set(cooldownKey, Date.now());
      try {
        console.log(`[dispatcher] Starting ${agentRole} runForChat`);
        await this.runner.runForChat(agentRole, threadId, agentRoleChannel, depth, isPrimary);
        console.log(`[dispatcher] Finished ${agentRole} runForChat`);
      } catch (err) {
        console.error(`[dispatcher] Agent ${agentRole} chat invocation failed:`, err);
      }
    });
  }

  private dispatch(message: IncomingMessage): void {
    const targetRoles = new Set<string>();

    // 1. Direct agent channel — always respond
    if (message.agentRole) {
      targetRoles.add(message.agentRole);
    }

    // 2. Mention detection — catches both @Devin and plain "devin"/"hey devin" forms
    const mentionedRoles = this.detectMentions(message.content);
    for (const role of mentionedRoles) {
      targetRoles.add(role);
    }

    // 3. Thread participants — only if no one was explicitly named.
    //    When a message names a specific agent, only that agent responds.
    if (message.threadId && targetRoles.size === 0) {
      for (const role of this.getThreadParticipants(message.threadId)) {
        targetRoles.add(role);
      }
    }

    for (const role of targetRoles) {
      this.invokeAgent(role, message.threadId || null, message.agentRole || null);
    }
  }

  /**
   * Detects @mentions in message content and returns matching agent roles.
   */
  private detectMentions(content: string): string[] {
    const mentions: string[] = [];
    const lower = content.toLowerCase();

    // Load all agent names for matching
    const agents = this.db
      .prepare('SELECT role, name, display_name FROM agent_configs')
      .all() as AgentNameRow[];

    // Build a map of every recognizable name → role
    const roleMap = new Map<string, string>();
    for (const agent of agents) {
      roleMap.set(agent.role.toLowerCase(), agent.role);
      roleMap.set(agent.name.toLowerCase(), agent.role);
      if (agent.display_name) {
        roleMap.set(agent.display_name.toLowerCase(), agent.role);
        roleMap.set(agent.display_name.toLowerCase().replace(/\s+/g, '_'), agent.role);
      }
    }

    // Check every known name as a whole word in the message (with or without @)
    for (const [key, role] of roleMap) {
      const pattern = new RegExp(`(?:^|[\\s,@])${key}(?:[\\s,!?.]|$)`, 'i');
      if (pattern.test(lower)) {
        mentions.push(role);
      }
    }

    return [...new Set(mentions)];
  }

  private getThreadParticipants(threadId: string): string[] {
    const rows = this.db
      .prepare('SELECT agent_role FROM thread_participants WHERE thread_id = ?')
      .all(threadId) as Array<{ agent_role: string }>;
    return rows.map((r) => r.agent_role);
  }

  /**
   * Enqueues an agent invocation, serializing per agent role.
   */
  private enqueue(agentRole: string, fn: () => Promise<void>): void {
    const current = this.queues.get(agentRole) || Promise.resolve();
    const next = current.then(fn).catch((err) => {
      console.error(`Queue error for ${agentRole}:`, err);
    });
    this.queues.set(agentRole, next);
  }

  /**
   * Cleans up all timers and queues for graceful shutdown.
   */
  destroy(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    for (const timer of this.cooldownTimers.values()) {
      clearTimeout(timer);
    }
    this.cooldownTimers.clear();

    this.queues.clear();
    this.lastInvocation.clear();
    console.log('[dispatcher] Destroyed — all timers and queues cleared');
  }
}
