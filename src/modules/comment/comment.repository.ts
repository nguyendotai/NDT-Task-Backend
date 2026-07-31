import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CommentRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Comment không tự query Task module (tránh phụ thuộc chéo module) — đọc
  // thẳng qua Prisma, giống cách SprintRepository/ColumnRepository đã làm.
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

  // comment.md #5.1/notification.md: Watcher cũng nhận Notification khi có
  // Comment mới, giống Assignee.
  listWatcherUserIds(taskId: string) {
    return this.prisma.taskWatcher.findMany({
      where: { taskId },
      select: { userId: true },
    });
  }

  create(data: {
    taskId: string;
    authorId: string;
    content: string;
    mentions?: string[];
  }) {
    return this.prisma.comment.create({
      data: {
        ...data,
        mentions: data.mentions ?? [],
        deletedAt: null,
        deletedBy: null,
      },
    });
  }

  findActiveById(id: string) {
    return this.prisma.comment.findFirst({ where: { id, deletedAt: null } });
  }

  listActiveByTaskId(taskId: string) {
    return this.prisma.comment.findMany({
      where: { taskId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }

  update(id: string, content: string) {
    return this.prisma.comment.update({ where: { id }, data: { content } });
  }

  softDelete(id: string, deletedBy: string) {
    return this.prisma.comment.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy },
    });
  }
}
