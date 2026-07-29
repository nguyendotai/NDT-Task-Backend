import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { NotificationRepository } from './notification.repository';

export interface NotificationEntry {
  workspaceId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationService {
  constructor(
    private readonly notificationRepository: NotificationRepository,
  ) {}

  async notify(entry: NotificationEntry): Promise<void> {
    await this.notificationRepository.create({
      ...entry,
      metadata: entry.metadata as Prisma.InputJsonValue | undefined,
    });
  }
}
