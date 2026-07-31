import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ChecklistRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Checklist không tự query Task module (tránh phụ thuộc chéo module) — đọc
  // thẳng qua Prisma, giống cách Comment/Attachment/Sprint đã làm.
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

  countByTaskId(taskId: string) {
    return this.prisma.checklistItem.count({ where: { taskId } });
  }

  create(data: { taskId: string; title: string; order: number }) {
    return this.prisma.checklistItem.create({
      data: { ...data, isDone: false, completedAt: null },
    });
  }

  findById(id: string) {
    return this.prisma.checklistItem.findUnique({ where: { id } });
  }

  listByTaskId(taskId: string) {
    return this.prisma.checklistItem.findMany({
      where: { taskId },
      orderBy: { order: 'asc' },
    });
  }

  update(id: string, title: string) {
    return this.prisma.checklistItem.update({ where: { id }, data: { title } });
  }

  setDone(id: string, isDone: boolean) {
    return this.prisma.checklistItem.update({
      where: { id },
      data: { isDone, completedAt: isDone ? new Date() : null },
    });
  }

  async reorder(orderedIds: string[]) {
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.checklistItem.update({
          where: { id },
          data: { order: index },
        }),
      ),
    );
    return this.prisma.checklistItem.findMany({
      where: { id: { in: orderedIds } },
      orderBy: { order: 'asc' },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.checklistItem.delete({ where: { id } });
  }

  // checklist.md #5.5: xóa xong phải cập nhật lại position của các item còn lại.
  async reindexAfterDelete(taskId: string): Promise<void> {
    const items = await this.listByTaskId(taskId);
    await this.prisma.$transaction(
      items.map((item, index) =>
        this.prisma.checklistItem.update({
          where: { id: item.id },
          data: { order: index },
        }),
      ),
    );
  }
}
