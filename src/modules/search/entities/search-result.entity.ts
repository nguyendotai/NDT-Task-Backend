import { TaskPriority } from '@prisma/client';

export interface TaskSearchResult {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: TaskPriority;
  columnId: string;
  sprintId?: string | null;
  dueDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommentSearchResult {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  createdAt: Date;
}

export interface AttachmentSearchResult {
  id: string;
  taskId: string;
  fileName: string;
  mimeType: string;
  createdAt: Date;
}

export interface MemberSearchResult {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
}

export interface SprintSearchResult {
  id: string;
  name: string;
  status: string;
  startDate: Date;
  endDate: Date;
}

export interface ColumnSearchResult {
  id: string;
  name: string;
  boardId: string;
}

export interface LabelFilterOption {
  name: string;
  color: string;
}

export interface SearchResults {
  tasks: TaskSearchResult[];
  comments: CommentSearchResult[];
  attachments: AttachmentSearchResult[];
  members: MemberSearchResult[];
  sprints: SprintSearchResult[];
  columns: ColumnSearchResult[];
}
