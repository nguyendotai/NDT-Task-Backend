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
        assigneeId: true,
        column: { select: { board: { select: { workspaceId: true } } } },
      },
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
}
