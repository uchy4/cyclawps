export interface Thread {
  id: string;
  name: string;
  participants: ThreadParticipant[];
  taskTags: ThreadTaskTag[];
  createdAt: number;
  updatedAt: number;
}

export interface ThreadParticipant {
  id: string;
  threadId: string;
  agentRole: string;
  addedAt: number;
}

export interface ThreadTaskTag {
  id: string;
  threadId: string;
  taskId: string;
  taskGuid: string;
  taskTitle: string;
  taggedAt: number;
}

export interface CreateThreadInput {
  name: string;
  participantRoles?: string[];
  taskIds?: string[];
}

export interface UpdateThreadInput {
  name?: string;
}
