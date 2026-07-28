import { InvitationStatus, WorkspaceRole } from '@prisma/client';

export class WorkspaceInvitationEntity {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  status: InvitationStatus;
  invitedBy: string;
  expiresAt: Date;
  createdAt: Date;
}
