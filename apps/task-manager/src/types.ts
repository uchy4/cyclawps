import type Database from 'better-sqlite3';
import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@cyclawps/shared';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database.Database;
    io: Server<ClientToServerEvents, ServerToClientEvents>;
  }
}
