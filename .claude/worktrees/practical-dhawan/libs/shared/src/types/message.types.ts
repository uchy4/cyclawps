export type SenderType = 'agent' | 'user' | 'system';

export interface Message {
  id: string;
  senderType: SenderType;
  senderName: string;
  content: string;
  taskId: string | null;
  inReplyTo: string | null;
  createdAt: number;
}

export interface CreateMessageInput {
  senderType: SenderType;
  senderName: string;
  content: string;
  taskId?: string;
  inReplyTo?: string;
}
