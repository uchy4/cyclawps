# Plan: New Agent Creator Skill + Prompt Refinement UI

## Context
When creating new agents in the agents-manager, the user wants agentic help from Claude. This plan adds:
1. A Claude Code skill so Claude can scaffold `.agent.yaml` files
2. A backend endpoint to refine system prompts via Claude
3. A "Clarify with Claude" button with side-by-side before/after view
4. A stubbed Whisper mic button on the system prompt textarea

---

## Step 1: Create Claude Code Skill
**New file:** `.claude/skills/new-agent-creator.md`

- Frontmatter with description for Claude Code discovery
- Documents the YAML schema (name, displayName, role, description, model, apiKeyEnv, maxTurns, tools, systemPrompt)
- Lists available tools and models
- Naming conventions: `agents/<role>.agent.yaml`, `AGENT_<ROLE>_API_KEY`
- Includes a full annotated example based on the architect agent pattern
- Instructs Claude to ask clarifying questions before writing the file

---

## Step 2: Backend Endpoint — `POST /api/agents/refine-prompt`
**Modify:** `apps/task-manager/src/routes/agents.routes.ts`

- Add route **before** the `POST /api/agents/:role/invoke` route (otherwise Fastify matches "refine-prompt" as a `:role` param)
- Request body: `{ systemPrompt: string, agentName?: string, agentRole?: string, agentDescription?: string }`
- Response: `{ original: string, refined: string }`
- Uses raw `fetch` to `https://api.anthropic.com/v1/messages` with `ANTHROPIC_API_KEY` (simpler than importing the full SDK for a single-turn call)
- Meta-prompt tells Claude to improve clarity, structure, numbered responsibilities, preserve intent, and return only the refined text
- Error handling: 400 if empty prompt, 500 if no API key, 502 if Claude API fails

---

## Step 3: "Clarify with Claude" Button + Side-by-Side Modal

### 3a: New component — `PromptRefineModal.tsx`
**New file:** `apps/agent-configurator/src/components/PromptRefineModal.tsx`

- Fixed overlay (same pattern as `Drawer.tsx` — `fixed inset-0 z-50`, black/50 backdrop, Escape to close)
- Centered modal panel, `max-w-5xl`
- Two side-by-side columns: "Before" (left) and "After" (right, violet left border accent)
- Both display prompt text in `font-mono text-[13px] bg-slate-950` panels
- Footer: "Accept" (violet primary button) and "Dismiss" (outline secondary)
- Props: `original`, `refined`, `onAccept(refined)`, `onDismiss()`

### 3b: Integrate into AgentEditor.tsx
**Modify:** `apps/agent-configurator/src/components/AgentEditor.tsx`

- Add state: `refining` (boolean), `refineResult` ({ original, refined } | null)
- Add "Clarify with Claude" button below the textarea (only visible when prompt is non-empty)
- Button uses `Sparkles` icon from `lucide-react`, violet outline style
- On click: calls `/api/agents/refine-prompt`, shows loading state
- On success: opens `PromptRefineModal`
- Accept: updates `formData.systemPrompt` with refined text, clears modal
- Dismiss: clears modal

---

## Step 4: Whisper Mic Button (Stub)
**Modify:** `apps/agent-configurator/src/components/AgentEditor.tsx`

- Wrap textarea in `<div className="relative">`
- When textarea is **empty**: large centered mic button (w-16 h-16 circle, slate-800 bg)
- When textarea has **content**: small mic button at bottom-right corner (w-8 h-8)
- Uses `Mic` icon from `lucide-react`
- On click: show a toast "Voice transcription coming soon" that auto-dismisses after 2.5s
- `pointer-events-none` on overlay container, `pointer-events-auto` on button (so textarea remains clickable)

---

## Files Summary
| Action | File |
|--------|------|
| Create | `.claude/skills/new-agent-creator.md` |
| Modify | `apps/task-manager/src/routes/agents.routes.ts` |
| Create | `apps/agent-configurator/src/components/PromptRefineModal.tsx` |
| Modify | `apps/agent-configurator/src/components/AgentEditor.tsx` |

## Verification
1. Run task-manager (`nx serve task-manager`) and agent-configurator (`nx serve agent-configurator`)
2. Open agent-configurator, create a new agent
3. Type a rough system prompt — verify mic button transitions from large to small
4. Click "Clarify with Claude" — verify loading state, then side-by-side modal appears
5. Accept refined prompt — verify textarea updates
6. Verify the Claude Code skill works by asking Claude to create a new agent
