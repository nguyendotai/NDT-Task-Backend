import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class LabelRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Label không tự query Task module (tránh phụ thuộc chéo module) — đọc
  // thẳng qua Prisma, giống cách Comment/Attachment/Checklist đã làm.
  findActiveTaskWithWorkspace(taskId: string) {
    return this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true,
        createdBy: true,
        assigneeIds: true,
        column: { select: { board: { select: { workspaceId: true } } } },
      },
    });
  }

  create(data: { taskId: string; name: string; color: string }) {
    return this.prisma.label.create({ data });
  }

  findById(id: string) {
    return this.prisma.label.findUnique({ where: { id } });
  }

  listByTaskId(taskId: string) {
    return this.prisma.label.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });
  }

  update(id: string, data: { name?: string; color?: string }) {
    return this.prisma.label.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.label.delete({ where: { id } });
  }
}
