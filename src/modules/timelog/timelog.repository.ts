import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TimeLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Không tự query Workspace/Task module (tránh phụ thuộc chéo) — đọc thẳng
  // qua Prisma, giống cách CommentRepository/ChecklistRepository đã làm.
  findActiveTaskWithWorkspace(taskId: string) {
    return this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true,
        column: { select: { board: { select: { workspaceId: true } } } },
      },
    });
  }

  create(data: {
    taskId: string;
    userId: string;
    hours: number;
    loggedDate: Date;
    note?: string;
  }) {
    return this.prisma.timeLog.create({ data });
  }

  findById(id: string) {
    return this.prisma.timeLog.findUnique({ where: { id } });
  }

  listByTaskId(taskId: string) {
    return this.prisma.timeLog.findMany({
      where: { taskId },
      orderBy: { loggedDate: 'desc' },
    });
  }

  update(
    id: string,
    data: { hours?: number; loggedDate?: Date; note?: string },
  ) {
    return this.prisma.timeLog.update({ where: { id }, data });
  }

  remove(id: string) {
    return this.prisma.timeLog.delete({ where: { id } });
  }
}
