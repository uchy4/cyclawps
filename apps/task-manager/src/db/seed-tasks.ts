import { v4 as uuid } from 'uuid';
import type Database from 'better-sqlite3';
import { nextGuid } from './guid.js';

interface SeedTask {
  title: string;
  description: string;
  status: string;
  assignedAgent?: string;
  priority: number;
  sortOrder: number;
}

const SEED_TASKS: SeedTask[] = [
  {
    title: 'Design authentication flow',
    description: 'Create wireframes and user flow for the authentication system including SSO support, OAuth2 integration, and password reset flows. Define session management strategy.',
    status: 'todo',
    assignedAgent: 'architect',
    priority: 8,
    sortOrder: 0,
  },
  {
    title: 'Set up CI/CD pipeline',
    description: 'Configure GitHub Actions for automated build, test, lint, and deploy stages. Include staging and production environments with approval gates.',
    status: 'todo',
    priority: 5,
    sortOrder: 1,
  },
  {
    title: 'Evaluate WebSocket library',
    description: 'Compare socket.io vs ws vs uWebSockets for real-time communication features. Benchmark latency, memory usage, and connection scaling.',
    status: 'todo',
    assignedAgent: 'architect',
    priority: 6,
    sortOrder: 2,
  },
  {
    title: 'Implement user model',
    description: 'Create the User database model with email, password hash, roles, and timestamps. Include migration scripts and seed data for development.',
    status: 'in_progress',
    assignedAgent: 'developer',
    priority: 7,
    sortOrder: 0,
  },
  {
    title: 'Write API integration tests',
    description: 'Cover all REST endpoints with integration tests using supertest. Include auth flows, error cases, and edge conditions. Target 80% coverage.',
    status: 'in_progress',
    assignedAgent: 'tester',
    priority: 6,
    sortOrder: 1,
  },
  {
    title: 'Fix CORS preflight headers',
    description: 'CORS preflight requests failing on OPTIONS from the dashboard frontend. Need to configure allowed origins, methods, and headers for cross-origin API access.',
    status: 'blocked',
    assignedAgent: 'developer',
    priority: 9,
    sortOrder: 0,
  },
  {
    title: 'Database schema review',
    description: 'Review and approve the initial database schema design including tables for users, sessions, tasks, and audit logs. Verify indexes and constraints.',
    status: 'done',
    assignedAgent: 'architect',
    priority: 4,
    sortOrder: 0,
  },
  {
    title: 'Project kickoff planning',
    description: 'Break down Q2 roadmap into epics and initial sprint tasks. Define milestones, deliverables, and team capacity allocation.',
    status: 'done',
    assignedAgent: 'project_manager',
    priority: 3,
    sortOrder: 1,
  },
];

export function seedTasks(db: Database.Database): void {
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM tasks').get() as { cnt: number }).cnt;
  if (count > 0) {
    console.log(`Tasks already exist (${count}), skipping seed.`);
    return;
  }

  console.log(`Seeding ${SEED_TASKS.length} example tasks...`);
  const stmt = db.prepare(
    `INSERT INTO tasks (id, guid, title, description, status, assigned_agent, priority, sort_order, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`
  );

  const now = Date.now();
  for (const task of SEED_TASKS) {
    const guid = nextGuid(db);
    stmt.run(uuid(), guid, task.title, task.description, task.status, task.assignedAgent || null, task.priority, task.sortOrder, now, now);
  }
  console.log('Tasks seeded.');
}
