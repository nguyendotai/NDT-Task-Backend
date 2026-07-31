import { TaskPriority } from '@prisma/client';

export class TaskEntity {
  id: string;
  columnId: string;
  workspaceId: string;
  workspaceName: string;
  sprintId?: string | null;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  // task.md #4: mirror tên Column hiện tại — không còn enum cố định.
  status: string;
  order: number;
  backlogOrder?: number | null;
  startDate?: Date | null;
  dueDate?: Date | null;
  // task.md #3: nhiều người được giao cùng lúc (theo quyết định của bạn,
  // thay cho assigneeId 1 người trước đây).
  assigneeIds: string[];
  storyPoints?: number | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
