export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked';
export type TaskPriority = number; // higher = more urgent

export interface Task {
  id: string;
  guid: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedAgent: string | null;
  pipelineStageId: string | null;
  parentTaskId: string | null;
  priority: TaskPriority;
  sortOrder: number;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  assignedAgent?: string;
  parentTaskId?: string;
  priority?: number;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  assignedAgent?: string | null;
  pipelineStageId?: string | null;
  priority?: number;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
}
