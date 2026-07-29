import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    workspaceId: string;
    recipientId: string;
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    // Ghi tường minh readAt/deletedAt/deletedBy = null: Prisma+MongoDB không
    // match filter `deletedAt: null` nếu field hoàn toàn không tồn tại trong document.
    return this.prisma.notification.create({
      data: {
        ...data,
        isRead: false,
        readAt: null,
        deletedAt: null,
        deletedBy: null,
      },
    });
  }
}
