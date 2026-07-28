import { SprintStatus } from '@prisma/client';

export class SprintEntity {
  id: string;
  workspaceId: string;
  name: string;
  goal?: string | null;
  status: SprintStatus;
  startDate?: Date | null;
  endDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
