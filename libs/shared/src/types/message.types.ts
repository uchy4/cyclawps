export type SenderType = 'agent' | 'user' | 'system';

export interface Attachment {
  name: string;
  url: string;
  size: number;
  type: string;
}

export interface Reaction {
  id: string;
  emoji: string;
  reactor: string;
  createdAt: number;
}

export interface Message {
  id: string;
  senderType: SenderType;
  senderName: string;
  content: string;
  taskId: string | null;
  inReplyTo: string | null;
  attachments: Attachment[];
  reactions: Reaction[];
  createdAt: number;
}

export interface CreateMessageInput {
  senderType: SenderType;
  senderName: string;
  content: string;
  taskId?: string;
  inReplyTo?: string;
  attachments?: Attachment[];
}
