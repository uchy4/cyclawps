import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@agents-manager/shared';

interface PendingAuth {
  resolve: (approved: boolean) => void;
}

export class AuthorizationGate {
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private pendingAuths: Map<string, PendingAuth> = new Map();

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.io = io;
    this.setupListeners();
  }

  private setupListeners(): void {
    this.io.on('connection', (socket) => {
      socket.on('pipeline:authorize', (data) => {
        const key = this.getKey(data.taskId, data.stageId);
        const pending = this.pendingAuths.get(key);
        if (pending) {
          pending.resolve(data.approved);
          this.pendingAuths.delete(key);
        }
      });
    });
  }

  private getKey(taskId: string, stageId: string): string {
    return `${taskId}:${stageId}`;
  }

  /**
   * Wait for user authorization for a pipeline stage.
   * Returns a promise that resolves to true (approved) or false (denied).
   */
  waitForAuthorization(taskId: string, stageId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const key = this.getKey(taskId, stageId);
      this.pendingAuths.set(key, { resolve });

      // Timeout after 30 minutes (auto-deny)
      setTimeout(() => {
        if (this.pendingAuths.has(key)) {
          this.pendingAuths.delete(key);
          resolve(false);
        }
      }, 30 * 60 * 1000);
    });
  }
}
