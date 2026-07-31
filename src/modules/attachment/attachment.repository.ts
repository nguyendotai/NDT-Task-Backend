import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AttachmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Attachment không tự query Task module (tránh phụ thuộc chéo module) —
  // đọc thẳng qua Prisma, giống cách Comment/Sprint/Column đã làm.
  findActiveTaskWithWorkspace(taskId: string) {
    return this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true,
        assigneeIds: true,
        column: { select: { board: { select: { workspaceId: true } } } },
      },
    });
  }

  // attachment.md #9: Watcher cũng nhận Notification khi có Attachment mới,
  // giống Assignee.
  listWatcherUserIds(taskId: string) {
    return this.prisma.taskWatcher.findMany({
      where: { taskId },
      select: { userId: true },
    });
  }

  create(data: {
    taskId: string;
    uploaderId: string;
    fileName: string;
    fileUrl: string;
    filePublicId: string;
    fileSize: number;
    mimeType: string;
  }) {
    return this.prisma.attachment.create({
      data: { ...data, deletedAt: null, deletedBy: null },
    });
  }

  findActiveById(id: string) {
    return this.prisma.attachment.findFirst({ where: { id, deletedAt: null } });
  }

  listActiveByTaskId(taskId: string) {
    return this.prisma.attachment.findMany({
      where: { taskId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  softDelete(id: string, deletedBy: string) {
    return this.prisma.attachment.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy },
    });
  }

  // attachment.md #5.4: chỉ cho phép đổi fileName, không đổi fileUrl/fileType/fileSize.
  rename(id: string, fileName: string) {
    return this.prisma.attachment.update({ where: { id }, data: { fileName } });
  }
}
