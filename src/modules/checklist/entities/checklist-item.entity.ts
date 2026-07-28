export class ChecklistItemEntity {
  id: string;
  taskId: string;
  title: string;
  isDone: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}
