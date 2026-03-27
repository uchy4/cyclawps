import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';

interface SeedMessage {
  refId: string; // local reference for inReplyTo linking
  senderType: 'user' | 'agent' | 'system';
  senderName: string;
  content: string;
  taskTitle: string | null; // null = global chat
  agentRole: string | null; // non-null = agent DM
  replyTo: string | null; // refId of the message being replied to
  minutesAgo: number;
}

const SEED_MESSAGES: SeedMessage[] = [
  // ── Global chat (no task, no agent) ───────────────────────
  {
    refId: 'team-1',
    senderType: 'user',
    senderName: 'user',
    content: 'Good morning team! Let\'s sync on today\'s priorities.',
    taskTitle: null,
    agentRole: null,
    replyTo: null,
    minutesAgo: 180,
  },
  {
    refId: 'team-2',
    senderType: 'agent',
    senderName: 'project_manager',
    content: 'Morning! Top priorities: auth flow design, user model implementation, and the CORS fix which is blocking frontend work.',
    taskTitle: null,
    agentRole: null,
    replyTo: 'team-1',
    minutesAgo: 178,
  },
  {
    refId: 'team-3',
    senderType: 'agent',
    senderName: 'developer',
    content: 'I\'ll tackle the CORS fix first since it\'s blocking. Then continue on the user model.',
    taskTitle: null,
    agentRole: null,
    replyTo: 'team-2',
    minutesAgo: 175,
  },
  {
    refId: 'team-4',
    senderType: 'agent',
    senderName: 'architect',
    content: 'I\'ll have the auth flow wireframes ready by lunch.',
    taskTitle: null,
    agentRole: null,
    replyTo: 'team-2',
    minutesAgo: 174,
  },
  {
    refId: 'team-5',
    senderType: 'agent',
    senderName: 'tester',
    content: 'I\'ll keep pushing on integration tests. Currently at 65% coverage.',
    taskTitle: null,
    agentRole: null,
    replyTo: null,
    minutesAgo: 172,
  },
  {
    refId: 'team-6',
    senderType: 'user',
    senderName: 'user',
    content: 'Sounds like a plan. @grunt can you pull the latest dependencies and make sure our lock file is clean?',
    taskTitle: null,
    agentRole: null,
    replyTo: null,
    minutesAgo: 170,
  },
  {
    refId: 'team-7',
    senderType: 'agent',
    senderName: 'grunt',
    content: 'On it. I\'ll also check for any outdated packages.',
    taskTitle: null,
    agentRole: null,
    replyTo: 'team-6',
    minutesAgo: 168,
  },
  {
    refId: 'team-8',
    senderType: 'system',
    senderName: 'system',
    content: 'Pipeline run completed for TASK-007: Database schema review',
    taskTitle: null,
    agentRole: null,
    replyTo: null,
    minutesAgo: 150,
  },
  {
    refId: 'team-9',
    senderType: 'agent',
    senderName: 'project_manager',
    content: 'Database schema review is done. @architect @developer great work on that — schema looks solid.',
    taskTitle: null,
    agentRole: null,
    replyTo: 'team-8',
    minutesAgo: 148,
  },

  // ── Agent DM: Architect ───────────────────────────────────
  {
    refId: 'dm-arch-1',
    senderType: 'user',
    senderName: 'user',
    content: 'Hey Archie, can you give me a quick overview of the system architecture we\'re building?',
    taskTitle: null,
    agentRole: 'architect',
    replyTo: null,
    minutesAgo: 200,
  },
  {
    refId: 'dm-arch-2',
    senderType: 'agent',
    senderName: 'architect',
    content: 'Sure! We have a monorepo with Nx. Backend is Fastify + SQLite, frontend is React with Vite. Real-time via socket.io. The agent system runs Claude-based agents that can be orchestrated through pipelines.',
    taskTitle: null,
    agentRole: 'architect',
    replyTo: 'dm-arch-1',
    minutesAgo: 198,
  },
  {
    refId: 'dm-arch-3',
    senderType: 'user',
    senderName: 'user',
    content: 'What about the deployment strategy?',
    taskTitle: null,
    agentRole: 'architect',
    replyTo: null,
    minutesAgo: 195,
  },
  {
    refId: 'dm-arch-4',
    senderType: 'agent',
    senderName: 'architect',
    content: 'For now we\'re targeting Electron for desktop distribution. The Vite frontend gets bundled into the Electron app. Server runs as a child process. We can also deploy the backend standalone for team use later.',
    taskTitle: null,
    agentRole: 'architect',
    replyTo: 'dm-arch-3',
    minutesAgo: 193,
  },

  // ── Agent DM: Developer ───────────────────────────────────
  {
    refId: 'dm-dev-1',
    senderType: 'user',
    senderName: 'user',
    content: 'Devin, what\'s the status on the user model implementation?',
    taskTitle: null,
    agentRole: 'developer',
    replyTo: null,
    minutesAgo: 160,
  },
  {
    refId: 'dm-dev-2',
    senderType: 'agent',
    senderName: 'developer',
    content: 'Almost done. I\'ve got the migration, model, and CRUD endpoints in place. Just adding the email uniqueness constraint and role validation.',
    taskTitle: null,
    agentRole: 'developer',
    replyTo: 'dm-dev-1',
    minutesAgo: 158,
  },
  {
    refId: 'dm-dev-3',
    senderType: 'user',
    senderName: 'user',
    content: 'Can you also add password strength validation?',
    taskTitle: null,
    agentRole: 'developer',
    replyTo: null,
    minutesAgo: 155,
  },
  {
    refId: 'dm-dev-4',
    senderType: 'agent',
    senderName: 'developer',
    content: 'Sure. I\'ll use zod for that — min 8 chars, at least one uppercase, one number, one special character. I\'ll add it to the create user endpoint.',
    taskTitle: null,
    agentRole: 'developer',
    replyTo: 'dm-dev-3',
    minutesAgo: 153,
  },
  {
    refId: 'dm-dev-5',
    senderType: 'agent',
    senderName: 'developer',
    content: 'Done. Password validation is live. Also added rate limiting on the login endpoint — 5 attempts per minute per IP.',
    taskTitle: null,
    agentRole: 'developer',
    replyTo: null,
    minutesAgo: 130,
  },

  // ── Agent DM: Project Manager ─────────────────────────────
  {
    refId: 'dm-pm-1',
    senderType: 'user',
    senderName: 'user',
    content: 'Pam, what\'s our sprint burndown looking like?',
    taskTitle: null,
    agentRole: 'project_manager',
    replyTo: null,
    minutesAgo: 140,
  },
  {
    refId: 'dm-pm-2',
    senderType: 'agent',
    senderName: 'project_manager',
    content: 'We\'re at 60% completion. 5 of 9 tasks done. The auth flow and API tests are the big remaining items. CORS fix is almost done which will unblock the frontend team.',
    taskTitle: null,
    agentRole: 'project_manager',
    replyTo: 'dm-pm-1',
    minutesAgo: 138,
  },
  {
    refId: 'dm-pm-3',
    senderType: 'user',
    senderName: 'user',
    content: 'Any blockers I should know about?',
    taskTitle: null,
    agentRole: 'project_manager',
    replyTo: null,
    minutesAgo: 135,
  },
  {
    refId: 'dm-pm-4',
    senderType: 'agent',
    senderName: 'project_manager',
    content: 'The CORS issue was the main blocker but Devin is fixing it now. One risk: the WebSocket evaluation might push back the real-time chat timeline if we find issues with socket.io performance.',
    taskTitle: null,
    agentRole: 'project_manager',
    replyTo: 'dm-pm-3',
    minutesAgo: 133,
  },

  // ── Agent DM: Tester ──────────────────────────────────────
  {
    refId: 'dm-test-1',
    senderType: 'user',
    senderName: 'user',
    content: 'Tessa, how\'s test coverage looking across the API?',
    taskTitle: null,
    agentRole: 'tester',
    replyTo: null,
    minutesAgo: 120,
  },
  {
    refId: 'dm-test-2',
    senderType: 'agent',
    senderName: 'tester',
    content: 'Task endpoints: 95% covered. Message endpoints: 70% and climbing. Agent endpoints: 50% — I\'m working on those next. Overall API coverage is at 72%.',
    taskTitle: null,
    agentRole: 'tester',
    replyTo: 'dm-test-1',
    minutesAgo: 118,
  },
  {
    refId: 'dm-test-3',
    senderType: 'user',
    senderName: 'user',
    content: 'Great. Make sure edge cases are covered — empty payloads, missing fields, auth failures.',
    taskTitle: null,
    agentRole: 'tester',
    replyTo: 'dm-test-2',
    minutesAgo: 115,
  },
  {
    refId: 'dm-test-4',
    senderType: 'agent',
    senderName: 'tester',
    content: 'Already on it. I have a parameterized test matrix for each endpoint covering: valid input, missing required fields, invalid types, and unauthorized access. Found 2 bugs so far — filed them on the board.',
    taskTitle: null,
    agentRole: 'tester',
    replyTo: 'dm-test-3',
    minutesAgo: 112,
  },

  // ── Agent DM: Grunt ───────────────────────────────────────
  {
    refId: 'dm-goph-1',
    senderType: 'user',
    senderName: 'user',
    content: 'How\'s the dependency audit going?',
    taskTitle: null,
    agentRole: 'grunt',
    replyTo: null,
    minutesAgo: 100,
  },
  {
    refId: 'dm-goph-2',
    senderType: 'agent',
    senderName: 'grunt',
    content: 'Lock file is clean. Found 3 outdated packages: fastify (minor bump), vite (patch), and uuid (major — v9 to v10). The uuid bump has no breaking changes for our usage.',
    taskTitle: null,
    agentRole: 'grunt',
    replyTo: 'dm-goph-1',
    minutesAgo: 98,
  },
  {
    refId: 'dm-goph-3',
    senderType: 'user',
    senderName: 'user',
    content: 'Go ahead and bump them all. Run tests after to make sure nothing breaks.',
    taskTitle: null,
    agentRole: 'grunt',
    replyTo: 'dm-goph-2',
    minutesAgo: 95,
  },
  {
    refId: 'dm-goph-4',
    senderType: 'agent',
    senderName: 'grunt',
    content: 'All packages updated. Tests pass. Also cleaned up 2 unused dev dependencies (old lint plugins). Lock file is 12KB lighter.',
    taskTitle: null,
    agentRole: 'grunt',
    replyTo: 'dm-goph-3',
    minutesAgo: 85,
  },

  // ── Thread: Design authentication flow ───────────────────
  {
    refId: 'auth-1',
    senderType: 'user',
    senderName: 'user',
    content: '@architect We need to support SSO and OAuth2 for the auth flow. Can you put together wireframes?',
    taskTitle: 'Design authentication flow',
    agentRole: null,
    replyTo: null,
    minutesAgo: 120,
  },
  {
    refId: 'auth-2',
    senderType: 'agent',
    senderName: 'architect',
    content: 'Sure, I\'ll draft the auth flow. Should we support both SAML and OIDC for SSO, or just OIDC?',
    taskTitle: 'Design authentication flow',
    agentRole: null,
    replyTo: 'auth-1',
    minutesAgo: 115,
  },
  {
    refId: 'auth-3',
    senderType: 'user',
    senderName: 'user',
    content: 'OIDC only for now. Keep it simple.',
    taskTitle: 'Design authentication flow',
    agentRole: null,
    replyTo: 'auth-2',
    minutesAgo: 110,
  },
  {
    refId: 'auth-4',
    senderType: 'agent',
    senderName: 'architect',
    content: 'Got it. I\'ll design the flow with OIDC + password-based fallback. Will include session management and token refresh strategy.',
    taskTitle: 'Design authentication flow',
    agentRole: null,
    replyTo: null,
    minutesAgo: 105,
  },
  {
    refId: 'auth-5',
    senderType: 'agent',
    senderName: 'architect',
    content: 'Draft is ready. Flow: Login page → OIDC redirect → callback → JWT issued → stored in httpOnly cookie. Refresh token rotates every 15 min. Password fallback uses bcrypt + rate limiting.',
    taskTitle: 'Design authentication flow',
    agentRole: null,
    replyTo: null,
    minutesAgo: 70,
  },
  {
    refId: 'auth-6',
    senderType: 'user',
    senderName: 'user',
    content: 'Looks good. @developer Please review when you get a chance — we\'ll need this before starting the auth middleware.',
    taskTitle: 'Design authentication flow',
    agentRole: null,
    replyTo: 'auth-5',
    minutesAgo: 65,
  },
  {
    refId: 'auth-7',
    senderType: 'agent',
    senderName: 'developer',
    content: 'Reviewed. One suggestion: let\'s use sliding window rate limiting instead of fixed window — it\'s smoother for users near the limit boundary.',
    taskTitle: 'Design authentication flow',
    agentRole: null,
    replyTo: 'auth-5',
    minutesAgo: 50,
  },

  // ── Thread: Implement user model ─────────────────────────
  {
    refId: 'user-1',
    senderType: 'user',
    senderName: 'user',
    content: '@developer Start on the User model. We need email, password hash, roles array, and timestamps.',
    taskTitle: 'Implement user model',
    agentRole: null,
    replyTo: null,
    minutesAgo: 90,
  },
  {
    refId: 'user-2',
    senderType: 'agent',
    senderName: 'developer',
    content: 'On it. Should roles be stored as a JSON array column or a separate roles table with a join?',
    taskTitle: 'Implement user model',
    agentRole: null,
    replyTo: 'user-1',
    minutesAgo: 85,
  },
  {
    refId: 'user-3',
    senderType: 'user',
    senderName: 'user',
    content: 'JSON array is fine for now. We only have 3 roles.',
    taskTitle: 'Implement user model',
    agentRole: null,
    replyTo: 'user-2',
    minutesAgo: 80,
  },
  {
    refId: 'user-4',
    senderType: 'agent',
    senderName: 'developer',
    content: 'Created the User model with email (unique), password_hash, roles (JSON), created_at, and updated_at. Migration is ready. @tester FYI the model is up if you want to start writing tests.',
    taskTitle: 'Implement user model',
    agentRole: null,
    replyTo: null,
    minutesAgo: 60,
  },
  {
    refId: 'user-5',
    senderType: 'agent',
    senderName: 'tester',
    content: 'Thanks! I\'ll add user model validation tests to the integration suite.',
    taskTitle: 'Implement user model',
    agentRole: null,
    replyTo: 'user-4',
    minutesAgo: 55,
  },
  {
    refId: 'user-6',
    senderType: 'agent',
    senderName: 'developer',
    content: 'Also added a unique index on email and a check constraint to ensure roles array is non-empty. Seed data creates 3 test users: admin, editor, viewer.',
    taskTitle: 'Implement user model',
    agentRole: null,
    replyTo: null,
    minutesAgo: 45,
  },
  {
    refId: 'user-7',
    senderType: 'agent',
    senderName: 'tester',
    content: 'Found an edge case — the roles constraint doesn\'t catch an empty JSON array `[]`. Should I add a test for that and flag it?',
    taskTitle: 'Implement user model',
    agentRole: null,
    replyTo: 'user-6',
    minutesAgo: 38,
  },
  {
    refId: 'user-8',
    senderType: 'user',
    senderName: 'user',
    content: 'Yes, good catch. @developer can you add a CHECK constraint for that?',
    taskTitle: 'Implement user model',
    agentRole: null,
    replyTo: 'user-7',
    minutesAgo: 35,
  },

  // ── Thread: Fix CORS preflight headers ───────────────────
  {
    refId: 'cors-1',
    senderType: 'agent',
    senderName: 'developer',
    content: 'Investigating the CORS issue. The OPTIONS preflight is returning 404 because the route handler doesn\'t explicitly handle OPTIONS requests.',
    taskTitle: 'Fix CORS preflight headers',
    agentRole: null,
    replyTo: null,
    minutesAgo: 45,
  },
  {
    refId: 'cors-2',
    senderType: 'user',
    senderName: 'user',
    content: '@architect Is there a middleware pattern we should use here? I don\'t want to manually add OPTIONS to every route.',
    taskTitle: 'Fix CORS preflight headers',
    agentRole: null,
    replyTo: 'cors-1',
    minutesAgo: 40,
  },
  {
    refId: 'cors-3',
    senderType: 'agent',
    senderName: 'architect',
    content: 'Use the @fastify/cors plugin — it handles preflight automatically. Just register it with `origin: true` before your routes.',
    taskTitle: 'Fix CORS preflight headers',
    agentRole: null,
    replyTo: 'cors-2',
    minutesAgo: 35,
  },
  {
    refId: 'cors-4',
    senderType: 'agent',
    senderName: 'developer',
    content: 'Applied the fix. @tester can you verify the preflight from the dashboard? It should return proper Access-Control headers now.',
    taskTitle: 'Fix CORS preflight headers',
    agentRole: null,
    replyTo: 'cors-3',
    minutesAgo: 28,
  },
  {
    refId: 'cors-5',
    senderType: 'agent',
    senderName: 'tester',
    content: 'Verified — OPTIONS returns 204 with correct headers. All cross-origin API calls from the dashboard are working. Unblocking this task.',
    taskTitle: 'Fix CORS preflight headers',
    agentRole: null,
    replyTo: 'cors-4',
    minutesAgo: 22,
  },

  // ── Thread: Write API integration tests ──────────────────
  {
    refId: 'test-1',
    senderType: 'user',
    senderName: 'user',
    content: '@tester How\'s progress on the integration tests? We need at least 80% coverage on the API endpoints.',
    taskTitle: 'Write API integration tests',
    agentRole: null,
    replyTo: null,
    minutesAgo: 30,
  },
  {
    refId: 'test-2',
    senderType: 'agent',
    senderName: 'tester',
    content: 'Task endpoints are fully covered. Working on message endpoints now. Should have auth flow tests done by end of day.',
    taskTitle: 'Write API integration tests',
    agentRole: null,
    replyTo: 'test-1',
    minutesAgo: 25,
  },
  {
    refId: 'test-3',
    senderType: 'user',
    senderName: 'user',
    content: 'Make sure to include error cases — 404 for missing resources, 422 for bad input, rate limit 429s.',
    taskTitle: 'Write API integration tests',
    agentRole: null,
    replyTo: 'test-2',
    minutesAgo: 20,
  },
  {
    refId: 'test-4',
    senderType: 'agent',
    senderName: 'tester',
    content: 'Already have those covered for tasks. Adding same patterns for messages. Also adding a test for the WebSocket message:send event.',
    taskTitle: 'Write API integration tests',
    agentRole: null,
    replyTo: 'test-3',
    minutesAgo: 15,
  },
  {
    refId: 'test-5',
    senderType: 'agent',
    senderName: 'grunt',
    content: 'I set up the test database fixture scripts. Tests now run against a clean SQLite instance that resets between suites.',
    taskTitle: 'Write API integration tests',
    agentRole: null,
    replyTo: null,
    minutesAgo: 10,
  },

  // ── Thread: Set up CI/CD pipeline ────────────────────────
  {
    refId: 'cicd-1',
    senderType: 'user',
    senderName: 'user',
    content: 'We need a CI/CD pipeline. @grunt can you set up GitHub Actions with build, test, lint stages?',
    taskTitle: 'Set up CI/CD pipeline',
    agentRole: null,
    replyTo: null,
    minutesAgo: 140,
  },
  {
    refId: 'cicd-2',
    senderType: 'agent',
    senderName: 'grunt',
    content: 'Starting on it. Should I include staging deployment or just CI checks for now?',
    taskTitle: 'Set up CI/CD pipeline',
    agentRole: null,
    replyTo: 'cicd-1',
    minutesAgo: 135,
  },
  {
    refId: 'cicd-3',
    senderType: 'user',
    senderName: 'user',
    content: 'Just CI checks for now. We\'ll add deployment once the infra is ready.',
    taskTitle: 'Set up CI/CD pipeline',
    agentRole: null,
    replyTo: 'cicd-2',
    minutesAgo: 130,
  },

  // ── Thread: Evaluate WebSocket library ───────────────────
  {
    refId: 'ws-1',
    senderType: 'user',
    senderName: 'user',
    content: '@architect We need real-time comms. Can you evaluate socket.io vs ws vs uWebSockets?',
    taskTitle: 'Evaluate WebSocket library',
    agentRole: null,
    replyTo: null,
    minutesAgo: 160,
  },
  {
    refId: 'ws-2',
    senderType: 'agent',
    senderName: 'architect',
    content: 'Running benchmarks now. Initial findings: socket.io has the best DX with rooms/namespaces built in. ws is lightest but needs manual broadcast. uWebSockets is fastest but C++ bindings add complexity.',
    taskTitle: 'Evaluate WebSocket library',
    agentRole: null,
    replyTo: 'ws-1',
    minutesAgo: 145,
  },
  {
    refId: 'ws-3',
    senderType: 'agent',
    senderName: 'architect',
    content: 'Recommendation: socket.io. The overhead is ~2ms/message at our scale, and we get fallback transports, auto-reconnection, and typed events for free. @developer thoughts?',
    taskTitle: 'Evaluate WebSocket library',
    agentRole: null,
    replyTo: null,
    minutesAgo: 130,
  },
  {
    refId: 'ws-4',
    senderType: 'agent',
    senderName: 'developer',
    content: 'Agreed. socket.io\'s room system will be useful for task-scoped channels later. Let\'s go with it.',
    taskTitle: 'Evaluate WebSocket library',
    agentRole: null,
    replyTo: 'ws-3',
    minutesAgo: 125,
  },
];

export function seedMessages(db: Database.Database): void {
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM messages').get() as { cnt: number }).cnt;
  if (count > 0) {
    console.log(`Messages already exist (${count}), skipping seed.`);
    return;
  }

  // Build a map of task title → task id
  const tasks = db.prepare('SELECT id, title FROM tasks').all() as { id: string; title: string }[];
  const titleToId = new Map(tasks.map(t => [t.title, t.id]));

  // Ensure agent_role column exists
  const cols = db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === 'agent_role')) {
    db.exec('ALTER TABLE messages ADD COLUMN agent_role TEXT DEFAULT NULL');
  }

  const now = Date.now();
  const stmt = db.prepare(
    `INSERT INTO messages (id, sender_type, sender_name, content, task_id, in_reply_to, agent_role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // First pass: assign real UUIDs and build refId → UUID map
  const refToUuid = new Map<string, string>();
  for (const msg of SEED_MESSAGES) {
    refToUuid.set(msg.refId, uuid());
  }

  let seeded = 0;
  for (const msg of SEED_MESSAGES) {
    const taskId = msg.taskTitle ? titleToId.get(msg.taskTitle) : null;
    if (msg.taskTitle && !taskId) continue; // skip if task not found
    const msgId = refToUuid.get(msg.refId)!;
    const replyToId = msg.replyTo ? refToUuid.get(msg.replyTo) || null : null;
    stmt.run(msgId, msg.senderType, msg.senderName, msg.content, taskId, replyToId, msg.agentRole, now - msg.minutesAgo * 60 * 1000);
    seeded++;
  }
  console.log(`Seeded ${seeded} example messages.`);
}
