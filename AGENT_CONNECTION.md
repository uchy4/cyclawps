# Agent Connection Guide

How Cyclawps agents connect to the Claude API and common gotchas.

## Architecture

Agents are invoked by spawning the `claude` CLI as a subprocess:

```
task-manager (Node) → spawn('claude', [...args]) → claude CLI → Anthropic API
```

The CLI uses its own **keychain-stored OAuth credentials** — not environment variables. This is the key insight that took us a while to land on.

## How It Works

1. User sends a message in chat (via socket.io or REST API)
2. The **dispatcher** detects which agent should respond (based on DM channel or @mention)
3. The **agent-runner** builds a prompt from conversation history + system prompt
4. `base-agent.ts` spawns `claude --print --verbose --output-format stream-json` with the prompt piped via stdin
5. Output is streamed line-by-line as JSON events, parsed for text content
6. The agent's response is saved as a message and broadcast via socket.io

## Authentication Methods

### 1. CLI OAuth — Development Only

The `claude` CLI stores OAuth tokens in the macOS keychain. When you run `claude /login`, it authenticates via browser and stores the token. Spawned subprocesses use this automatically.

**Setup:**
```bash
claude /login
npm run dev
```

#### OAuth Limitations

| Concern | Impact |
|---------|--------|
| **Tokens expire (~1 hour)** | Agents fail with 401 until you re-login |
| **No headless refresh** | Requires interactive browser login — cannot run on servers |
| **No CI/CD support** | Cannot automate login in pipelines |
| **No Docker support** | No keychain or browser available in containers |
| **Tied to personal subscription** | Uses your Claude Pro/Max account, not an API billing account |
| **Concurrency limits** | Subscription-tier limits, not API-tier limits |
| **Cannot be shared** | Tokens are per-user, per-machine |
| **Machine sleep** | Token may expire while machine is sleeping; refresh may also fail |

**Bottom line: OAuth is free and convenient for local dev, but you CANNOT deploy to a server with it.**

### 2. API Key — Production / Server

A standard `sk-ant-api03-...` key from console.anthropic.com. Usage-based billing.

**Setup:**
```bash
# .env
ANTHROPIC_API_KEY=sk-ant-api03-...
```

The CLI picks this up automatically — no env stripping needed when a real key is present.

**Use for:** Production, CI/CD, Docker, headless servers, shared environments.

### What Doesn't Work: Environment Variables from Claude Desktop

Claude Desktop / Claude Code injects these env vars into child processes:

| Variable | Value | Problem |
|----------|-------|---------|
| `ANTHROPIC_API_KEY` | `""` (empty string) | CLI tries to use it instead of OAuth, fails |
| `ANTHROPIC_AUTH_TOKEN` | Short session token | Local SSE token, not a real API auth token |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Correct but irrelevant when using CLI OAuth |

**We strip ALL of these** before spawning the CLI so it falls back to keychain OAuth:

```typescript
const env = { ...process.env };
delete env['ANTHROPIC_API_KEY'];
delete env['ANTHROPIC_AUTH_TOKEN'];
delete env['ANTHROPIC_BASE_URL'];
delete env['CLAUDE_CODE_SSE_PORT'];
```

### What Also Doesn't Work: Claude Agent SDK (without API key)

The `@anthropic-ai/claude-agent-sdk` `query()` function makes in-process API calls using environment variables. Since those are empty/invalid under Claude Desktop, the SDK fails with `ENOTFOUND`. The SDK does NOT fall back to keychain OAuth.

We tried:
- Deleting env vars before `import()` — cached after first load
- Passing `env` option to `query()` — not a valid SDK option
- `unset` in npm scripts — Nx re-injects the vars

**Verdict:** The SDK requires a real `ANTHROPIC_API_KEY`. Without one, use the CLI approach.

## Retry Logic

`base-agent.ts` implements automatic retry on auth failure:

1. Agent invocation fails with `authentication_error` or "OAuth token has expired"
2. System attempts `claude auth refresh` (15s timeout)
3. If refresh succeeds → agent is re-invoked automatically
4. If refresh fails → user-facing error: "Please run `claude /login`"

This handles the common case of a token expiring mid-session. It does NOT handle:
- Tokens that expired while the machine was asleep (refresh may also fail)
- Revoked tokens or account issues
- Network connectivity problems

## Gotchas

### 1. OAuth tokens expire (~1 hour)

**Symptom:** `401 authentication_error: OAuth token has expired`
**Fix:** The retry logic attempts auto-refresh. If that fails, run `claude /login`.

### 2. CLI needs `--dangerously-skip-permissions`

Without this flag, the CLI hangs waiting for interactive permission approval. Agents run non-interactively, so permissions must be bypassed.

### 3. Prompt must be piped via stdin

Long prompts exceed the OS argument length limit. Always pipe:

```typescript
const child = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
child.stdin.write(prompt);
child.stdin.end();
```

### 4. `--verbose` is required for `--output-format stream-json`

The CLI enforces this: `--output-format=stream-json requires --verbose`.

### 5. `--allowedTools` accepts comma-separated values

```
--allowedTools Read,Write,Edit,Bash,Glob,Grep
```

### 6. Dispatcher only triggers from socket.io by default

The REST `POST /api/messages` route needed manual wiring to call `dispatcher.onMessage()`.

### 7. Nx dev server and env vars

`unset VAR` in npm scripts doesn't reliably propagate through Nx's process chain. Env cleanup must happen in Node code (`delete process.env[...]`), and again per-spawn in `base-agent.ts`.

## Production Deployment

### With API Key (Recommended)

1. Get a key from [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Set `ANTHROPIC_API_KEY=sk-ant-api03-...` in your server environment
3. The CLI uses the key directly — no OAuth, no expiry, no browser needed

### Cost Control

Override expensive models per agent:
```bash
AGENT_DEVELOPER_MODEL=haiku
AGENT_ARCHITECT_MODEL=haiku
AGENT_TESTER_MODEL=haiku
AGENT_GRUNT_MODEL=haiku
AGENT_PROJECT_MANAGER_MODEL=haiku
```

### Docker

```dockerfile
ENV ANTHROPIC_API_KEY=sk-ant-api03-...
# Or mount from secrets manager
```

OAuth does NOT work in Docker — there's no keychain or browser.

## CLI Flags Reference

```bash
claude \
  --print \                          # Non-interactive output mode
  --verbose \                        # Required for stream-json
  --output-format stream-json \      # JSON event stream on stdout
  --model claude-haiku-4-5 \         # Model override
  --max-turns 8 \                    # Limit conversation turns
  --dangerously-skip-permissions \   # Skip interactive permission prompts
  --system-prompt "You are..." \     # Agent personality/instructions
  --allowedTools Read,Glob,Grep      # Restrict available tools
```

## File Reference

| File | Purpose |
|------|---------|
| `libs/agents/src/base-agent.ts` | Spawns CLI, streams output, cleans env, retries on auth failure |
| `apps/task-manager/src/orchestrator/agent-runner.ts` | Builds prompts, manages agent runs |
| `apps/task-manager/src/orchestrator/agent-dispatcher.ts` | Routes messages to agents |
| `apps/task-manager/src/orchestrator/prompt-builder.ts` | Constructs prompts with conversation history |
| `apps/task-manager/src/orchestrator/agent-directives.ts` | Parses structured directives from agent output |
| `libs/agents/src/cyclawps-mcp.ts` | MCP server tools (chat, tasks, handoffs) — pending SDK integration |

## Future: MCP Server Integration

The `cyclawps-mcp.ts` MCP server is built and ready. It gives agents native tools for chat, tasks, and handoffs — replacing the directive system. Currently parked because the Agent SDK requires a real API key (not OAuth).

When an API key is available, switch from CLI spawn to SDK `query()` with:
```typescript
mcpServers: { cyclawps: await createCyclawpsMcp(ctx) }
```
