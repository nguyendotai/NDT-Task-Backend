import { TaskStatus } from '@prisma/client';

export class ColumnEntity {
  id: string;
  boardId: string;
  name: string;
  order: number;
  mappedStatus: TaskStatus | null;
  createdAt: Date;
  updatedAt: Date;
}
