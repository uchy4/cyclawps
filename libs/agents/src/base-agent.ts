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
 */
export async function invokeAgent(options: InvokeAgentOptions): Promise<AgentResult> {
  const { config, prompt, cwd, onStream, onStatusChange } = options;

  // Resolve model from env override or config
  const envModelKey = `AGENT_${config.role.toUpperCase()}_MODEL`;
  const model = process.env[envModelKey] || config.model;

  // Resolve max turns from env override or config
  const envTurnsKey = `AGENT_${config.role.toUpperCase()}_MAX_TURNS`;
  const maxTurns = parseInt(process.env[envTurnsKey] || '', 10) || config.maxTurns;

  console.log(`[agent:${config.role}] Invoking via Agent SDK (model: ${model})`);
  onStatusChange?.('running');

  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    const collectedOutput: string[] = [];

    for await (const event of query({
      prompt,
      options: {
        systemPrompt: config.systemPrompt,
        allowedTools: config.tools,
        model: model as 'opus' | 'sonnet' | 'haiku',
        maxTurns,
        cwd: cwd || process.cwd(),
      },
    })) {
      if (!event || typeof event !== 'object' || !('type' in event)) continue;
      const evt = event as Record<string, unknown>;

      if (evt['type'] === 'assistant') {
        const msg = evt['message'] as Record<string, unknown> | undefined;
        const content = msg?.['content'] as Array<Record<string, unknown>> | undefined;
        if (content) {
          for (const block of content) {
            if (block['type'] === 'text' && typeof block['text'] === 'string') {
              collectedOutput.push(block['text']);
              onStream?.(block['text']);
            }
          }
        }
      } else if (evt['type'] === 'result' && typeof evt['result'] === 'string') {
        if (collectedOutput.length === 0) {
          collectedOutput.push(evt['result'] as string);
          onStream?.(evt['result'] as string);
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
