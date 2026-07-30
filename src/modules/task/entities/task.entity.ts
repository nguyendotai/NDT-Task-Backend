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
  assigneeId?: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
