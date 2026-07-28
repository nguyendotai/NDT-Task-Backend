import { WorkspaceType } from '@prisma/client';

export class WorkspaceEntity {
  id: string;
  name: string;
  type: WorkspaceType;
  description?: string | null;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}
