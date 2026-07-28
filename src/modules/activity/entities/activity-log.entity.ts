export class ActivityLogEntity {
  id: string;
  workspaceId: string;
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}
