# cyclawps — Todo

## In Progress
- [ ] Connect agent SDK to pipeline engine (invoke real agents)
- [ ] Task detail view — full-page or expanded card with comments/history

## Next Up
- [ ] @mention autocomplete dropdown in chat input
- [ ] Drag-and-drop between Kanban columns (dnd-kit)
- [ ] Pipeline visualization — show stage progress per task
- [ ] Agent run history view — logs, tokens used, duration
- [ ] Chat message threading — reply to specific messages
- [ ] Task search and filtering (by agent, status, priority)
- [ ] Notification system — toast/banner for pipeline events

## Backend
- [ ] Wire `POST /api/pipeline/start` to actual pipeline engine
- [ ] Wire `POST /api/agents/reset` to reseed from YAML
- [ ] Add `DELETE /api/tasks/:id` cascade to agent_runs and messages
- [ ] Rate limiting on API endpoints
- [ ] Request validation with zod schemas on all routes
- [ ] Error handling middleware for consistent error responses

## UI Polish
- [ ] Loading skeletons instead of "Loading..." text
- [ ] Empty state illustrations
- [ ] Keyboard shortcuts (N for new task, E for edit, Esc to close)
- [ ] Responsive sidebar — collapse to icons on small screens
- [ ] Dark/light theme toggle (Prism pattern)
- [ ] PWA icon — replace placeholder SVG with real icon

## DevOps
- [ ] Add ESLint + Prettier config
- [ ] Add unit tests (Vitest for React, Jest for server)
- [ ] GitHub Actions CI workflow
- [ ] Docker Compose for server + SQLite
- [ ] Environment-specific configs (dev/staging/prod)

## Done
- [x] Nx monorepo scaffold with TypeScript
- [x] Shared types library (libs/shared)
- [x] Agents library with SDK wrapper (libs/agents)
- [x] Agent YAML seed files (Pam, Archie, Devin, Tessa, Grunt)
- [x] Fastify task-manager server with SQLite
- [x] REST API — tasks, messages, agents, pipeline CRUD
- [x] WebSocket real-time updates via socket.io
- [x] Pipeline engine with configurable YAML stages
- [x] Authorization gate — pause pipeline for user approval
- [x] Kanban board React app with Tailwind
- [x] Chat client with agent sub-nav and @mention targeting
- [x] Agent configurator with card grid + slide-out drawer editor
- [x] Unified PWA dashboard with sidebar routing
- [x] Prism design system (Inter font, zinc/orange, dark mode)
- [x] Nx project tags + module boundary enforcement
- [x] Nx targets for all projects (serve, build)
- [x] Per-agent env vars with ANTHROPIC_API_KEY fallback
- [x] displayName field for agent personas
- [x] Web Interface Guidelines accessibility fixes
- [x] Claude hook blocking --legacy-peer-deps
