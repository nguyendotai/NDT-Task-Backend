import { SprintStatus } from '@prisma/client';

export class SprintEntity {
  id: string;
  workspaceId: string;
  name: string;
  goal?: string | null;
  status: SprintStatus;
  startDate: Date;
  endDate: Date;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
