import { NotificationType } from '@prisma/client';

export class NotificationEntity {
  id: string;
  workspaceId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  isRead: boolean;
  readAt?: Date | null;
  createdAt: Date;
}
