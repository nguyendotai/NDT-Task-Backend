import { TaskPriority, TaskType } from '@prisma/client';

export class TaskEntity {
  id: string;
  columnId: string;
  workspaceId: string;
  workspaceName: string;
  // Dùng để Frontend tự ghép mã Task hiển thị "{workspaceShortCode}-{taskNumber}".
  workspaceShortCode: string;
  sprintId?: string | null;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  // Bổ sung theo yêu cầu (không thuộc field chuẩn task.md) — phân loại Task
  // dùng cho Filter Board/List.
  type: TaskType;
  // Số thứ tự tăng dần riêng theo từng Workspace, cấp lúc tạo Task (xem
  // task.repository.ts create()) — ghép với workspaceShortCode thành mã Task.
  taskNumber: number;
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
