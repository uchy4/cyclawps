import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import path from 'path';
import type { AgentConfig, AgentRunStatus } from '@app/shared';

// Resolve __dirname for ESM (tsx runs TypeScript as ESM)
const __filename = fileURLToPath(import.meta.url);
const __agentDir = path.dirname(__filename);

/** Tracks all spawned agent child processes for graceful shutdown. */
const activeChildren = new Set<ChildProcess>();

/**
 * Kills all active agent child processes.
 * Sends SIGTERM first, escalates to SIGKILL after 3 seconds.
 */
export function killAllAgentProcesses(): Promise<void> {
  if (activeChildren.size === 0) return Promise.resolve();

  console.log(`[agents] Killing ${activeChildren.size} active agent process(es)...`);

  return new Promise((resolve) => {
    let remaining = activeChildren.size;
    if (remaining === 0) { resolve(); return; }

    const forceKillTimer = setTimeout(() => {
      for (const child of activeChildren) {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }
      resolve();
    }, 3000);

    for (const child of activeChildren) {
      child.once('exit', () => {
        remaining--;
        if (remaining === 0) {
          clearTimeout(forceKillTimer);
          resolve();
        }
      });
      child.kill('SIGTERM');
    }
  });
}

export interface McpContext {
  /** Base URL of the task-manager API */
  apiUrl?: string;
  /** The agent role */
  agentRole: string;
  /** Thread ID context */
  threadId?: string | null;
  /** Agent channel context */
  agentRoleChannel?: string | null;
}

export interface InvokeAgentOptions {
  config: AgentConfig;
  prompt: string;
  cwd?: string;
  /** MCP context for connecting agents to chat/task tools */
  mcpContext?: McpContext;
  onStream?: (chunk: string) => void;
  onStatusChange?: (status: AgentRunStatus) => void;
}

export interface AgentResult {
  success: boolean;
  output: string;
  /** Set when the failure was an expired OAuth token */
  authExpired?: boolean;
  tokensUsed?: number;
  sessionId?: string;
}

/**
 * Builds the --mcp-config JSON string for the CLI.
 * Points to our stdio MCP server script with context env vars.
 */
function buildMcpConfig(mcpContext: McpContext): string {
  // Path to the stdio MCP server source — resolve relative to this file,
  // not process.cwd(), since cwd varies depending on where nx launches from.
  const mcpServerPath = path.resolve(__agentDir, 'cyclawps-mcp-stdio.ts');

  const config = {
    mcpServers: {
      cyclawps: {
        command: 'npx',
        args: ['tsx', mcpServerPath],
        env: {
          CYCLAWPS_API_URL: mcpContext.apiUrl || 'http://localhost:3000',
          CYCLAWPS_AGENT_ROLE: mcpContext.agentRole,
          ...(mcpContext.threadId ? { CYCLAWPS_THREAD_ID: mcpContext.threadId } : {}),
          ...(mcpContext.agentRoleChannel ? { CYCLAWPS_AGENT_CHANNEL: mcpContext.agentRoleChannel } : {}),
        },
      },
    },
  };

  return JSON.stringify(config);
}

/**
 * Spawns the `claude` CLI once and returns the result.
 */
function runCli(
  args: string[],
  prompt: string,
  cwd: string,
  role: string,
  onStream?: (chunk: string) => void,
): Promise<AgentResult> {
  return new Promise<AgentResult>((resolve) => {
    // Strip Anthropic env vars so CLI uses its own keychain OAuth
    const env = { ...process.env };
    delete env['ANTHROPIC_API_KEY'];
    delete env['ANTHROPIC_AUTH_TOKEN'];
    delete env['ANTHROPIC_BASE_URL'];
    delete env['CLAUDE_CODE_SSE_PORT'];

    const child = spawn('claude', args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    activeChildren.add(child);

    child.stdin!.write(prompt);
    child.stdin!.end();

    const collectedOutput: string[] = [];
    let stderrOutput = '';

    const rl = createInterface({ input: child.stdout! });
    rl.on('line', (line) => {
      try {
        const event = JSON.parse(line);
        if (event.type === 'assistant' && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'text' && block.text) {
              collectedOutput.push(block.text);
              onStream?.(block.text);
            }
          }
        } else if (event.type === 'result' && event.result) {
          if (collectedOutput.length === 0) {
            collectedOutput.push(event.result);
            onStream?.(event.result);
          }
        }
      } catch {
        if (line.trim()) {
          collectedOutput.push(line);
          onStream?.(line);
        }
      }
    });

    child.stderr?.on('data', (data) => {
      stderrOutput += data.toString();
    });

    child.on('close', (code) => {
      activeChildren.delete(child);
      const output = collectedOutput.join('\n');

      const authExpired = output.includes('OAuth token has expired')
        || output.includes('authentication_error')
        || stderrOutput.includes('OAuth token has expired');

      if (code === 0) {
        // Empty output is valid — agent may have only called MCP tools (e.g. react-only)
        resolve({ success: true, output });
      } else {
        const errorMsg = output.trim() || stderrOutput.trim() || `CLI exited with code ${code}`;
        console.error(`[agent:${role}] CLI failed (code=${code}):`, errorMsg.substring(0, 300));
        resolve({ success: false, output: errorMsg, authExpired });
      }
    });

    child.on('error', (err) => {
      activeChildren.delete(child);
      console.error(`[agent:${role}] Spawn error:`, err.message);
      resolve({ success: false, output: `Agent spawn failed: ${err.message}` });
    });
  });
}

/**
 * Attempts to refresh the CLI's OAuth token.
 */
async function tryRefreshAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    console.log('[auth] OAuth token expired — attempting auto-refresh...');
    const child = spawn('claude', ['auth', 'refresh'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('[auth] Token refresh succeeded');
        resolve(true);
      } else {
        console.error('[auth] Token refresh failed — user needs to run: claude /login');
        resolve(false);
      }
    });

    child.on('error', () => resolve(false));
  });
}

/**
 * Invokes an agent by spawning the `claude` CLI.
 * Passes MCP config so agents can interact with chat and the task board.
 * Retries once on auth expiry after attempting a token refresh.
 */
export async function invokeAgent(options: InvokeAgentOptions): Promise<AgentResult> {
  const { config, prompt, cwd, mcpContext, onStream, onStatusChange } = options;

  const envModelKey = `AGENT_${config.role.toUpperCase()}_MODEL`;
  const model = process.env[envModelKey] || config.model;

  const envTurnsKey = `AGENT_${config.role.toUpperCase()}_MAX_TURNS`;
  const maxTurns = parseInt(process.env[envTurnsKey] || '', 10) || config.maxTurns;

  console.log(`[agent:${config.role}] Invoking via CLI (model: ${model})`);
  onStatusChange?.('running');

  const args = [
    '--print',
    '--verbose',
    '--output-format', 'stream-json',
    '--model', model,
    '--max-turns', String(maxTurns),
    '--dangerously-skip-permissions',
  ];

  if (config.systemPrompt) {
    args.push('--system-prompt', config.systemPrompt);
  }

  // Pass MCP config so agents can use chat/task tools
  if (mcpContext) {
    args.push('--mcp-config', buildMcpConfig(mcpContext));
  }

  // Build the allowed tools list. MCP tools must always be included when
  // an MCP context is present — otherwise --allowedTools blocks them entirely.
  // Use "mcp__cyclawps" (server-level prefix) to allow ALL tools from the server.
  const allTools = [
    ...(config.tools || []),
    ...(mcpContext
      ? [
          'mcp__cyclawps__send_message',
          'mcp__cyclawps__react_to_message',
          'mcp__cyclawps__read_messages',
          'mcp__cyclawps__update_task',
          'mcp__cyclawps__read_tasks',
          'mcp__cyclawps__create_task',
          'mcp__cyclawps__write_task_log',
          'mcp__cyclawps__handoff_to_agent',
          'mcp__cyclawps__read_agents',
        ]
      : []),
  ];

  console.log(`[agent:${config.role}] allowedTools: ${allTools.join(', ')}`);

  if (allTools.length) {
    args.push('--allowedTools', allTools.join(','));
  }

  const workingDir = cwd || process.cwd();

  // First attempt
  let result = await runCli(args, prompt, workingDir, config.role, onStream);

  // Retry once on auth expiry
  if (!result.success && result.authExpired) {
    const refreshed = await tryRefreshAuth();
    if (refreshed) {
      console.log(`[agent:${config.role}] Retrying after token refresh...`);
      result = await runCli(args, prompt, workingDir, config.role, onStream);
    } else {
      result.output = 'Agent authentication expired. Please run `claude /login` in your terminal to refresh, then try again.';
    }
  }

  onStatusChange?.(result.success ? 'completed' : 'failed');
  return result;
}
