# Plan: New Agent Creator Skill + AI-Assisted System Prompt Editor

## Context

When creating a new agent, the system prompt textarea is a plain text field with no assistance. The user wants an AI-powered workflow: describe the agent (via typing or Whisper voice input), click "Clarify with Claude" to get AI-refined prompt suggestions, and see a side-by-side before/after comparison to accept or reject changes. Additionally, a Claude Code SKILL.md should exist so Claude Code itself can help scaffold new agents.

## Changes Overview

### 1. Move `useWhisper` hook to shared library
- **Move** `apps/dashboard/src/hooks/useWhisper.ts` → `libs/shared/src/hooks/useWhisper.ts`
- **Update** `libs/shared/src/index.ts` — add `export { useWhisper } from './hooks/useWhisper.js'`
- **Update** `apps/dashboard/src/views/ChatView.tsx` — change import to `'@agents-manager/shared'`

### 2. Backend: Prompt refinement endpoint
- **Install** `@anthropic-ai/sdk` dependency in root `package.json`
- **Create** `apps/task-manager/src/routes/refine-prompt.routes.ts`
  - `POST /api/agents/refine-prompt`
  - Request: `{ rawPrompt: string, agentContext?: { name?, role?, description?, tools? } }`
  - Response: `{ refinedPrompt: string, changes: string[] }`
  - Uses `@anthropic-ai/sdk` directly with `claude-haiku-4-5` (fast/cheap for text editing)
  - Reads `ANTHROPIC_API_KEY` from env
  - Meta-prompt instructs Claude to: restructure into clear sections with markdown headers (## Role, ## Responsibilities, ## Output Format, ## Constraints, ## Persona), improve clarity, add missing constraints, preserve user intent, and list changes made
- **Update** `apps/task-manager/src/main.ts` — register `registerRefinePromptRoutes(fastify)` alongside other routes

### 3. Frontend: `SystemPromptEditor` component
- **Create** `apps/agent-configurator/src/components/SystemPromptEditor.tsx`
  - Props: `{ value, onChange, agentContext?, rows? }`
  - Contains:
    - Textarea with monospace styling (reuses existing classes)
    - **Mic button** (bottom-right of textarea) — uses shared `useWhisper` hook; recording state shows red border + pulsing icon
    - **"Clarify with Claude" button** — appears below textarea when prompt is non-empty; calls `POST /api/agents/refine-prompt`; shows spinner while loading
    - On refinement success → shows `PromptCompare` side-by-side view

### 4. Frontend: `PromptCompare` side-by-side component
- **Create** `apps/agent-configurator/src/components/PromptCompare.tsx`
  - Props: `{ original, refined, changes, onAccept, onReject }`
  - Two-panel layout: "Original" (left) / "Refined by Claude" (right)
  - Both panels use monospace `pre` styling, scrollable
  - Changes list shown as small bullets below panels
  - "Accept" button (violet primary) → calls `onAccept` which sets the refined prompt
  - "Keep Original" button (outline secondary) → calls `onReject` which dismisses comparison
  - Responsive: stacks vertically on narrow screens

### 5. Wire into existing editors
- **Update** `apps/agent-configurator/src/components/steps/PromptStep.tsx` — replace textarea with `<SystemPromptEditor>`, passing full agent context from `data`
- **Update** `apps/agent-configurator/src/components/AgentEditor.tsx` — replace inline system prompt textarea (lines 213-224) with `<SystemPromptEditor>`

### 6. Claude Code SKILL.md
- **Create** `.agents/skills/new-agent-creator/SKILL.md`
  - Frontmatter: `name: new-agent-creator`, description with trigger words (create agent, new agent, scaffold agent)
  - Content: agent YAML format reference, system prompt best practices (role definition, responsibilities, output format, constraints, persona), step-by-step workflow for Claude Code to follow when helping create an agent

## Implementation Order

1. Move `useWhisper` to shared lib + fix ChatView import
2. Install `@anthropic-ai/sdk` + create `refine-prompt.routes.ts` + register in `main.ts`
3. Create `PromptCompare.tsx`
4. Create `SystemPromptEditor.tsx` (integrates Whisper + Clarify + PromptCompare)
5. Update `PromptStep.tsx` and `AgentEditor.tsx` to use `SystemPromptEditor`
6. Create SKILL.md

## Key Files
- `apps/agent-configurator/src/components/steps/PromptStep.tsx` — currently 27-line simple textarea
- `apps/agent-configurator/src/components/AgentEditor.tsx` — single-page form, system prompt at lines 213-224
- `apps/dashboard/src/hooks/useWhisper.ts` — hook to move to shared
- `apps/dashboard/src/views/ChatView.tsx` — import path to update
- `apps/task-manager/src/main.ts` — register new route
- `apps/task-manager/src/routes/agents.routes.ts` — pattern reference for new route
- `libs/shared/src/index.ts` — add useWhisper export

## Verification
1. Start the task-manager backend, verify `POST /api/agents/refine-prompt` works via curl with a sample prompt
2. Start the dashboard/configurator, open agent wizard → System Prompt step
3. Type a rough prompt → verify "Clarify with Claude" button appears
4. Click it → verify side-by-side comparison shows with refined prompt
5. Click Accept → verify textarea updates with refined content
6. Click Keep Original → verify original is preserved
7. Test mic button → verify Whisper recording/transcription appends to textarea
8. Verify ChatView whisper still works after import path change
