import type { AgentConfig, AgentRunStatus } from '@app/shared';

export interface InvokeAgentOptions {
  config: AgentConfig;
  prompt: string;
  cwd?: string;
  onStream?: (chunk: string) => void;
  onStatusChange?: (status: AgentRunStatus) => void;
}

export interface AgentResult {
  success: boolean;
  output: string;
  tokensUsed?: number;
  sessionId?: string;
}

/**
 * Invokes an agent using the Claude Agent SDK.
 * Reads the API key from the environment variable specified in the agent config.
 */
export async function invokeAgent(options: InvokeAgentOptions): Promise<AgentResult> {
  const { config, prompt, cwd, onStream, onStatusChange } = options;

  // Resolve API key: agent-specific env var -> ANTHROPIC_API_KEY fallback
  const apiKey = process.env[config.apiKeyEnv] || process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    return {
      success: false,
      output: `Missing API key: set ${config.apiKeyEnv} or ANTHROPIC_API_KEY`,
    };
  }

  // Resolve model from env override or config
  const envModelKey = `AGENT_${config.role.toUpperCase()}_MODEL`;
  const model = process.env[envModelKey] || config.model;

  // Resolve max turns from env override or config
  const envTurnsKey = `AGENT_${config.role.toUpperCase()}_MAX_TURNS`;
  const maxTurns = parseInt(process.env[envTurnsKey] || '', 10) || config.maxTurns;

  onStatusChange?.('running');

  try {
    // Import the Agent SDK dynamically to handle cases where it's not installed
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    const collectedOutput: string[] = [];

    for await (const message of query({
      prompt,
      options: {
        systemPrompt: config.systemPrompt,
        allowedTools: config.tools,
        model: model as 'opus' | 'sonnet' | 'haiku',
        maxTurns,
        cwd: cwd || process.cwd(),
      },
    })) {
      // Extract text content from assistant messages
      if (message && typeof message === 'object' && 'type' in message) {
        const msg = message as Record<string, unknown>;
        if (msg['type'] === 'assistant' && Array.isArray(msg['content'])) {
          for (const block of msg['content'] as Array<Record<string, unknown>>) {
            if (block['type'] === 'text' && typeof block['text'] === 'string') {
              collectedOutput.push(block['text']);
              onStream?.(block['text']);
            }
          }
        }
      }
    }

    const output = collectedOutput.join('\n');
    onStatusChange?.('completed');

    return {
      success: true,
      output,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    onStatusChange?.('failed');

    return {
      success: false,
      output: `Agent invocation failed: ${errorMessage}`,
    };
  }
}
