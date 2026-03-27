import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';

interface SeedThread {
  name: string;
  participants: string[]; // agent roles
  taskTitles: string[];   // task titles to tag
  messages: Array<{
    refId: string;
    senderType: 'user' | 'agent' | 'system';
    senderName: string;
    content: string;
    replyTo: string | null;
    minutesAgo: number;
  }>;
}

const SEED_THREADS: SeedThread[] = [
  {
    name: 'Sprint Planning',
    participants: ['project_manager', 'architect', 'developer'],
    taskTitles: ['Design authentication flow', 'Implement user model'],
    messages: [
      {
        refId: 'sp-1',
        senderType: 'user',
        senderName: 'user',
        content: "Alright team, let's plan out this sprint. @Pam what's left on the board?",
        replyTo: null,
        minutesAgo: 300,
      },
      {
        refId: 'sp-2',
        senderType: 'agent',
        senderName: 'project_manager',
        content: "We have 9 tasks total. 5 are done, 2 in progress (auth flow + user model), and 2 are todo (CI/CD + WebSocket eval). I'd say we're on track for the sprint goal.",
        replyTo: 'sp-1',
        minutesAgo: 297,
      },
      {
        refId: 'sp-3',
        senderType: 'agent',
        senderName: 'architect',
        content: "Auth flow design is nearly wrapped up. I just need Devin's feedback on the token refresh strategy before marking it done.",
        replyTo: 'sp-2',
        minutesAgo: 294,
      },
      {
        refId: 'sp-4',
        senderType: 'agent',
        senderName: 'developer',
        content: "I'll review the auth flow this afternoon. User model is in good shape — just need to add the empty-roles constraint that Tessa flagged.",
        replyTo: 'sp-3',
        minutesAgo: 291,
      },
      {
        refId: 'sp-5',
        senderType: 'user',
        senderName: 'user',
        content: "Good. Let's prioritize finishing the in-progress items before picking up anything new. @Pam can you update the board?",
        replyTo: null,
        minutesAgo: 288,
      },
      {
        refId: 'sp-6',
        senderType: 'agent',
        senderName: 'project_manager',
        content: "Done. I've also bumped the CI/CD setup to next sprint since it's not blocking anything right now.",
        replyTo: 'sp-5',
        minutesAgo: 285,
      },
    ],
  },
  {
    name: 'Bug Triage',
    participants: ['tester', 'developer', 'project_manager'],
    taskTitles: ['Fix CORS preflight headers'],
    messages: [
      {
        refId: 'bt-1',
        senderType: 'agent',
        senderName: 'tester',
        content: "I found 3 bugs during today's testing session. Prioritizing them now.",
        replyTo: null,
        minutesAgo: 240,
      },
      {
        refId: 'bt-2',
        senderType: 'agent',
        senderName: 'tester',
        content: "Bug 1 (Critical): CORS preflight returns 404 — blocks all frontend API calls.\nBug 2 (Medium): Empty roles array passes validation — should be rejected.\nBug 3 (Low): Reaction emoji picker doesn't close on outside click.",
        replyTo: 'bt-1',
        minutesAgo: 237,
      },
      {
        refId: 'bt-3',
        senderType: 'agent',
        senderName: 'project_manager',
        content: "Bug 1 is definitely the top priority. @Devin that's yours — it's blocking the whole frontend team.",
        replyTo: 'bt-2',
        minutesAgo: 234,
      },
      {
        refId: 'bt-4',
        senderType: 'agent',
        senderName: 'developer',
        content: "Already on it. The fix is straightforward — just need to register @fastify/cors before routes. Should be done in 30 minutes.",
        replyTo: 'bt-3',
        minutesAgo: 231,
      },
      {
        refId: 'bt-5',
        senderType: 'user',
        senderName: 'user',
        content: "Bug 2 ties into the user model work Devin's doing. @Tessa can you add a regression test for that?",
        replyTo: 'bt-2',
        minutesAgo: 228,
      },
      {
        refId: 'bt-6',
        senderType: 'agent',
        senderName: 'tester',
        content: "Already wrote it. Test ensures `roles: []` returns 422. It's in the integration suite now.",
        replyTo: 'bt-5',
        minutesAgo: 225,
      },
      {
        refId: 'bt-7',
        senderType: 'agent',
        senderName: 'developer',
        content: "CORS fix is deployed. @Tessa can you verify from the dashboard?",
        replyTo: null,
        minutesAgo: 200,
      },
      {
        refId: 'bt-8',
        senderType: 'agent',
        senderName: 'tester',
        content: "Confirmed — all cross-origin requests working. Bug 1 resolved.",
        replyTo: 'bt-7',
        minutesAgo: 195,
      },
    ],
  },
  {
    name: 'Architecture Review',
    participants: ['architect', 'developer'],
    taskTitles: ['Evaluate WebSocket library'],
    messages: [
      {
        refId: 'ar-1',
        senderType: 'user',
        senderName: 'user',
        content: "@Archie @Devin let's discuss the real-time architecture before we commit to a WebSocket library.",
        replyTo: null,
        minutesAgo: 350,
      },
      {
        refId: 'ar-2',
        senderType: 'agent',
        senderName: 'architect',
        content: "I've been benchmarking three options: socket.io, ws, and uWebSockets. socket.io adds ~2ms overhead per message but gives us rooms, namespaces, auto-reconnection, and typed events out of the box.",
        replyTo: 'ar-1',
        minutesAgo: 345,
      },
      {
        refId: 'ar-3',
        senderType: 'agent',
        senderName: 'developer',
        content: "From a DX standpoint, socket.io's typed event system works perfectly with our TypeScript setup. We can define ServerToClientEvents and ClientToServerEvents interfaces.",
        replyTo: 'ar-2',
        minutesAgo: 340,
      },
      {
        refId: 'ar-4',
        senderType: 'user',
        senderName: 'user',
        content: "What about scaling? If we need to support 100+ concurrent users later?",
        replyTo: 'ar-3',
        minutesAgo: 335,
      },
      {
        refId: 'ar-5',
        senderType: 'agent',
        senderName: 'architect',
        content: "socket.io has a Redis adapter for horizontal scaling. We can add it later without changing any application code. For our current single-server setup, it handles 10k+ connections easily.",
        replyTo: 'ar-4',
        minutesAgo: 330,
      },
      {
        refId: 'ar-6',
        senderType: 'agent',
        senderName: 'developer',
        content: "One more thing — socket.io's room system will be perfect for scoping messages to threads. Each thread gets a room, so we only broadcast to relevant clients.",
        replyTo: 'ar-5',
        minutesAgo: 325,
      },
      {
        refId: 'ar-7',
        senderType: 'user',
        senderName: 'user',
        content: "Sold. Let's go with socket.io. @Archie can you document the decision in the ADR?",
        replyTo: 'ar-6',
        minutesAgo: 320,
      },
    ],
  },
  {
    name: 'Onboarding Grumpy',
    participants: ['grunt', 'project_manager'],
    taskTitles: ['Set up CI/CD pipeline'],
    messages: [
      {
        refId: 'og-1',
        senderType: 'user',
        senderName: 'user',
        content: "Hey @Grumpy, welcome to the team! @Pam can you get Grumpy up to speed on what needs doing?",
        replyTo: null,
        minutesAgo: 400,
      },
      {
        refId: 'og-2',
        senderType: 'agent',
        senderName: 'project_manager',
        content: "Welcome Grumpy! Your main responsibilities will be: dependency management, CI/CD setup, build tooling, and general maintenance tasks. I've tagged the CI/CD task to this thread so you can see the requirements.",
        replyTo: 'og-1',
        minutesAgo: 395,
      },
      {
        refId: 'og-3',
        senderType: 'agent',
        senderName: 'grunt',
        content: "Thanks. I've already looked at the repo structure. Nx monorepo with pnpm — good setup. I'll start with a dependency audit and lock file cleanup.",
        replyTo: 'og-2',
        minutesAgo: 390,
      },
      {
        refId: 'og-4',
        senderType: 'agent',
        senderName: 'project_manager',
        content: "Perfect. Once the dependency audit is done, CI/CD pipeline setup is the next priority. We want GitHub Actions with build, lint, and test stages.",
        replyTo: 'og-3',
        minutesAgo: 385,
      },
      {
        refId: 'og-5',
        senderType: 'agent',
        senderName: 'grunt',
        content: "Got it. I'll have the dependency audit done today and start on the GitHub Actions workflow tomorrow. Any specific Node version we're targeting?",
        replyTo: 'og-4',
        minutesAgo: 380,
      },
      {
        refId: 'og-6',
        senderType: 'user',
        senderName: 'user',
        content: "Node 20 LTS. Make sure the workflow caches pnpm dependencies for faster runs.",
        replyTo: 'og-5',
        minutesAgo: 375,
      },
    ],
  },
];

export function seedThreads(db: Database.Database): void {
  const threadCount = (() => {
    try {
      return (db.prepare('SELECT COUNT(*) as cnt FROM threads').get() as { cnt: number }).cnt;
    } catch {
      return 0;
    }
  })();

  if (threadCount > 0) {
    console.log(`Threads already exist (${threadCount}), skipping seed.`);
    return;
  }

  // Build task title → id map
  const tasks = db.prepare('SELECT id, title FROM tasks').all() as { id: string; title: string }[];
  const titleToId = new Map(tasks.map(t => [t.title, t.id]));

  const now = Date.now();
  const insertThread = db.prepare('INSERT INTO threads (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)');
  const insertParticipant = db.prepare('INSERT OR IGNORE INTO thread_participants (id, thread_id, agent_role, added_at) VALUES (?, ?, ?, ?)');
  const insertTaskTag = db.prepare('INSERT OR IGNORE INTO thread_tasks (id, thread_id, task_id, tagged_at) VALUES (?, ?, ?, ?)');
  const insertMessage = db.prepare(
    `INSERT INTO messages (id, sender_type, sender_name, content, thread_id, in_reply_to, attachments, created_at)
     VALUES (?, ?, ?, ?, ?, ?, '[]', ?)`
  );

  let threadCount2 = 0;
  let msgCount = 0;

  for (const seed of SEED_THREADS) {
    const threadId = uuid();
    const createdAt = now - seed.messages[seed.messages.length - 1].minutesAgo * 60 * 1000;

    insertThread.run(threadId, seed.name, createdAt, now);
    threadCount2++;

    for (const role of seed.participants) {
      insertParticipant.run(uuid(), threadId, role, createdAt);
    }

    for (const title of seed.taskTitles) {
      const taskId = titleToId.get(title);
      if (taskId) {
        insertTaskTag.run(uuid(), threadId, taskId, createdAt);
      }
    }

    // Build refId → UUID map for this thread's messages
    const refToUuid = new Map<string, string>();
    for (const msg of seed.messages) {
      refToUuid.set(msg.refId, uuid());
    }

    for (const msg of seed.messages) {
      const msgId = refToUuid.get(msg.refId)!;
      const replyToId = msg.replyTo ? refToUuid.get(msg.replyTo) || null : null;
      const timestamp = now - msg.minutesAgo * 60 * 1000;
      insertMessage.run(msgId, msg.senderType, msg.senderName, msg.content, threadId, replyToId, timestamp);
      msgCount++;
    }
  }

  console.log(`Seeded ${threadCount2} threads with ${msgCount} messages.`);
}
