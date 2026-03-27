import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type Database from 'better-sqlite3';
import type { PipelineConfig, PipelineStage, PipelineTransition } from '@cyclawps/shared';
import { AgentRunner } from './agent-runner.js';
import { AuthorizationGate } from './authorization.js';
import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@cyclawps/shared';

export class PipelineEngine {
  private config: PipelineConfig | null = null;
  private stageMap: Map<string, PipelineStage> = new Map();
  private transitionMap: Map<string, string> = new Map(); // from -> to
  private agentRunner: AgentRunner;
  private authGate: AuthorizationGate;
  private db: Database.Database;
  private io: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(
    db: Database.Database,
    io: Server<ClientToServerEvents, ServerToClientEvents>
  ) {
    this.db = db;
    this.io = io;
    this.agentRunner = new AgentRunner(db, io);
    this.authGate = new AuthorizationGate(io);
  }

  /**
   * Load pipeline config from YAML file or database.
   */
  loadFromFile(filePath?: string): void {
    const resolvedPath = filePath || path.join(process.cwd(), 'pipeline.config.yaml');
    if (!fs.existsSync(resolvedPath)) {
      console.warn(`Pipeline config not found at ${resolvedPath}`);
      return;
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    this.config = yaml.load(content) as PipelineConfig;
    this.buildMaps();
    console.log(`Pipeline loaded: ${this.config.name} (${this.config.stages.length} stages)`);
  }

  /**
   * Load pipeline config from the database (active config).
   */
  loadFromDb(): void {
    const row = this.db.prepare('SELECT * FROM pipeline_configs WHERE is_active = 1').get() as Record<string, unknown> | undefined;
    if (!row) {
      console.warn('No active pipeline config in database, falling back to file');
      this.loadFromFile();
      return;
    }

    this.config = yaml.load(row['config_yaml'] as string) as PipelineConfig;
    this.buildMaps();
    console.log(`Pipeline loaded from DB: ${this.config.name}`);
  }

  private buildMaps(): void {
    if (!this.config) return;

    this.stageMap.clear();
    this.transitionMap.clear();

    for (const stage of this.config.stages) {
      this.stageMap.set(stage.id, stage);
    }

    for (const transition of this.config.transitions) {
      this.transitionMap.set(transition.from, transition.to);
    }
  }

  /**
   * Get the first stage in the pipeline.
   */
  getFirstStage(): PipelineStage | null {
    if (!this.config || this.config.stages.length === 0) return null;
    return this.config.stages[0];
  }

  /**
   * Get the next stage after the given stage.
   */
  getNextStage(currentStageId: string): PipelineStage | null {
    const nextId = this.transitionMap.get(currentStageId);
    if (!nextId || nextId === 'done') return null;
    return this.stageMap.get(nextId) || null;
  }

  /**
   * Execute the pipeline for a given task.
   */
  async executePipeline(taskId: string): Promise<void> {
    if (!this.config) {
      throw new Error('Pipeline not loaded. Call loadFromFile() or loadFromDb() first.');
    }

    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, unknown> | undefined;
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    let currentStage = this.getFirstStage();

    try {
      while (currentStage) {
        const stageId = currentStage.id;
        const agentRole = currentStage.agent;

        console.log(`Pipeline: executing stage "${stageId}" with agent "${agentRole}" for task ${taskId}`);

        // Update task with current stage
        this.db.prepare('UPDATE tasks SET pipeline_stage_id = ?, status = ?, assigned_agent = ?, updated_at = ? WHERE id = ?')
          .run(stageId, 'in_progress', agentRole, Date.now(), taskId);

        // Emit stage update
        this.io.emit('pipeline:stage', { taskId, stageId, status: 'running' });

        // Invoke the agent
        const result = await this.agentRunner.run(agentRole, taskId);

        if (!result.success) {
          console.error(`Pipeline: stage "${stageId}" failed for task ${taskId}`);
          this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
            .run('blocked', Date.now(), taskId);
          this.io.emit('pipeline:stage', { taskId, stageId, status: 'failed' });
          return;
        }

        this.io.emit('pipeline:stage', { taskId, stageId, status: 'completed' });

        // Determine next stage
        const nextStage = this.getNextStage(stageId);

        if (!nextStage) {
          // Pipeline complete
          this.db.prepare('UPDATE tasks SET status = ?, pipeline_stage_id = NULL, assigned_agent = NULL, updated_at = ? WHERE id = ?')
            .run('done', Date.now(), taskId);
          this.io.emit('pipeline:completed', { taskId });
          console.log(`Pipeline: completed for task ${taskId}`);
          return;
        }

        // Check if next stage requires authorization
        if (!nextStage.autoTransition) {
          const approvalMessage = nextStage.approvalMessage || `Approve transition to stage "${nextStage.id}"?`;

          this.io.emit('pipeline:auth_required', {
            taskId,
            stageId: nextStage.id,
            description: approvalMessage,
          });

          this.io.emit('pipeline:stage', { taskId, stageId: nextStage.id, status: 'awaiting_approval' });

          console.log(`Pipeline: waiting for authorization for stage "${nextStage.id}"`);
          const approved = await this.authGate.waitForAuthorization(taskId, nextStage.id);

          if (!approved) {
            console.log(`Pipeline: authorization denied for stage "${nextStage.id}", stopping`);
            this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
              .run('blocked', Date.now(), taskId);
            return;
          }
        }

        currentStage = nextStage;
      }
    } catch (error) {
      const stageId = currentStage?.id ?? 'unknown';
      console.error(`Pipeline: unexpected error in stage "${stageId}" for task ${taskId}:`, error);
      this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?')
        .run('blocked', Date.now(), taskId);
      this.io.emit('pipeline:stage', { taskId, stageId, status: 'failed' });
    }
  }
}
