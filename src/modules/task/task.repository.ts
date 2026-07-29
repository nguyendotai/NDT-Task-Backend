import { Injectable } from '@nestjs/common';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TaskRepository {
  constructor(private readonly prisma: PrismaService) {}

  findColumnWithWorkspace(columnId: string) {
    return this.prisma.column.findFirst({
      where: { id: columnId, deletedAt: null, board: { deletedAt: null } },
      include: { board: { select: { workspaceId: true } } },
    });
  }

  countActiveTasksInColumn(columnId: string) {
    return this.prisma.task.count({ where: { columnId, deletedAt: null } });
  }

  create(data: {
    columnId: string;
    title: string;
    description?: string;
    priority?: TaskPriority;
    dueDate?: Date;
    order: number;
    createdBy: string;
  }) {
    // Ghi tường minh sprintId/backlogOrder/assigneeId/deletedAt/deletedBy = null:
    // Prisma+MongoDB không match filter nếu field hoàn toàn không tồn tại.
    return this.prisma.task.create({
      data: {
        ...data,
        sprintId: null,
        backlogOrder: null,
        assigneeId: null,
        deletedAt: null,
        deletedBy: null,
      },
    });
  }

  findActiveById(id: string) {
    return this.prisma.task.findFirst({ where: { id, deletedAt: null } });
  }

  update(
    id: string,
    data: {
      title?: string;
      description?: string;
      priority?: TaskPriority;
      status?: TaskStatus;
      dueDate?: Date;
      columnId?: string;
      order?: number;
      assigneeId?: string;
    },
  ) {
    return this.prisma.task.update({ where: { id }, data });
  }

  softDelete(id: string, deletedBy: string) {
    return this.prisma.task.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy },
    });
  }

  async listByWorkspace(workspaceId: string, status?: TaskStatus[]) {
    const board = await this.prisma.board.findFirst({
      where: { workspaceId, deletedAt: null },
    });
    if (!board) return [];

    const columns = await this.prisma.column.findMany({
      where: { boardId: board.id, deletedAt: null },
      select: { id: true },
    });
    const columnIds = columns.map((column) => column.id);
    if (columnIds.length === 0) return [];

    return this.prisma.task.findMany({
      where: {
        columnId: { in: columnIds },
        deletedAt: null,
        ...(status ? { status: { in: status } } : {}),
      },
      orderBy: [{ columnId: 'asc' }, { order: 'asc' }],
    });
  }

  listMine(userId: string, status?: TaskStatus[], taskIds?: string[]) {
    return this.prisma.task.findMany({
      where: {
        assigneeId: userId,
        deletedAt: null,
        ...(status ? { status: { in: status } } : {}),
        ...(taskIds ? { id: { in: taskIds } } : {}),
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  findStar(taskId: string, userId: string) {
    return this.prisma.taskStar.findFirst({ where: { taskId, userId } });
  }

  createStar(taskId: string, userId: string) {
    return this.prisma.taskStar.create({ data: { taskId, userId } });
  }

  deleteStar(taskId: string, userId: string) {
    return this.prisma.taskStar.deleteMany({ where: { taskId, userId } });
  }

  listStarredTaskIds(userId: string) {
    return this.prisma.taskStar.findMany({
      where: { userId },
      select: { taskId: true },
    });
  }

  listStarredTaskIdsAmong(userId: string, taskIds: string[]) {
    return this.prisma.taskStar.findMany({
      where: { userId, taskId: { in: taskIds } },
      select: { taskId: true },
    });
  }
}
