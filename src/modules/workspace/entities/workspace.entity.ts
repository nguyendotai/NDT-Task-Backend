import { WorkspaceType, WorkspaceVisibility } from '@prisma/client';

export class WorkspaceEntity {
  id: string;
  name: string;
  type: WorkspaceType;
  description?: string | null;
  ownerId: string;
  shortCode: string;
  avatarEmoji: string;
  avatarColor: string;
  visibility: WorkspaceVisibility;
  createdAt: Date;
  updatedAt: Date;
}
