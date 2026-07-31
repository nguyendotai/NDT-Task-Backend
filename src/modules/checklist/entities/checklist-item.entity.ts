export class ChecklistItemEntity {
  id: string;
  taskId: string;
  title: string;
  isDone: boolean;
  order: number;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
