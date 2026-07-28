import { WorkspaceRole } from '@prisma/client';

export class WorkspaceMemberEntity {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  invitedBy?: string | null;
  joinedAt: Date;
}
