import { TaskPriority } from '@prisma/client';

// Chỉ gắn ở Global Search (search.md #2) — search theo 1 Workspace vẫn trả
// về field này nhưng luôn chỉ có đúng 1 giá trị (Workspace đang search).
export interface WorkspaceRef {
  id: string;
  name: string;
  avatarEmoji: string;
  avatarColor: string;
}

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
  workspace: WorkspaceRef;
}

export interface CommentSearchResult {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  workspace: WorkspaceRef;
}

export interface AttachmentSearchResult {
  id: string;
  taskId: string;
  fileName: string;
  mimeType: string;
  createdAt: Date;
  workspace: WorkspaceRef;
}

export interface MemberSearchResult {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  workspace: WorkspaceRef;
}

export interface SprintSearchResult {
  id: string;
  name: string;
  status: string;
  startDate: Date;
  endDate: Date;
  workspace: WorkspaceRef;
}

export interface ColumnSearchResult {
  id: string;
  name: string;
  boardId: string;
  workspace: WorkspaceRef;
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
