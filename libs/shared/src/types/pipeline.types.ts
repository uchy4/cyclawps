export interface PipelineStage {
  id: string;
  agent: string;
  description?: string;
  autoTransition: boolean;
  approvalMessage?: string;
}

export interface PipelineTransition {
  from: string;
  to: string;
}

export interface PipelineConfig {
  name: string;
  description?: string;
  stages: PipelineStage[];
  transitions: PipelineTransition[];
}

export interface PipelineConfigRecord {
  id: string;
  name: string;
  configYaml: string;
  isActive: boolean;
  createdAt: number;
}

export type PipelineRunStatus = 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'failed';

export interface PipelineRunState {
  taskId: string;
  currentStageId: string;
  status: PipelineRunStatus;
}
