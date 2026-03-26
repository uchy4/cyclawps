export type AgentRole = string; // dynamic, not enum

export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AgentConfig {
  id: string;
  role: string;
  name: string;
  displayName: string | null;
  description: string;
  systemPrompt: string;
  model: string;
  apiKeyEnv: string;
  maxTurns: number;
  tools: string[];
  loggingEnabled: boolean;
  accentColor: string | null;
  isSeeded: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface CreateAgentConfigInput {
  role: string;
  name: string;
  displayName?: string;
  description?: string;
  systemPrompt: string;
  model?: string;
  apiKeyEnv?: string;
  maxTurns?: number;
  tools?: string[];
  loggingEnabled?: boolean;
  accentColor?: string;
}

export interface UpdateAgentConfigInput {
  name?: string;
  displayName?: string;
  description?: string;
  systemPrompt?: string;
  model?: string;
  apiKeyEnv?: string;
  maxTurns?: number;
  tools?: string[];
  loggingEnabled?: boolean;
  accentColor?: string;
}

export interface AgentRun {
  id: string;
  agentRole: string;
  taskId: string;
  status: AgentRunStatus;
  prompt: string;
  result: string | null;
  sessionId: string | null;
  tokensUsed: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
}
