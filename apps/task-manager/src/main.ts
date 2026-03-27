import 'dotenv/config';
import './types.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { initDb, closeDb } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { registerTaskRoutes } from './routes/tasks.routes.js';
import { registerMessageRoutes } from './routes/messages.routes.js';
import { registerPipelineRoutes } from './routes/pipeline.routes.js';
import { registerAgentRoutes } from './routes/agents.routes.js';
import { registerSocketHandlers } from './ws/socket-handler.js';
import { registerTranscribeRoutes } from './routes/transcribe.routes.js';
import { registerLogRoutes } from './routes/logs.routes.js';
import { registerThreadRoutes } from './routes/threads.routes.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedAgents } from '@app/agents';
import { seedTasks } from './db/seed-tasks.js';
import { seedMessages } from './db/seed-messages.js';
import { seedThreads } from './db/seed-threads.js';
import type { ServerToClientEvents, ClientToServerEvents } from '@app/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

const PORT = parseInt(process.env['TASK_MANAGER_PORT'] || '3001', 10);

async function main() {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, { origin: true });

  // Accept raw audio bodies for /api/transcribe
  fastify.addContentTypeParser(['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'application/octet-stream'], { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  // Initialize database
  const db = initDb();
  runMigrations(db);

  // Seed default agents from YAML files
  seedAgents(db, process.env['AGENTS_PATH'] || path.join(REPO_ROOT, 'agents'));

  // Seed example kanban tasks and messages
  seedTasks(db);
  seedMessages(db);
  seedThreads(db);

  // Decorate fastify with db
  fastify.decorate('db', db);

  // Create socket.io server (will attach after fastify listens)
  const io = new Server<ClientToServerEvents, ServerToClientEvents>({
    cors: { origin: '*' },
  });

  fastify.decorate('io', io);

  // Register routes
  registerTaskRoutes(fastify);
  registerMessageRoutes(fastify);
  registerThreadRoutes(fastify);
  registerPipelineRoutes(fastify);
  registerAgentRoutes(fastify);
  registerTranscribeRoutes(fastify);
  registerLogRoutes(fastify);

  // Serve static dashboard files when running inside Electron (production)
  if (process.env['STATIC_DIR']) {
    const fastifyStatic = await import('@fastify/static');
    await fastify.register(fastifyStatic.default, {
      root: process.env['STATIC_DIR'],
      prefix: '/',
      wildcard: false,
    });
    // SPA fallback: serve index.html for non-API/non-socket routes
    fastify.setNotFoundHandler((req, reply) => {
      if (!req.url.startsWith('/api') && !req.url.startsWith('/socket.io')) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  }

  // Start server
  await fastify.listen({ port: PORT, host: '0.0.0.0' });

  // Attach socket.io to the underlying http server
  io.attach(fastify.server);

  // Register WebSocket handlers
  registerSocketHandlers(io, db);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    io.close();
    await fastify.close();
    closeDb();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  console.log(`Task Manager running on http://localhost:${PORT}`);
  console.log(`WebSocket server attached`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
