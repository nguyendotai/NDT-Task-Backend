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

  // notification.md #11 — chuông thông báo cá nhân, gộp mọi Workspace (giống
  // GET /tasks/me không giới hạn theo 1 Workspace), giới hạn 50 bản ghi mới nhất.
  listByRecipient(recipientId: string, unreadOnly?: boolean) {
    return this.prisma.notification.findMany({
      where: {
        recipientId,
        deletedAt: null,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  findActiveById(id: string) {
    return this.prisma.notification.findFirst({
      where: { id, deletedAt: null },
    });
  }

  markRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  markAllRead(recipientId: string) {
    return this.prisma.notification.updateMany({
      where: { recipientId, deletedAt: null, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  softDelete(id: string, deletedBy: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy },
    });
  }
}
