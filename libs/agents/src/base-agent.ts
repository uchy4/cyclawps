import { spawn } from 'child_process';
import { createInterface } from 'readline';
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
  /** Set when the failure was an expired OAuth token */
  authExpired?: boolean;
  tokensUsed?: number;
  sessionId?: string;
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
        // Not JSON — raw text output
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
      const output = collectedOutput.join('\n');

      // Detect expired OAuth token
      const authExpired = output.includes('OAuth token has expired')
        || output.includes('authentication_error')
        || stderrOutput.includes('OAuth token has expired');

      if (code === 0 && output) {
        resolve({ success: true, output });
      } else {
        const errorMsg = output.trim() || stderrOutput.trim() || `CLI exited with code ${code}`;
        console.error(`[agent:${role}] CLI failed (code=${code}):`, errorMsg.substring(0, 300));
        resolve({ success: false, output: errorMsg, authExpired });
      }
    });

    child.on('error', (err) => {
      console.error(`[agent:${role}] Spawn error:`, err.message);
      resolve({ success: false, output: `Agent spawn failed: ${err.message}` });
    });
  });
}

/**
 * Attempts to refresh the CLI's OAuth token by running `claude /login --headless`.
 * Returns true if refresh succeeded.
 */
async function tryRefreshAuth(): Promise<boolean> {
  return new Promise((resolve) => {
    console.log('[auth] OAuth token expired — attempting auto-refresh...');
    const child = spawn('claude', ['auth', 'refresh'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    });

    let output = '';
    child.stdout?.on('data', (d) => { output += d.toString(); });
    child.stderr?.on('data', (d) => { output += d.toString(); });

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
 * Uses the CLI's keychain-stored OAuth credentials.
 * Retries once on auth expiry after attempting a token refresh.
 */
export async function invokeAgent(options: InvokeAgentOptions): Promise<AgentResult> {
  const { config, prompt, cwd, onStream, onStatusChange } = options;

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

  if (config.tools?.length) {
    args.push('--allowedTools', config.tools.join(','));
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
